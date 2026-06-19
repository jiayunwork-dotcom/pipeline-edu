import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InstructionParserService, ParseError } from '../../services/instruction-parser.service';
import { PipelineSimulatorService, SimulatorConfig } from '../../services/pipeline-simulator.service';
import {
  PipelineModel, PipelineTimeline, PipelineStage, PipelineTimelineCell,
  HazardType, ForwardingPath, getPipelineStages, PIPELINE_STAGES_5, PIPELINE_STAGES_7
} from '../../models/register.model';
import { BranchPredictionStrategy } from '../../models/branch-prediction.model';
import { PerformanceStats } from '../../models/performance.model';
import { Instruction } from '../../models/instruction.model';

interface GanttCell {
  stage: PipelineStage | 'BUBBLE' | null;
  isBubble: boolean;
  isFlushed: boolean;
  hasForwarding: boolean;
  hazardType: HazardType | null;
}

interface TooltipData {
  visible: boolean;
  x: number;
  y: number;
  instructionText: string;
  stage: string;
  cycle: number;
  hazardType: HazardType | null;
  isBubble: boolean;
  isFlushed: boolean;
  hasForwarding: boolean;
}

const STAGE_COLORS_5: Record<string, string> = {
  'IF': '#a8d8f0',
  'ID': '#b8e6b8',
  'EX': '#f5c89a',
  'MEM': '#d4a6d4',
  'WB': '#f0a8a8'
};

const STAGE_COLORS_7: Record<string, string> = {
  'IF1': '#85c1e9',
  'IF2': '#a8d8f0',
  'ID': '#b8e6b8',
  'EX1': '#f0b375',
  'EX2': '#f5c89a',
  'MEM': '#d4a6d4',
  'WB': '#f0a8a8'
};

const STAGE_LABELS: Record<string, string> = {
  'IF': '取指',
  'IF1': '取指1',
  'IF2': '取指2',
  'ID': '译码',
  'EX': '执行',
  'EX1': '执行1',
  'EX2': '执行2',
  'MEM': '访存',
  'WB': '写回'
};

@Component({
  selector: 'app-gantt-timeline',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="gantt-container">
      <div class="card config-card">
        <div class="config-area">
          <div class="instruction-input-section">
            <div class="card-title">指令输入</div>
            <div *ngIf="parseErrors.length > 0" class="parse-errors">
              <div class="text-danger mb-2"><strong>语法错误：</strong></div>
              <div *ngFor="let err of parseErrors" class="error-item">
                第 {{err.line}} 行: {{err.message}}
              </div>
            </div>
            <textarea
              [(ngModel)]="assemblyCode"
              class="code-editor"
              placeholder="在此输入 RISC-V 汇编代码...

示例:
ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2
SW x3, 0(x0)
LW x4, 0(x0)"
              rows="10"
            ></textarea>
          </div>

          <div class="config-controls-section">
            <div class="card-title">配置面板</div>

            <div class="config-row">
              <label>流水线模型</label>
              <select [(ngModel)]="config.model">
                <option value="5-stage">5级 (经典)</option>
                <option value="7-stage">7级 (超流水)</option>
              </select>
            </div>

            <div class="config-row">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="config.enableForwarding">
                启用数据转发 (旁路)
              </label>
            </div>

            <div class="config-row">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="config.enableStallInsertion">
                自动插入气泡
              </label>
            </div>

            <div class="config-row">
              <label>分支预测策略</label>
              <select [(ngModel)]="branchPredictionValue" (ngModelChange)="onBranchPredictionChange()">
                <option value="none">不使用</option>
                <option value="STATIC_NOT_TAKEN">静态 - 总是不跳转</option>
                <option value="STATIC_TAKEN">静态 - 总是跳转</option>
                <option value="ONE_BIT">1-bit 动态预测</option>
                <option value="TWO_BIT">2-bit 饱和计数器</option>
                <option value="BTB">BTB 分支目标缓冲</option>
              </select>
            </div>

            <button (click)="generateTimeline()" class="generate-btn">
              📊 生成时序图
            </button>

            <button (click)="loadExample()" class="example-btn">
              📋 加载示例
            </button>
          </div>
        </div>
      </div>

      <div class="card timeline-card" *ngIf="timeline">
        <div class="timeline-header-bar">
          <div class="card-title no-margin">执行时序图 (Gantt)</div>
          <div class="cycle-stepper">
            <button class="step-btn" (click)="stepPrev()" [disabled]="highlightedCycle <= 1">◀ 上一步</button>
            <span class="cycle-display">周期 {{highlightedCycle}} / {{totalCycles}}</span>
            <button class="step-btn" (click)="stepNext()" [disabled]="highlightedCycle >= totalCycles">下一步 ▶</button>
          </div>
        </div>

        <div class="gantt-legend">
          <div class="legend-item" *ngFor="let stage of displayStages">
            <span class="legend-color" [style.background]="getStageColor(stage)"></span>
            <span>{{stage}} - {{getStageLabel(stage)}}</span>
          </div>
          <div class="legend-item">
            <span class="legend-color stall-color"></span>
            <span>气泡 (Stall)</span>
          </div>
          <div class="legend-item">
            <span class="legend-color flush-color"></span>
            <span>冲刷 (Flush)</span>
          </div>
          <div class="legend-item">
            <span class="forward-icon">↗</span>
            <span>数据转发</span>
          </div>
        </div>

        <div class="gantt-scroll-wrapper" #scrollWrapper>
          <div class="gantt-grid-wrapper">
            <div class="gantt-left-fixed">
              <div class="gantt-corner-cell">指令 \ 周期</div>
              <div
                *ngFor="let instr of instructions; let i = index"
                class="gantt-instruction-label"
                [class.highlighted]="highlightedInstruction === i"
                (click)="toggleInstructionHighlight(i)"
              >
                <span class="instr-index">{{i + 1}}.</span>
                <span class="instr-text" [class.bold]="highlightedInstruction === i">
                  {{parser.formatInstruction(instr)}}
                </span>
              </div>
            </div>

            <div class="gantt-right-scrollable">
              <div class="gantt-cycles-header">
                <div
                  *ngFor="let c of cycleNumbers"
                  class="gantt-cycle-header"
                  [class.highlighted-cycle]="highlightedCycle === c"
                >
                  {{c}}
                </div>
              </div>

              <svg class="gantt-svg" [attr.width]="svgWidth" [attr.height]="svgHeight">
                <defs>
                  <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="8" height="8">
                    <path d="M0,8 l8,-8" stroke="#adb5bd" stroke-width="1.5"/>
                  </pattern>
                  <pattern id="flushHatch" patternUnits="userSpaceOnUse" width="8" height="8">
                    <path d="M0,8 l8,-8" stroke="#e74c3c" stroke-width="1.5"/>
                  </pattern>
                  <marker id="forwardArrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#27ae60"/>
                  </marker>
                </defs>

                <g *ngIf="highlightedCycle > 0">
                  <rect
                    [attr.x]="cycleX(highlightedCycle) - CELL_WIDTH/2"
                    y="0"
                    [attr.width]="CELL_WIDTH"
                    [attr.height]="svgHeight"
                    fill="#e3f2fd"
                    opacity="0.5"
                  />
                  <line
                    [attr.x1]="cycleX(highlightedCycle) - CELL_WIDTH/2"
                    y1="0"
                    [attr.x2]="cycleX(highlightedCycle) - CELL_WIDTH/2"
                    [attr.y2]="svgHeight"
                    stroke="#1976d2"
                    stroke-width="2"
                  />
                  <line
                    [attr.x1]="cycleX(highlightedCycle) + CELL_WIDTH/2"
                    y1="0"
                    [attr.x2]="cycleX(highlightedCycle) + CELL_WIDTH/2"
                    [attr.y2]="svgHeight"
                    stroke="#1976d2"
                    stroke-width="2"
                  />
                </g>

                <g *ngFor="let instr of instructions; let i = index">
                  <ng-container *ngIf="highlightedInstruction === i">
                    <rect
                      x="0"
                      [attr.y]="rowY(i) - CELL_HEIGHT/2"
                      [attr.width]="svgWidth"
                      [attr.height]="CELL_HEIGHT"
                      fill="#fff3cd"
                      opacity="0.4"
                    />
                  </ng-container>

                  <g *ngFor="let c of cycleNumbers">
                    <ng-container *ngIf="getGanttCell(i, c) as cell">
                      <rect
                        [attr.x]="cellX(c)"
                        [attr.y]="cellY(i)"
                        [attr.width]="CELL_WIDTH - CELL_PADDING"
                        [attr.height]="CELL_HEIGHT - CELL_PADDING"
                        [attr.rx]="4"
                        [attr.ry]="4"
                        [attr.fill]="getCellFill(cell)"
                        [attr.stroke]="cell.isFlushed ? '#e74c3c' : (cell.isBubble ? '#adb5bd' : 'none')"
                        [attr.stroke-dasharray]="cell.isFlushed ? '4,2' : 'none'"
                        [attr.stroke-width]="cell.isFlushed ? 2 : 1"
                        class="gantt-cell"
                        (mouseenter)="showTooltip($event, i, c, cell)"
                        (mouseleave)="hideTooltip()"
                        (click)="toggleInstructionHighlight(i)"
                      />

                      <text
                        *ngIf="cell.isBubble"
                        [attr.x]="cellX(c) + (CELL_WIDTH - CELL_PADDING) / 2"
                        [attr.y]="cellY(i) + (CELL_HEIGHT - CELL_PADDING) / 2 + 4"
                        text-anchor="middle"
                        font-size="10"
                        fill="#6c757d"
                        font-weight="600"
                        class="non-interactive"
                      >
                        stall
                      </text>

                      <text
                        *ngIf="!cell.isBubble && cell.stage"
                        [attr.x]="cellX(c) + (CELL_WIDTH - CELL_PADDING) / 2"
                        [attr.y]="cellY(i) + (CELL_HEIGHT - CELL_PADDING) / 2 + 4"
                        text-anchor="middle"
                        font-size="10"
                        fill="#2c3e50"
                        font-weight="600"
                        class="non-interactive"
                      >
                        {{cell.stage}}
                      </text>

                      <text
                        *ngIf="cell.isFlushed && !cell.isBubble"
                        [attr.x]="cellX(c) + (CELL_WIDTH - CELL_PADDING) / 2"
                        [attr.y]="cellY(i) + CELL_HEIGHT - 6"
                        text-anchor="middle"
                        font-size="8"
                        fill="#e74c3c"
                        font-weight="700"
                        class="non-interactive"
                      >
                        flush
                      </text>

                      <g *ngIf="cell.hasForwarding">
                        <path
                          *ngFor="let idx of getForwardingArrowArray(getForwardingCount(i, c))"
                          [attr.d]="getForwardingArrowPath(c, i, idx)"
                          fill="#27ae60"
                          stroke="#1e8449"
                          stroke-width="1"
                          class="non-interactive"
                        />
                      </g>
                    </ng-container>
                  </g>
                </g>

                <g>
                  <line
                    *ngFor="let c of cycleNumbers"
                    [attr.x1]="cycleX(c) - CELL_WIDTH/2"
                    y1="0"
                    [attr.x2]="cycleX(c) - CELL_WIDTH/2"
                    [attr.y2]="svgHeight"
                    stroke="#e9ecef"
                    stroke-width="1"
                  />
                  <line
                    *ngFor="let instr of instructions; let i = index"
                    x1="0"
                    [attr.y1]="rowY(i) - CELL_HEIGHT/2"
                    [attr.x2]="svgWidth"
                    [attr.y2]="rowY(i) - CELL_HEIGHT/2"
                    stroke="#e9ecef"
                    stroke-width="1"
                  />
                </g>
              </svg>
            </div>

            <div
              *ngIf="tooltip.visible"
              class="gantt-tooltip"
              [style.left.px]="tooltip.x"
              [style.top.px]="tooltip.y"
            >
              <div class="tooltip-title"><strong>{{tooltip.instructionText}}</strong></div>
              <div class="tooltip-row">周期: <strong>{{tooltip.cycle}}</strong></div>
              <div class="tooltip-row">阶段: <strong>{{tooltip.stage}}</strong></div>
              <div *ngIf="tooltip.isBubble" class="tooltip-row stall">类型: 流水线气泡(停顿)</div>
              <div *ngIf="tooltip.isFlushed" class="tooltip-row flush">已被分支冲刷</div>
              <div *ngIf="tooltip.hasForwarding" class="tooltip-row forward">数据转发已启用</div>
              <div *ngIf="tooltip.hazardType" class="tooltip-row hazard">
                冒险: <strong>{{getHazardTypeName(tooltip.hazardType)}}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">总指令数</span>
            <span class="stat-value">{{stats?.totalInstructions || 0}}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">总周期数</span>
            <span class="stat-value">{{stats?.totalCycles || 0}}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">CPI</span>
            <span class="stat-value">{{stats ? stats.cpi.toFixed(2) : '0.00'}}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Stall周期</span>
            <span class="stat-value">{{stats?.totalStallCycles || 0}}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">转发次数</span>
            <span class="stat-value">{{stats?.forwardingUsed || 0}}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">冲刷次数</span>
            <span class="stat-value">{{flushCount}}</span>
          </div>
        </div>
      </div>

      <div class="card empty-card" *ngIf="!timeline">
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>输入指令并点击"生成时序图"查看执行时序</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .gantt-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 12px;
    }

    .card-title.no-margin {
      margin-bottom: 0;
    }

    .config-card {
      padding: 20px;
    }

    .config-area {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 20px;
    }

    @media (max-width: 900px) {
      .config-area {
        grid-template-columns: 1fr;
      }
    }

    .code-editor {
      width: 100%;
      padding: 12px;
      border: 1px solid #ced4da;
      border-radius: 6px;
      font-family: 'Courier New', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.6;
      resize: vertical;
      background: #fafbfc;
      box-sizing: border-box;
    }

    .code-editor:focus {
      outline: none;
      border-color: #3498db;
      box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.15);
    }

    .config-row {
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .config-row select {
      flex: 1;
      max-width: 180px;
      padding: 6px 10px;
      border: 1px solid #ced4da;
      border-radius: 4px;
      font-size: 13px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-weight: 400;
      font-size: 13px;
    }

    .checkbox-label input {
      width: 16px;
      height: 16px;
    }

    .generate-btn {
      width: 100%;
      margin-top: 8px;
      padding: 10px 16px;
      background: linear-gradient(135deg, #27ae60, #2ecc71);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .generate-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
    }

    .example-btn {
      width: 100%;
      margin-top: 8px;
      padding: 8px 16px;
      background: #f8f9fa;
      color: #495057;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .example-btn:hover {
      background: #e9ecef;
    }

    .parse-errors {
      padding: 10px 12px;
      background: #fde8e8;
      border: 1px solid #f5c6cb;
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .text-danger {
      color: #721c24;
    }

    .error-item {
      font-size: 12px;
      padding: 2px 0;
      color: #721c24;
    }

    .timeline-card {
      padding: 20px;
    }

    .timeline-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .cycle-stepper {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .step-btn {
      padding: 6px 12px;
      background: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }

    .step-btn:hover:not(:disabled) {
      background: #2980b9;
    }

    .step-btn:disabled {
      background: #bdc3c7;
      cursor: not-allowed;
    }

    .cycle-display {
      padding: 6px 14px;
      background: #e8f4fd;
      color: #1976d2;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      min-width: 100px;
      text-align: center;
    }

    .gantt-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px 20px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #495057;
    }

    .legend-color {
      width: 20px;
      height: 16px;
      border-radius: 3px;
      border: 1px solid rgba(0,0,0,0.1);
    }

    .stall-color {
      background: repeating-linear-gradient(
        45deg,
        #dee2e6,
        #dee2e6 3px,
        #ced4da 3px,
        #ced4da 6px
      );
    }

    .flush-color {
      background: white;
      border: 2px dashed #e74c3c;
    }

    .forward-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 16px;
      color: #27ae60;
      font-weight: 700;
      font-size: 14px;
    }

    .gantt-scroll-wrapper {
      position: relative;
      max-height: 600px;
      overflow: auto;
      border: 1px solid #e9ecef;
      border-radius: 6px;
    }

    .gantt-grid-wrapper {
      position: relative;
      display: flex;
    }

    .gantt-left-fixed {
      position: sticky;
      left: 0;
      z-index: 10;
      background: white;
      border-right: 2px solid #dee2e6;
    }

    .gantt-corner-cell {
      height: 36px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: #495057;
      background: #f8f9fa;
      border-bottom: 2px solid #dee2e6;
      width: 200px;
    }

    .gantt-instruction-label {
      height: 40px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      background: #fafbfc;
      border-bottom: 1px solid #e9ecef;
      cursor: pointer;
      transition: background 0.15s;
      width: 200px;
      box-sizing: border-box;
    }

    .gantt-instruction-label:hover {
      background: #e9ecef;
    }

    .gantt-instruction-label.highlighted {
      background: #fff3cd;
    }

    .instr-index {
      color: #868e96;
      font-weight: 500;
      min-width: 24px;
    }

    .instr-text {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .instr-text.bold {
      font-weight: 700;
      color: #2c3e50;
    }

    .gantt-right-scrollable {
      position: relative;
    }

    .gantt-cycles-header {
      display: flex;
      height: 36px;
      border-bottom: 2px solid #dee2e6;
      background: #f8f9fa;
      position: sticky;
      top: 0;
      z-index: 5;
    }

    .gantt-cycle-header {
      width: 52px;
      min-width: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: #6c757d;
      border-right: 1px solid #e9ecef;
    }

    .gantt-cycle-header.highlighted-cycle {
      background: #bbdefb;
      color: #1976d2;
    }

    .gantt-svg {
      display: block;
    }

    .gantt-cell {
      cursor: pointer;
      transition: filter 0.15s;
    }

    .gantt-cell:hover {
      filter: brightness(1.08);
    }

    .non-interactive {
      pointer-events: none;
      user-select: none;
    }

    .gantt-tooltip {
      position: absolute;
      z-index: 100;
      background: #2c3e50;
      color: white;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.6;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      max-width: 240px;
    }

    .tooltip-title {
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.15);
      font-size: 13px;
    }

    .tooltip-row {
      margin: 2px 0;
    }

    .tooltip-row.stall {
      color: #ffc107;
    }

    .tooltip-row.flush {
      color: #e74c3c;
    }

    .tooltip-row.forward {
      color: #2ecc71;
    }

    .tooltip-row.hazard {
      color: #e67e22;
    }

    .stats-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0;
      margin-top: 16px;
      padding: 12px 16px;
      background: linear-gradient(135deg, #f8f9fa, #e9ecef);
      border-radius: 6px;
      border-top: 2px solid #dee2e6;
    }

    .stat-item {
      flex: 1;
      min-width: 100px;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4px 8px;
    }

    .stat-item + .stat-item {
      border-left: 1px solid #dee2e6;
    }

    .stat-label {
      font-size: 11px;
      color: #6c757d;
      margin-bottom: 4px;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 700;
      color: #2c3e50;
    }

    .empty-card {
      padding: 60px 20px;
    }

    .empty-state {
      text-align: center;
      color: #adb5bd;
    }

    .empty-icon {
      font-size: 56px;
      margin-bottom: 16px;
    }

    .empty-state p {
      font-size: 14px;
      margin: 0;
    }
  `]
})
export class GanttTimelineComponent implements OnInit {
  CELL_WIDTH = 52;
  CELL_HEIGHT = 40;
  CELL_PADDING = 4;

  assemblyCode = `ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2
SUB x4, x3, x1
LW x5, 0(x0)
ADD x6, x5, x1`;

  instructions: Instruction[] = [];
  parseErrors: ParseError[] = [];

  config: SimulatorConfig = {
    model: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableDelaySlot: false,
    branchPrediction: null,
    maxCycles: 500
  };

  branchPredictionValue: string = 'none';

  timeline: PipelineTimeline | null = null;
  stats: PerformanceStats | null = null;
  totalCycles = 0;
  cycleNumbers: number[] = [];
  displayStages: PipelineStage[] = [];
  ganttGrid: (GanttCell | null)[][] = [];
  forwardingCycles = new Set<string>();
  forwardingCountByCycle = new Map<string, number>();
  flushCount = 0;

  highlightedInstruction: number | null = null;
  highlightedCycle: number = 0;

  tooltip: TooltipData = {
    visible: false,
    x: 0,
    y: 0,
    instructionText: '',
    stage: '',
    cycle: 0,
    hazardType: null,
    isBubble: false,
    isFlushed: false,
    hasForwarding: false
  };

  svgWidth = 0;
  svgHeight = 0;

  constructor(
    public parser: InstructionParserService,
    private simulator: PipelineSimulatorService
  ) {}

  ngOnInit(): void {
    this.displayStages = getPipelineStages(this.config.model);
  }

  onBranchPredictionChange(): void {
    if (this.branchPredictionValue === 'none') {
      this.config.branchPrediction = null;
    } else {
      this.config.branchPrediction = this.branchPredictionValue as BranchPredictionStrategy;
    }
  }

  parseCode(): void {
    const result = this.parser.parse(this.assemblyCode);
    this.instructions = result.instructions;
    this.parseErrors = result.errors;
  }

  generateTimeline(): void {
    this.parseCode();
    if (this.instructions.length === 0) return;

    this.highlightedInstruction = null;

    this.simulator.initialize(this.instructions, { ...this.config });
    this.timeline = this.simulator.runFullSimulation();
    this.stats = this.simulator.getPerformanceStats();
    this.totalCycles = this.timeline.cycles;
    this.cycleNumbers = Array.from({ length: this.totalCycles }, (_, i) => i + 1);
    this.displayStages = getPipelineStages(this.config.model);
    this.highlightedCycle = this.totalCycles > 0 ? this.totalCycles : 0;

    this.computeForwardingCycles();
    this.computeFlushCount();
    this.buildGanttGrid();

    this.svgWidth = this.totalCycles * this.CELL_WIDTH;
    this.svgHeight = this.instructions.length * this.CELL_HEIGHT;
  }

  private buildGanttGrid(): void {
    const rows = this.instructions.length;
    const cols = this.totalCycles;
    this.ganttGrid = [];

    for (let i = 0; i < rows; i++) {
      const row: (GanttCell | null)[] = [];
      for (let c = 1; c <= cols; c++) {
        row.push(this.buildCell(i, c));
      }
      this.ganttGrid.push(row);
    }
  }

  private buildCell(instrIndex: number, cycle: number): GanttCell | null {
    if (!this.timeline) return null;

    const stages = getPipelineStages(this.config.model);
    let foundStage: PipelineStage | null = null;
    let foundCell: PipelineTimelineCell | null = null;

    for (const stage of stages) {
      const key = `${instrIndex}_${cycle}_${stage}`;
      const cell = this.timeline.cells.get(key);
      const keyP0 = `${instrIndex}_${cycle}_${stage}_p0`;
      const cellP0 = this.timeline.cells.get(keyP0);
      const actualCell = cell || cellP0;

      if (actualCell && actualCell.instructionId !== 'bubble' && !actualCell.isBubble) {
        foundStage = stage;
        foundCell = actualCell;
        break;
      }
    }

    if (!foundCell) {
      return null;
    }

    const isStall = foundCell.stalled === true;

    return {
      stage: isStall ? null : foundStage,
      isBubble: isStall,
      isFlushed: foundCell.flushed || false,
      hasForwarding: this.forwardingCycles.has(`${instrIndex}_${cycle}`),
      hazardType: foundCell.hazardHighlight || null
    };
  }

  private computeForwardingCycles(): void {
    this.forwardingCycles.clear();
    this.forwardingCountByCycle.clear();
    if (!this.timeline) return;

    const instrIndexMap = new Map<string, number>();
    this.instructions.forEach((instr, idx) => {
      instrIndexMap.set(instr.id, idx);
    });

    const exStageName = this.config.model === '7-stage' ? 'EX2' : 'EX';

    for (const path of this.timeline.forwardingPaths) {
      const toIdx = instrIndexMap.get(path.toInstructionId);
      if (toIdx === undefined) continue;

      const stages = getPipelineStages(this.config.model);
      for (let c = 1; c <= this.totalCycles; c++) {
        const key = `${toIdx}_${c}_${exStageName}`;
        if (this.timeline.cells.has(key)) {
          const cycleKey = `${toIdx}_${c}`;
          this.forwardingCycles.add(cycleKey);
          const currentCount = this.forwardingCountByCycle.get(cycleKey) || 0;
          this.forwardingCountByCycle.set(cycleKey, currentCount + 1);
          break;
        }
      }
    }
  }

  private computeFlushCount(): void {
    this.flushCount = 0;
    if (!this.timeline) return;
    const flushedInstrs = new Set<string>();
    this.timeline.cells.forEach(cell => {
      if (cell.flushed && cell.instructionId !== 'bubble') {
        flushedInstrs.add(cell.instructionId);
      }
    });
    this.flushCount = flushedInstrs.size;
  }

  getGanttCell(instrIndex: number, cycle: number): GanttCell | null {
    if (instrIndex >= this.ganttGrid.length) return null;
    if (cycle - 1 >= this.ganttGrid[instrIndex].length) return null;
    return this.ganttGrid[instrIndex][cycle - 1];
  }

  getStageLabel(stage: string): string {
    return STAGE_LABELS[stage] || stage;
  }

  getStageColor(stage: string): string {
    const colors = this.config.model === '7-stage' ? STAGE_COLORS_7 : STAGE_COLORS_5;
    return colors[stage] || '#cccccc';
  }

  getForwardingCount(instrIndex: number, cycle: number): number {
    return this.forwardingCountByCycle.get(`${instrIndex}_${cycle}`) || 0;
  }

  getForwardingArrowArray(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }

  getForwardingArrowPath(cycle: number, row: number, arrowIndex: number = 0): string {
    const baseX = this.cellX(cycle) + this.CELL_WIDTH - this.CELL_PADDING - 14;
    const baseY = this.cellY(row) + 6;
    const x = baseX - arrowIndex * 12;
    const y = baseY;
    return `M ${x} ${y} l 10 0 l 0 -5 l 5 5 l -5 5 l 0 -5 z`;
  }

  getCellFill(cell: GanttCell): string {
    if (cell.isBubble) return 'url(#diagonalHatch)';
    if (cell.isFlushed) return 'url(#flushHatch)';
    if (cell.stage) return this.getStageColor(cell.stage);
    return 'transparent';
  }

  cellX(cycle: number): number {
    return (cycle - 1) * this.CELL_WIDTH + this.CELL_PADDING / 2;
  }

  cellY(row: number): number {
    return row * this.CELL_HEIGHT + this.CELL_PADDING / 2;
  }

  cycleX(cycle: number): number {
    return (cycle - 1) * this.CELL_WIDTH + this.CELL_WIDTH / 2;
  }

  rowY(row: number): number {
    return row * this.CELL_HEIGHT + this.CELL_HEIGHT / 2;
  }

  toggleInstructionHighlight(index: number): void {
    if (this.highlightedInstruction === index) {
      this.highlightedInstruction = null;
    } else {
      this.highlightedInstruction = index;
    }
  }

  stepPrev(): void {
    if (this.highlightedCycle > 1) {
      this.highlightedCycle--;
    }
  }

  stepNext(): void {
    if (this.highlightedCycle < this.totalCycles) {
      this.highlightedCycle++;
    }
  }

  showTooltip(event: MouseEvent, instrIndex: number, cycle: number, cell: GanttCell): void {
    const instr = this.instructions[instrIndex];
    const wrapper = (event.target as HTMLElement).closest('.gantt-scroll-wrapper');
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const x = event.clientX - rect.left + 12;
    const y = event.clientY - rect.top + 12;

    this.tooltip = {
      visible: true,
      x,
      y,
      instructionText: instr ? this.parser.formatInstruction(instr) : '未知指令',
      stage: cell.stage ? `${cell.stage} - ${STAGE_LABELS[cell.stage] || cell.stage}` : '-',
      cycle,
      hazardType: cell.hazardType,
      isBubble: cell.isBubble,
      isFlushed: cell.isFlushed,
      hasForwarding: cell.hasForwarding
    };
  }

  hideTooltip(): void {
    this.tooltip.visible = false;
  }

  getHazardTypeName(type: HazardType | null): string {
    if (!type) return '';
    switch (type) {
      case HazardType.RAW: return 'RAW (写后读)';
      case HazardType.WAR: return 'WAR (读后写)';
      case HazardType.WAW: return 'WAW (写后写)';
      case HazardType.CONTROL: return '控制冒险';
      case HazardType.STRUCTURAL: return '结构冒险';
      default: return '未知';
    }
  }

  loadExample(): void {
    this.assemblyCode = `# 示例: 数据冒险、转发与分支演示
ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2
SUB x4, x3, x1
AND x5, x1, x2
OR x6, x3, x4
SW x6, 0(x0)
LW x7, 0(x0)
ADD x8, x7, x1
BEQ x1, x2, skip
ADDI x9, x0, 1
skip:
ADD x10, x1, x2`;
  }
}
