import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { InstructionParserService, ParseError } from '../../services/instruction-parser.service';
import { PipelineSimulatorService, SimulatorConfig } from '../../services/pipeline-simulator.service';
import { TomasuloService } from '../../services/tomasulo.service';
import { Instruction } from '../../models/instruction.model';
import {
  PipelineModel, PipelineTimeline, ForwardingPath, Hazard, HazardType
} from '../../models/register.model';
import { BranchPredictionStrategy } from '../../models/branch-prediction.model';
import { PerformanceStats } from '../../models/performance.model';
import { LEVELS } from '../../data/levels.data';
import { PipelineTimelineComponent } from '../pipeline-timeline/pipeline-timeline.component';
import { RegisterFileComponent } from '../register-file/register-file.component';
import { PerformanceStatsComponent } from '../performance-stats/performance-stats.component';
import { TomasuloPanelComponent } from '../tomasulo-panel/tomasulo-panel.component';
import { InstructionReorderComponent } from '../instruction-reorder/instruction-reorder.component';
import { TomasuloState } from '../../models/tomasulo.model';

interface SideBySideSimResult {
  timeline: PipelineTimeline | null;
  stats: PerformanceStats | null;
  forwardingPaths: ForwardingPath[];
  hazards: Hazard[];
}

interface DiffRegion {
  startCycle: number;
  endCycle: number;
  color: string;
}

@Component({
  selector: 'app-pipeline-simulator',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    PipelineTimelineComponent, RegisterFileComponent,
    PerformanceStatsComponent, TomasuloPanelComponent,
    InstructionReorderComponent
  ],
  template: `
    <div class="simulator-container">
      <div class="left-panel">
        <div class="card">
          <div class="card-title flex justify-between items-center">
            <span>指令输入</span>
            <button *ngIf="currentLevel" class="secondary" (click)="clearLevel()">
              返回自由模式
            </button>
          </div>

          <div *ngIf="currentLevel" class="level-info">
            <div class="level-badge">
              <span class="badge badge-info">第{{currentLevel.id}}关</span>
              <strong>{{currentLevel.title}}</strong>
            </div>
            <div class="level-desc">{{currentLevel.description}}</div>
            <div class="level-hint">💡 {{currentLevel.hint}}</div>
          </div>

          <div *ngIf="parseErrors.length > 0" class="parse-errors">
            <div class="text-danger mb-2"><strong>语法错误：</strong></div>
            <div *ngFor="let err of parseErrors" class="error-item">
              第 {{err.line}} 行: {{err.message}}
              <code>{{err.rawText}}</code>
            </div>
          </div>

          <textarea
            [disabled]="!!currentLevel && !currentLevelIsEditable"
            [(ngModel)]="assemblyCode"
            (ngModelChange)="onCodeChange()"
            class="code-editor"
            placeholder="在此输入 RISC-V 汇编代码...

示例:
ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2
SW x3, 0(x0)
LW x4, 0(x0)"
            rows="14"
          ></textarea>

          <div class="action-row mt-4">
            <button (click)="runSimulation()" class="success">
              ▶ {{comparisonEnabled ? '生成对比时序图' : '运行模拟'}}
            </button>
            <button (click)="stepSimulation()" [disabled]="!canStep()">
              ⏭ 单步执行
            </button>
            <button (click)="resetSimulation()" class="secondary">
              ↺ 重置
            </button>
            <button (click)="loadExample()">
              📋 加载示例
            </button>
          </div>
        </div>

        <app-instruction-reorder
          *ngIf="!comparisonEnabled"
          [instructions]="instructions"
          [enableForwarding]="configA.enableForwarding"
          (applyInstructions)="onApplyReorderedInstructions($event)"
        ></app-instruction-reorder>

        <div class="card">
          <div class="card-title flex justify-between items-center">
            <span>模拟器配置</span>
            <label class="toggle-switch-label">
              <input type="checkbox" [(ngModel)]="comparisonEnabled" (ngModelChange)="onComparisonToggle()">
              <span class="toggle-slider"></span>
              <span class="toggle-text">启用对比模式</span>
            </label>
          </div>

          <!-- 对比模式：两列配置 -->
          <div *ngIf="comparisonEnabled" class="comparison-config-container">
            <div class="config-column">
              <div class="column-title config-a">🔵 配置 A</div>

              <div class="config-row">
                <label>流水线模型</label>
                <select [(ngModel)]="configA.model" (ngModelChange)="resetSimulation()">
                  <option value="5-stage">5级 (经典)</option>
                  <option value="7-stage">7级 (超流水)</option>
                  <option value="superscalar-2way">超标量 2发射</option>
                </select>
              </div>

              <div class="config-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="configA.enableForwarding">
                  启用数据转发 (旁路)
                </label>
              </div>

              <div class="config-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="configA.enableStallInsertion">
                  自动插入气泡
                </label>
              </div>

              <div class="config-row">
                <label>分支预测策略</label>
                <select [(ngModel)]="branchPredictionA" (ngModelChange)="onBranchChangeA()">
                  <option [value]="'none'">不使用</option>
                  <option [value]="'STATIC_NOT_TAKEN'">静态 - 总是不跳转</option>
                  <option [value]="'STATIC_TAKEN'">静态 - 总是跳转</option>
                  <option [value]="'ONE_BIT'">1-bit 动态预测</option>
                  <option [value]="'TWO_BIT'">2-bit 饱和计数器</option>
                  <option [value]="'BTB'">BTB 分支目标缓冲</option>
                </select>
              </div>
            </div>

            <div class="swap-column">
              <button (click)="swapConfigs()" class="swap-btn" matTooltip="交换配置A和B" title="交换配置A和B">
                ⇄
                <span class="swap-text">交换</span>
              </button>
            </div>

            <div class="config-column">
              <div class="column-title config-b">🟠 配置 B</div>

              <div class="config-row">
                <label>流水线模型</label>
                <select [(ngModel)]="configB.model" (ngModelChange)="resetSimulation()">
                  <option value="5-stage">5级 (经典)</option>
                  <option value="7-stage">7级 (超流水)</option>
                  <option value="superscalar-2way">超标量 2发射</option>
                </select>
              </div>

              <div class="config-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="configB.enableForwarding">
                  启用数据转发 (旁路)
                </label>
              </div>

              <div class="config-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="configB.enableStallInsertion">
                  自动插入气泡
                </label>
              </div>

              <div class="config-row">
                <label>分支预测策略</label>
                <select [(ngModel)]="branchPredictionB" (ngModelChange)="onBranchChangeB()">
                  <option [value]="'none'">不使用</option>
                  <option [value]="'STATIC_NOT_TAKEN'">静态 - 总是不跳转</option>
                  <option [value]="'STATIC_TAKEN'">静态 - 总是跳转</option>
                  <option [value]="'ONE_BIT'">1-bit 动态预测</option>
                  <option [value]="'TWO_BIT'">2-bit 饱和计数器</option>
                  <option [value]="'BTB'">BTB 分支目标缓冲</option>
                </select>
              </div>
            </div>
          </div>

          <!-- 非对比模式：单列配置 -->
          <ng-container *ngIf="!comparisonEnabled">
            <div class="config-row">
              <label>流水线模型</label>
              <select [(ngModel)]="configA.model" (ngModelChange)="resetSimulation()">
                <option value="5-stage">5级 (经典)</option>
                <option value="7-stage">7级 (超流水)</option>
                <option value="superscalar-2way">超标量 2发射</option>
              </select>
            </div>

            <div class="config-row">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="configA.enableForwarding">
                启用数据转发 (旁路)
              </label>
            </div>

            <div class="config-row">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="configA.enableStallInsertion">
                自动插入气泡
              </label>
            </div>

            <div class="config-row">
              <label>分支预测策略</label>
              <select [(ngModel)]="branchPredictionA" (ngModelChange)="onBranchChangeA()">
                <option [value]="'none'">不使用</option>
                <option [value]="'STATIC_NOT_TAKEN'">静态 - 总是不跳转</option>
                <option [value]="'STATIC_TAKEN'">静态 - 总是跳转</option>
                <option [value]="'ONE_BIT'">1-bit 动态预测</option>
                <option [value]="'TWO_BIT'">2-bit 饱和计数器</option>
                <option [value]="'BTB'">BTB 分支目标缓冲</option>
              </select>
            </div>

            <div class="config-row">
              <label class="checkbox-label">
                <input type="checkbox" [(ngModel)]="enableTomasulo" (ngModelChange)="resetSimulation()">
                启用 Tomasulo 乱序执行
              </label>
            </div>
          </ng-container>
        </div>
      </div>

      <div class="center-panel">
        <!-- 对比模式：双图上下展示 + 差异摘要 -->
        <div *ngIf="comparisonEnabled && !enableTomasulo" class="comparison-display">
          <div class="card">
            <div class="card-title flex justify-between items-center">
              <span>时序图对比</span>
              <div class="cycle-info">
                <span class="badge badge-info">当前周期: {{currentCycle}} / {{maxUnifiedCycles}}</span>
                <button class="step-btn" (click)="prevStep()" [disabled]="currentCycle <= 0">◀</button>
                <button class="step-btn" (click)="nextStep()" [disabled]="currentCycle >= maxUnifiedCycles">▶</button>
                <button class="step-btn" (click)="resetStep()" title="重置到第0周期">⟲</button>
              </div>
            </div>

            <!-- 配置A 时序图 -->
            <app-pipeline-timeline
              *ngIf="resultA.timeline"
              [timeline]="resultA.timeline"
              [pipelineModel]="configA.model"
              [currentCycle]="currentCycle"
              [forwardingPaths]="resultA.forwardingPaths"
              [extendedCycles]="maxUnifiedCycles"
              [diffCells]="diffCellsA"
              [hoverHighlightCells]="hoverHighlightA"
              title="🔵 配置 A"
              [showLegend]="false"
            ></app-pipeline-timeline>

            <div *ngIf="!resultA.timeline && instructions.length === 0" class="empty-state">
              <div class="empty-icon">⚡</div>
              <p>输入指令并点击"生成对比时序图"查看流水线对比</p>
            </div>

            <!-- 差异摘要条 -->
            <div *ngIf="resultA.timeline && resultB.timeline" class="diff-summary-bar">
              <div class="diff-summary-header">
                <span class="diff-title">📊 差异摘要</span>
                <span class="diff-count">
                  共 <strong>{{totalDiffCount}}</strong> 处差异
                  <span *ngIf="totalDiffCount === 0" class="no-diff-badge">✓ 两图完全一致</span>
                </span>
              </div>
              <div class="diff-timeline">
                <div class="diff-cycle-header">
                  <div *ngFor="let c of unifiedCycleNumbers" class="diff-cycle-label"
                       [class.has-diff]="cycleDiffCounts[c-1] > 0">
                    {{c}}
                  </div>
                </div>
                <div class="diff-cycle-bar">
                  <div
                    *ngFor="let c of unifiedCycleNumbers"
                    class="diff-cycle-cell"
                    [ngClass]="getCycleCellClass(c)"
                    (mouseenter)="onDiffCycleHover(c)"
                    (mouseleave)="onDiffCycleLeave()"
                    [title]="getCycleDiffTitle(c)"
                  >
                    <span *ngIf="cycleDiffCounts[c-1] > 0" class="diff-cell-count">
                      {{cycleDiffCounts[c-1]}}
                    </span>
                  </div>
                </div>
                <div class="diff-regions-row" *ngIf="diffRegions.length > 0">
                  <span class="regions-label">差异集中区间:</span>
                  <div *ngFor="let region of diffRegions; let i = index"
                       class="diff-region-tag"
                       [style.background]="region.color"
                       (mouseenter)="onDiffCycleHover(region.startCycle, region.endCycle)"
                       (mouseleave)="onDiffCycleLeave()"
                       [attr.title]="'差异区间: 周期 ' + region.startCycle + '-' + region.endCycle">
                    周期 {{region.startCycle}}-{{region.endCycle}}
                  </div>
                </div>
              </div>
            </div>

            <!-- 配置B 时序图 -->
            <app-pipeline-timeline
              *ngIf="resultB.timeline"
              [timeline]="resultB.timeline"
              [pipelineModel]="configB.model"
              [currentCycle]="currentCycle"
              [forwardingPaths]="resultB.forwardingPaths"
              [extendedCycles]="maxUnifiedCycles"
              [diffCells]="diffCellsB"
              [hoverHighlightCells]="hoverHighlightB"
              title="🟠 配置 B"
              [showLegend]="true"
            ></app-pipeline-timeline>
          </div>
        </div>

        <!-- 非对比模式：正常单图 -->
        <div class="card" *ngIf="!comparisonEnabled && !enableTomasulo">
          <div class="card-title flex justify-between items-center">
            <span>流水线时序图</span>
            <div class="cycle-info">
              <span class="badge badge-info">当前周期: {{currentCycle}}</span>
            </div>
          </div>

          <app-pipeline-timeline
            *ngIf="timeline"
            [timeline]="timeline"
            [pipelineModel]="configA.model"
            [currentCycle]="currentCycle"
            [forwardingPaths]="forwardingPaths"
          ></app-pipeline-timeline>

          <div *ngIf="!timeline && instructions.length === 0" class="empty-state">
            <div class="empty-icon">⚡</div>
            <p>输入指令并点击"运行模拟"查看流水线时序</p>
          </div>

          <div *ngIf="hazards.length > 0" class="hazards-section">
            <div class="section-subtitle">检测到的冒险</div>
            <div class="hazard-list">
              <div *ngFor="let h of hazards" class="hazard-card" [ngClass]="'hazard-' + h.type.toLowerCase()">
                <span class="badge" [ngClass]="getHazardBadge(h.type)">
                  {{getHazardTypeName(h.type)}}
                </span>
                <span class="hazard-desc">{{h.description}}</span>
                <span class="hazard-cycle">周期 {{h.cycle}}</span>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="enableTomasulo">
          <app-tomasulo-panel
            *ngIf="tomasuloState"
            [state]="tomasuloState"
          ></app-tomasulo-panel>
        </div>
      </div>

      <div class="right-panel">
        <app-performance-stats
          [stats]="comparisonEnabled ? null : performanceStats"
          [comparisonStats]="comparisonEnabled ? statsComparisonDisplay : null"
        ></app-performance-stats>

        <app-register-file
          *ngIf="!comparisonEnabled && simulatorState"
          [registerFile]="simulatorState.registerFile"
        ></app-register-file>

        <!-- 对比模式：双冒险列表 -->
        <div class="card" *ngIf="comparisonEnabled && (resultA.hazards.length > 0 || resultB.hazards.length > 0)">
          <div class="card-title">检测到的冒险对比</div>
          <div class="hazards-compare">
            <div class="hazard-column">
              <div class="hazard-col-title config-a-title">🔵 配置 A</div>
              <div *ngIf="resultA.hazards.length === 0" class="text-success">✓ 无冒险</div>
              <div class="hazard-list">
                <div *ngFor="let h of resultA.hazards" class="hazard-card small" [ngClass]="'hazard-' + h.type.toLowerCase()">
                  <span class="badge" [ngClass]="getHazardBadge(h.type)">
                    {{getHazardTypeName(h.type)}}
                  </span>
                  <span class="hazard-desc">{{h.description}}</span>
                </div>
              </div>
            </div>
            <div class="hazard-column">
              <div class="hazard-col-title config-b-title">🟠 配置 B</div>
              <div *ngIf="resultB.hazards.length === 0" class="text-success">✓ 无冒险</div>
              <div class="hazard-list">
                <div *ngFor="let h of resultB.hazards" class="hazard-card small" [ngClass]="'hazard-' + h.type.toLowerCase()">
                  <span class="badge" [ngClass]="getHazardBadge(h.type)">
                    {{getHazardTypeName(h.type)}}
                  </span>
                  <span class="hazard-desc">{{h.description}}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card" *ngIf="currentLevel && performanceStats && !comparisonEnabled">
          <div class="card-title">关卡进度</div>
          <div *ngIf="checkLevelPassed()" class="level-result passed">
            <div class="result-icon">🎉</div>
            <div class="result-title">恭喜通关！</div>
            <div class="result-stars">
              <span *ngFor="let s of getStars()" class="star">{{s ? '⭐' : '☆'}}</span>
            </div>
          </div>
          <div *ngIf="!checkLevelPassed() && performanceStats.totalCycles > 0" class="level-result failed">
            <div class="result-icon">💪</div>
            <div class="result-title">继续努力！</div>
            <div class="result-hint">{{getLevelProgressHint()}}</div>
          </div>
          <div *ngIf="performanceStats.totalCycles === 0" class="level-result">
            <div class="result-icon">📝</div>
            <div class="result-title">点击运行模拟开始挑战</div>
          </div>
          <div *ngIf="currentLevel.targetCpi || currentLevel.targetIpc" class="targets mt-4">
            <div *ngIf="currentLevel.targetCpi" class="target-row">
              <span>目标 CPI ≤ {{currentLevel.targetCpi}}</span>
              <span [ngClass]="performanceStats.cpi <= currentLevel.targetCpi ? 'text-success' : 'text-danger'">
                实际: {{performanceStats.cpi.toFixed(2)}}
              </span>
            </div>
            <div *ngIf="currentLevel.targetIpc" class="target-row">
              <span>目标 IPC ≥ {{currentLevel.targetIpc}}</span>
              <span [ngClass]="performanceStats.ipc >= currentLevel.targetIpc ? 'text-success' : 'text-danger'">
                实际: {{performanceStats.ipc.toFixed(2)}}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .simulator-container {
      display: grid;
      grid-template-columns: 380px 1fr 340px;
      gap: 16px;
    }
    @media (max-width: 1400px) {
      .simulator-container {
        grid-template-columns: 1fr;
      }
    }
    .left-panel, .right-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .center-panel {
      min-width: 0;
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
    }
    .code-editor:focus {
      outline: none;
      border-color: #3498db;
      box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.15);
    }
    .code-editor:disabled {
      background: #f0f0f0;
      cursor: not-allowed;
    }
    .action-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .action-row button {
      flex: 1;
      min-width: 100px;
    }

    /* 对比模式开关 */
    .toggle-switch-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: #2c3e50;
    }
    .toggle-switch-label input {
      display: none;
    }
    .toggle-slider {
      position: relative;
      width: 40px;
      height: 22px;
      background: #ced4da;
      border-radius: 11px;
      transition: background 0.25s;
    }
    .toggle-slider::before {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      transition: transform 0.25s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .toggle-switch-label input:checked + .toggle-slider {
      background: linear-gradient(135deg, #3498db, #27ae60);
    }
    .toggle-switch-label input:checked + .toggle-slider::before {
      transform: translateX(18px);
    }
    .toggle-text {
      color: #495057;
    }

    /* 两列配置 */
    .comparison-config-container {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    .config-column {
      padding: 10px;
      border-radius: 8px;
      background: #f8f9fa;
    }
    .config-a {
      border: 2px solid #3498db;
      background: linear-gradient(135deg, #ebf5fb, #f8f9fa);
    }
    .config-b {
      border: 2px solid #e67e22;
      background: linear-gradient(135deg, #fef5e7, #f8f9fa);
    }
    .column-title {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #dee2e6;
    }
    .config-a .column-title {
      color: #2980b9;
      border-bottom-color: #3498db;
    }
    .config-b .column-title {
      color: #d35400;
      border-bottom-color: #e67e22;
    }
    .swap-column {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .swap-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 2px solid #9b59b6;
      background: linear-gradient(135deg, #9b59b6, #8e44ad);
      color: white;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      padding: 0;
      line-height: 1;
    }
    .swap-btn:hover {
      transform: rotate(180deg) scale(1.1);
      box-shadow: 0 4px 12px rgba(155, 89, 182, 0.4);
    }
    .swap-text {
      font-size: 8px;
      margin-top: 2px;
    }

    .config-row {
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .config-row label {
      font-size: 12px;
      font-weight: 500;
      color: #495057;
    }
    .config-row select {
      flex: 1;
      max-width: 160px;
      font-size: 11px;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-weight: 400;
    }
    .checkbox-label input {
      width: 15px;
      height: 15px;
    }
    .cycle-info {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .step-btn {
      width: 32px;
      height: 32px;
      border: 1px solid #dee2e6;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    .step-btn:hover:not(:disabled) {
      background: #e9ecef;
    }
    .step-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .empty-state {
      padding: 60px 20px;
      text-align: center;
      color: #adb5bd;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .parse-errors {
      padding: 10px 12px;
      background: #fde8e8;
      border: 1px solid #f5c6cb;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .text-danger { color: #721c24; }
    .mb-2 { margin-bottom: 8px; }
    .mt-4 { margin-top: 16px; }
    .error-item {
      font-size: 12px;
      padding: 4px 0;
      color: #721c24;
    }
    .error-item code {
      display: block;
      margin-top: 2px;
      padding: 2px 6px;
      background: #f5c6cb;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    .level-info {
      padding: 12px;
      background: linear-gradient(135deg, #ebf5fb, #eafaf1);
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .level-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .level-desc {
      font-size: 13px;
      color: #495057;
      margin-bottom: 6px;
    }
    .level-hint {
      font-size: 12px;
      color: #7d6608;
      padding: 6px 8px;
      background: #fffae6;
      border-radius: 4px;
    }
    .hazards-section {
      margin-top: 16px;
    }
    .section-subtitle {
      font-size: 13px;
      font-weight: 600;
      color: #34495e;
      margin-bottom: 8px;
    }
    .hazard-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hazard-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
    }
    .hazard-card.small {
      padding: 5px 8px;
      font-size: 11px;
      gap: 6px;
    }
    .hazard-raw { background: #fde8e8; }
    .hazard-war { background: #fff3cd; }
    .hazard-waw { background: #fff3cd; }
    .hazard-control { background: #d1ecf1; }
    .hazard-structural { background: #fff3cd; }
    .hazard-desc {
      flex: 1;
      color: #495057;
    }
    .hazard-cycle {
      font-size: 12px;
      color: #6c757d;
      font-weight: 600;
    }
    .level-result {
      padding: 20px;
      text-align: center;
      border-radius: 8px;
    }
    .level-result.passed {
      background: linear-gradient(135deg, #d4edda, #c3e6cb);
    }
    .level-result.failed {
      background: linear-gradient(135deg, #fff3cd, #ffeeba);
    }
    .result-icon {
      font-size: 36px;
      margin-bottom: 8px;
    }
    .result-title {
      font-size: 18px;
      font-weight: 600;
      color: #2c3e50;
    }
    .result-stars {
      font-size: 28px;
      margin-top: 8px;
    }
    .star { margin: 0 2px; }
    .result-hint {
      font-size: 13px;
      color: #856404;
      margin-top: 4px;
    }
    .target-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      background: #f8f9fa;
      border-radius: 4px;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .text-success { color: #27ae60; }
    .text-danger { color: #e74c3c; }

    /* 差异摘要条 */
    .diff-summary-bar {
      margin: 16px 0;
      padding: 14px;
      background: linear-gradient(135deg, #f8f9fa, #ffffff);
      border: 2px solid #dee2e6;
      border-radius: 10px;
    }
    .diff-summary-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .diff-title {
      font-size: 14px;
      font-weight: 700;
      color: #2c3e50;
    }
    .diff-count {
      font-size: 13px;
      color: #495057;
    }
    .diff-count strong {
      color: #e74c3c;
      font-size: 15px;
    }
    .no-diff-badge {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 8px;
      background: #27ae60;
      color: white;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }
    .diff-timeline {
      position: relative;
    }
    .diff-cycle-header {
      display: flex;
      margin-bottom: 4px;
    }
    .diff-cycle-label {
      flex: 1;
      text-align: center;
      font-size: 9px;
      font-weight: 600;
      color: #868e96;
      padding: 2px 0;
      transition: color 0.2s;
    }
    .diff-cycle-label.has-diff {
      color: #e74c3c;
      font-weight: 700;
    }
    .diff-cycle-bar {
      display: flex;
      gap: 2px;
      height: 32px;
    }
    .diff-cycle-cell {
      flex: 1;
      min-width: 0;
      background: #f1f3f5;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      position: relative;
    }
    .diff-cycle-cell:hover {
      transform: scaleY(1.15);
      z-index: 5;
    }
    .diff-cycle-cell.no-diff {
      background: #e9ecef;
      cursor: default;
    }
    .diff-cycle-cell.diff-light {
      background: linear-gradient(135deg, #fff3cd, #ffeaa7);
    }
    .diff-cycle-cell.diff-medium {
      background: linear-gradient(135deg, #ffd791, #ffa502);
    }
    .diff-cycle-cell.diff-heavy {
      background: linear-gradient(135deg, #ff7675, #d63031);
    }
    .diff-cycle-cell.diff-active {
      box-shadow: 0 0 0 2px #e74c3c, 0 0 8px rgba(231, 76, 60, 0.5);
      transform: scaleY(1.2);
      z-index: 10;
    }
    .diff-cell-count {
      font-size: 9px;
      font-weight: 700;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }
    .diff-regions-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px dashed #dee2e6;
    }
    .regions-label {
      font-size: 12px;
      font-weight: 600;
      color: #495057;
    }
    .diff-region-tag {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      text-shadow: 0 1px 2px rgba(0,0,0,0.2);
      transition: transform 0.15s;
    }
    .diff-region-tag:hover {
      transform: scale(1.08);
    }

    /* 冒险对比 */
    .hazards-compare {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .hazard-column {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hazard-col-title {
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 6px;
    }
    .config-a-title {
      background: linear-gradient(135deg, #3498db, #2980b9);
      color: white;
    }
    .config-b-title {
      background: linear-gradient(135deg, #e67e22, #d35400);
      color: white;
    }
    .flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .items-center { align-items: center; }
  `]
})
export class PipelineSimulatorComponent implements OnInit, OnDestroy {
  assemblyCode = `ADD x1, x2, x3
ADD x4, x1, x5
ADD x6, x1, x4
LW x7, 0(x0)
ADD x8, x7, x1`;

  instructions: Instruction[] = [];
  parseErrors: ParseError[] = [];

  comparisonEnabled = false;

  configA: SimulatorConfig = {
    model: '5-stage',
    enableForwarding: false,
    enableStallInsertion: true,
    enableDelaySlot: false,
    branchPrediction: null,
    maxCycles: 500
  };

  configB: SimulatorConfig = {
    model: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableDelaySlot: false,
    branchPrediction: null,
    maxCycles: 500
  };

  branchPredictionA: string = 'none';
  branchPredictionB: string = 'none';
  enableTomasulo = false;

  // 单配置模式数据
  timeline: PipelineTimeline | null = null;
  simulatorState: any = null;
  tomasuloState: TomasuloState | null = null;
  tomasuloTimeline: TomasuloState[] = [];
  currentCycle = 0;
  currentStep = 0;
  forwardingPaths: ForwardingPath[] = [];
  hazards: Hazard[] = [];
  performanceStats: PerformanceStats | null = null;

  // 双配置对比模式数据
  resultA: SideBySideSimResult = {
    timeline: null,
    stats: null,
    forwardingPaths: [],
    hazards: []
  };
  resultB: SideBySideSimResult = {
    timeline: null,
    stats: null,
    forwardingPaths: [],
    hazards: []
  };

  // 差异计算结果
  maxUnifiedCycles = 0;
  unifiedCycleNumbers: number[] = [];
  totalDiffCount = 0;
  cycleDiffCounts: number[] = [];
  diffCellsA: Set<string> = new Set();
  diffCellsB: Set<string> = new Set();
  diffRegions: DiffRegion[] = [];

  // 悬停高亮
  hoverHighlightA: Set<string> = new Set();
  hoverHighlightB: Set<string> = new Set();

  currentLevel: typeof LEVELS[0] | null = null;
  currentLevelIsEditable = false;

  private hoverTimeout: any = null;

  constructor(
    private parser: InstructionParserService,
    private simulator: PipelineSimulatorService,
    private tomasulo: TomasuloService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const levelId = params['level'];
      if (levelId) {
        this.loadLevel(parseInt(levelId, 10));
      }
    });
  }

  ngOnDestroy(): void {
    if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
  }

  loadLevel(id: number): void {
    const level = LEVELS.find(l => l.id === id);
    if (!level) return;

    this.currentLevel = level;
    this.assemblyCode = level.instructions;
    this.configA.model = level.pipelineModel;
    this.configA.enableForwarding = level.enableForwarding;
    this.configA.enableStallInsertion = true;
    this.enableTomasulo = level.enableTomasulo;

    if (level.enableBranchPrediction && level.branchPredictionStrategy) {
      this.branchPredictionA = level.branchPredictionStrategy;
      this.configA.branchPrediction = level.branchPredictionStrategy as any;
    } else {
      this.branchPredictionA = 'none';
      this.configA.branchPrediction = null;
    }

    this.currentLevelIsEditable = level.id >= 19;
    this.runSimulation();
  }

  clearLevel(): void {
    this.currentLevel = null;
    this.assemblyCode = `ADD x1, x2, x3
ADD x4, x1, x5`;
    this.resetSimulation();
  }

  onCodeChange(): void {
    this.parseCode();
  }

  parseCode(): void {
    const result = this.parser.parse(this.assemblyCode);
    this.instructions = result.instructions;
    this.parseErrors = result.errors;
  }

  onComparisonToggle(): void {
    if (!this.comparisonEnabled) {
      this.resetSimulation();
    }
  }

  onBranchChangeA(): void {
    if (this.branchPredictionA === 'none') {
      this.configA.branchPrediction = null;
    } else {
      this.configA.branchPrediction = this.branchPredictionA as BranchPredictionStrategy;
    }
    this.resetSimulation();
  }

  onBranchChangeB(): void {
    if (this.branchPredictionB === 'none') {
      this.configB.branchPrediction = null;
    } else {
      this.configB.branchPrediction = this.branchPredictionB as BranchPredictionStrategy;
    }
    this.resetSimulation();
  }

  swapConfigs(): void {
    const tmpCfg = { ...this.configA };
    const tmpBp = this.branchPredictionA;
    this.configA = { ...this.configB };
    this.branchPredictionA = this.branchPredictionB;
    this.configB = tmpCfg;
    this.branchPredictionB = tmpBp;

    const tmpRes = this.resultA;
    this.resultA = this.resultB;
    this.resultB = tmpRes;

    const tmpDiffA = this.diffCellsA;
    this.diffCellsA = this.diffCellsB;
    this.diffCellsB = tmpDiffA;

    if (this.resultA.timeline || this.resultB.timeline) {
      this.computeDiffs();
    }
  }

  canStep(): boolean {
    if (this.comparisonEnabled) {
      return this.instructions.length > 0 && this.maxUnifiedCycles > 0;
    }
    return this.instructions.length > 0;
  }

  onApplyReorderedInstructions(orderedInstructions: Instruction[]): void {
    const lines = this.assemblyCode.split('\n');
    const nonEmptyLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const commentIndex = trimmed.indexOf('#');
      if (commentIndex !== -1) {
        const beforeComment = trimmed.substring(0, commentIndex).trim();
        if (beforeComment.length === 0 && !trimmed.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/)) continue;
      }
      const labelMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (labelMatch && labelMatch[2].trim().length === 0) continue;
      nonEmptyLines.push(line);
    }

    const idToLine = new Map<string, number>();
    let instrIdx = 0;
    for (let i = 0; i < lines.length && instrIdx < this.instructions.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.length === 0) continue;
      const commentIndex = trimmed.indexOf('#');
      let codePart = trimmed;
      if (commentIndex !== -1) {
        codePart = trimmed.substring(0, commentIndex).trim();
      }
      const labelMatch = codePart.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (labelMatch) {
        codePart = labelMatch[2].trim();
      }
      if (codePart.length === 0) continue;
      idToLine.set(this.instructions[instrIdx].id, i);
      instrIdx++;
    }

    const reorderedLines: string[] = [];
    const usedIndices = new Set<number>();

    for (const instr of orderedInstructions) {
      const lineIdx = idToLine.get(instr.id);
      if (lineIdx !== undefined) {
        reorderedLines.push(lines[lineIdx]);
        usedIndices.add(lineIdx);
      }
    }

    this.assemblyCode = reorderedLines.join('\n');
    this.parseCode();
    this.runSimulation();
  }

  runSimulation(): void {
    this.parseCode();
    if (this.instructions.length === 0) return;

    if (this.comparisonEnabled) {
      this.runComparisonSimulation();
      return;
    }

    // 单配置模式
    this.hazards = [];
    this.forwardingPaths = [];

    if (this.enableTomasulo) {
      this.tomasulo.initialize(this.instructions);
      this.tomasulo.runFull(500);
      this.tomasuloTimeline = this.tomasulo.getStates();
      this.currentStep = this.tomasuloTimeline.length - 1;
      this.tomasuloState = this.tomasuloTimeline[this.currentStep];
      this.currentCycle = this.tomasuloState?.cycle || 0;
      this.buildTomasuloStats();
    } else {
      this.simulator.initialize(this.instructions, { ...this.configA });
      this.timeline = this.simulator.runFullSimulation();
      this.simulatorState = this.simulator.getState();
      this.currentCycle = this.timeline?.cycles || 0;
      this.hazards = this.timeline?.hazards || [];
      this.forwardingPaths = this.timeline?.forwardingPaths || [];
      this.performanceStats = this.simulator.getPerformanceStats();
    }
  }

  private runComparisonSimulation(): void {
    // 跑配置A
    this.simulator.initialize(this.instructions, { ...this.configA });
    const tlA = this.simulator.runFullSimulation();
    const statsA = this.simulator.getPerformanceStats();

    this.resultA = {
      timeline: tlA,
      stats: statsA,
      forwardingPaths: [...(tlA?.forwardingPaths || [])],
      hazards: [...(tlA?.hazards || [])]
    };

    // 跑配置B
    this.simulator.initialize(this.instructions, { ...this.configB });
    const tlB = this.simulator.runFullSimulation();
    const statsB = this.simulator.getPerformanceStats();

    this.resultB = {
      timeline: tlB,
      stats: statsB,
      forwardingPaths: [...(tlB?.forwardingPaths || [])],
      hazards: [...(tlB?.hazards || [])]
    };

    // 计算差异
    this.computeDiffs();

    // 设置当前周期到最大值
    this.currentCycle = this.maxUnifiedCycles;
  }

  private computeDiffs(): void {
    if (!this.resultA.timeline || !this.resultB.timeline) {
      this.maxUnifiedCycles = 0;
      this.unifiedCycleNumbers = [];
      this.totalDiffCount = 0;
      this.cycleDiffCounts = [];
      this.diffCellsA = new Set();
      this.diffCellsB = new Set();
      this.diffRegions = [];
      return;
    }

    const cyclesA = this.resultA.timeline.cycles;
    const cyclesB = this.resultB.timeline.cycles;
    this.maxUnifiedCycles = Math.max(cyclesA, cyclesB);
    this.unifiedCycleNumbers = Array.from({ length: this.maxUnifiedCycles }, (_, i) => i + 1);
    this.cycleDiffCounts = new Array(this.maxUnifiedCycles).fill(0);

    const cellsA = this.resultA.timeline.cells;
    const cellsB = this.resultB.timeline.cells;

    const instrCount = this.resultA.timeline.instructions.length;
    this.diffCellsA = new Set();
    this.diffCellsB = new Set();
    this.totalDiffCount = 0;

    const stagesA = this.getStages(this.configA.model);
    const stagesB = this.getStages(this.configB.model);
    const allStages = new Set([...stagesA, ...stagesB]);

    for (let c = 1; c <= this.maxUnifiedCycles; c++) {
      let cycleDiffCount = 0;
      for (let i = 0; i < instrCount; i++) {
        let rowDiff = false;
        for (const stage of allStages) {
          const keyA = `${i}_${c}_${stage}`;
          const keyB = `${i}_${c}_${stage}`;
          const hasA = cellsA.has(keyA);
          const hasB = cellsB.has(keyB);
          const cellA = cellsA.get(keyA);
          const cellB = cellsB.get(keyB);

          let isDiff = false;
          if (hasA !== hasB) {
            isDiff = true;
          } else if (hasA && hasB) {
            if (cellA!.isBubble !== cellB!.isBubble ||
                cellA!.stage !== cellB!.stage ||
                cellA!.flushed !== cellB!.flushed ||
                !!cellA!.hazardHighlight !== !!cellB!.hazardHighlight) {
              isDiff = true;
            }
          }

          if (isDiff) {
            if (hasA) this.diffCellsA.add(`${i}_${c}`);
            if (hasB) this.diffCellsB.add(`${i}_${c}`);
            rowDiff = true;
          }
        }
        if (rowDiff) cycleDiffCount++;
      }
      this.cycleDiffCounts[c - 1] = cycleDiffCount;
      this.totalDiffCount += cycleDiffCount;
    }

    // 计算差异集中区间
    this.computeDiffRegions();
  }

  private computeDiffRegions(): void {
    this.diffRegions = [];
    if (this.maxUnifiedCycles === 0) return;

    const colors = [
      'linear-gradient(135deg, #ff6b6b, #ee5253)',
      'linear-gradient(135deg, #ffa502, #ff7f50)',
      'linear-gradient(135deg, #a29bfe, #6c5ce7)',
      'linear-gradient(135deg, #fd79a8, #e84393)',
      'linear-gradient(135deg, #00b894, #00cec9)'
    ];

    const threshold = Math.max(2, Math.floor(this.instructions.length * 0.3));
    const diffCycles: number[] = [];
    for (let i = 0; i < this.cycleDiffCounts.length; i++) {
      if (this.cycleDiffCounts[i] >= threshold) {
        diffCycles.push(i + 1);
      }
    }

    if (diffCycles.length === 0) return;

    // 合并连续周期
    let colorIdx = 0;
    let start = diffCycles[0];
    let prev = diffCycles[0];

    for (let i = 1; i < diffCycles.length; i++) {
      if (diffCycles[i] - prev > 2) {
        this.diffRegions.push({
          startCycle: start,
          endCycle: prev,
          color: colors[colorIdx % colors.length]
        });
        colorIdx++;
        start = diffCycles[i];
      }
      prev = diffCycles[i];
    }
    this.diffRegions.push({
      startCycle: start,
      endCycle: prev,
      color: colors[colorIdx % colors.length]
    });
  }

  private getStages(model: PipelineModel): string[] {
    if (model === '7-stage') return ['IF1', 'IF2', 'ID', 'EX1', 'EX2', 'MEM', 'WB'];
    return ['IF', 'ID', 'EX', 'MEM', 'WB'];
  }

  get statsComparisonDisplay(): { label: string; stats: PerformanceStats | null; isBetter?: boolean }[] | null {
    if (!this.comparisonEnabled) return null;
    const sA = this.resultA.stats;
    const sB = this.resultB.stats;
    if (!sA || !sB) return null;

    const cpiA = sA.cpi;
    const cpiB = sB.cpi;
    const aBetter = cpiA < cpiB;
    const bBetter = cpiB < cpiA;

    return [
      { label: '🔵 配置 A', stats: sA, isBetter: aBetter && cpiA !== cpiB },
      { label: '🟠 配置 B', stats: sB, isBetter: bBetter && cpiA !== cpiB }
    ];
  }

  getCycleCellClass(c: number): string {
    const count = this.cycleDiffCounts[c - 1] || 0;
    const maxCount = Math.max(...this.cycleDiffCounts, 1);
    if (count === 0) return 'no-diff';

    const ratio = count / maxCount;
    if (ratio < 0.34) return 'diff-light';
    if (ratio < 0.67) return 'diff-medium';
    return 'diff-heavy';
  }

  getCycleDiffTitle(c: number): string {
    const count = this.cycleDiffCounts[c - 1] || 0;
    if (count === 0) return `周期 ${c}: 无差异`;
    return `周期 ${c}: ${count} 条指令状态不同`;
  }

  onDiffCycleHover(startCycle: number, endCycle?: number): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    const end = endCycle ?? startCycle;
    const setA = new Set<string>();
    const setB = new Set<string>();

    for (let c = startCycle; c <= end; c++) {
      for (let i = 0; i < this.instructions.length; i++) {
        if (this.diffCellsA.has(`${i}_${c}`)) setA.add(`${i}_${c}`);
        if (this.diffCellsB.has(`${i}_${c}`)) setB.add(`${i}_${c}`);
      }
    }
    this.hoverHighlightA = setA;
    this.hoverHighlightB = setB;
  }

  onDiffCycleLeave(): void {
    this.hoverTimeout = setTimeout(() => {
      this.hoverHighlightA = new Set();
      this.hoverHighlightB = new Set();
    }, 100);
  }

  prevStep(): void {
    if (this.currentCycle > 0) this.currentCycle--;
  }

  nextStep(): void {
    if (this.currentCycle < this.maxUnifiedCycles) this.currentCycle++;
  }

  resetStep(): void {
    this.currentCycle = 0;
  }

  stepSimulation(): void {
    this.parseCode();
    if (this.instructions.length === 0) return;

    if (this.comparisonEnabled) {
      if (this.currentCycle < this.maxUnifiedCycles) this.currentCycle++;
      return;
    }

    if (this.enableTomasulo) {
      if (this.currentStep === 0 || !this.tomasuloTimeline.length) {
        this.tomasulo.initialize(this.instructions);
        this.tomasuloTimeline = [this.deepCopyState(this.tomasulo.getState())];
        this.currentStep = 0;
      }
      if (this.tomasulo.step()) {
        this.tomasuloTimeline.push(this.deepCopyState(this.tomasulo.getState()));
        this.currentStep++;
      }
      this.tomasuloState = this.tomasuloTimeline[this.currentStep];
      this.currentCycle = this.tomasuloState?.cycle || 0;
    } else {
      if (this.currentCycle === 0) {
        this.simulator.initialize(this.instructions, { ...this.configA });
      }
      this.simulator.step();
      this.simulatorState = this.simulator.getState();
      this.timeline = this.buildCurrentTimeline();
      this.currentCycle = this.simulatorState.cycle;
      this.hazards = this.simulatorState.hazards;
      this.forwardingPaths = this.simulatorState.forwardingPaths;
      this.performanceStats = this.simulator.getPerformanceStats();
    }
  }

  resetSimulation(): void {
    this.timeline = null;
    this.simulatorState = null;
    this.tomasuloState = null;
    this.tomasuloTimeline = [];
    this.currentCycle = 0;
    this.currentStep = 0;
    this.hazards = [];
    this.forwardingPaths = [];
    this.performanceStats = null;

    this.resultA = { timeline: null, stats: null, forwardingPaths: [], hazards: [] };
    this.resultB = { timeline: null, stats: null, forwardingPaths: [], hazards: [] };
    this.maxUnifiedCycles = 0;
    this.unifiedCycleNumbers = [];
    this.totalDiffCount = 0;
    this.cycleDiffCounts = [];
    this.diffCellsA = new Set();
    this.diffCellsB = new Set();
    this.diffRegions = [];
    this.hoverHighlightA = new Set();
    this.hoverHighlightB = new Set();
  }

  loadExample(): void {
    this.assemblyCode = `# 示例: 数据冒险与转发演示
ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2    # 需要 x1, x2
SUB x4, x3, x1    # RAW冒险: 需要 x3
AND x5, x1, x2
OR x6, x3, x4     # RAW冒险: 需要 x3, x4
SW x6, 0(x0)
LW x7, 0(x0)      # Load-Use冒险
ADD x8, x7, x1    # 需要等LW完成`;
    this.currentLevel = null;
    this.onCodeChange();
  }

  private buildCurrentTimeline(): PipelineTimeline {
    return {
      instructions: this.instructions,
      cycles: this.simulatorState.cycle,
      cells: new Map(this.simulatorState.timelineCells),
      hazards: [...this.simulatorState.hazards],
      forwardingPaths: [...this.simulatorState.forwardingPaths]
    };
  }

  private buildTomasuloStats(): void {
    if (!this.tomasuloState) return;
    const completed = this.tomasuloState.committedInstructions.length;
    this.performanceStats = {
      totalCycles: this.tomasuloState.cycle,
      totalInstructions: this.instructions.filter(i => !i.isNop).length,
      completedInstructions: completed,
      cpi: completed > 0 ? this.tomasuloState.cycle / completed : 0,
      ipc: this.tomasuloState.cycle > 0 ? completed / this.tomasuloState.cycle : 0,
      stageUtilization: new Map(),
      hazardStalls: new Map(),
      totalStallCycles: 0,
      forwardingUsed: this.tomasuloState.cdbBroadcasts.length
    };
  }

  private deepCopyState(state: TomasuloState): TomasuloState {
    return JSON.parse(JSON.stringify(state));
  }

  getHazardTypeName(type: HazardType): string {
    switch (type) {
      case HazardType.RAW: return 'RAW (写后读)';
      case HazardType.WAR: return 'WAR (读后写)';
      case HazardType.WAW: return 'WAW (写后写)';
      case HazardType.CONTROL: return '控制冒险';
      case HazardType.STRUCTURAL: return '结构冒险';
      default: return '未知';
    }
  }

  getHazardBadge(type: HazardType): string {
    switch (type) {
      case HazardType.RAW: return 'badge-danger';
      case HazardType.WAR: return 'badge-warning';
      case HazardType.WAW: return 'badge-warning';
      case HazardType.CONTROL: return 'badge-info';
      case HazardType.STRUCTURAL: return 'badge-warning';
      default: return 'badge-warning';
    }
  }

  checkLevelPassed(): boolean {
    if (!this.currentLevel || !this.performanceStats) return false;
    if (this.performanceStats.completedInstructions < this.performanceStats.totalInstructions) return false;

    if (this.currentLevel.targetCpi && this.performanceStats.cpi > this.currentLevel.targetCpi) return false;
    if (this.currentLevel.targetIpc && this.performanceStats.ipc < this.currentLevel.targetIpc) return false;
    if (this.currentLevel.maxCycles && this.performanceStats.totalCycles > this.currentLevel.maxCycles) return false;

    return true;
  }

  getStars(): boolean[] {
    if (!this.currentLevel || !this.performanceStats) return [false, false, false];
    const stars = [false, false, false];
    stars[0] = this.checkLevelPassed();

    if (this.currentLevel.targetCpi) {
      stars[1] = this.performanceStats.cpi <= this.currentLevel.targetCpi * 0.9;
      stars[2] = this.performanceStats.cpi <= this.currentLevel.targetCpi * 0.8;
    } else if (this.currentLevel.targetIpc) {
      stars[1] = this.performanceStats.ipc >= this.currentLevel.targetIpc * 1.1;
      stars[2] = this.performanceStats.ipc >= this.currentLevel.targetIpc * 1.2;
    }

    return stars;
  }

  getLevelProgressHint(): string {
    if (!this.currentLevel || !this.performanceStats) return '';
    if (this.currentLevel.targetCpi) {
      return `当前 CPI: ${this.performanceStats.cpi.toFixed(2)}，目标: ≤ ${this.currentLevel.targetCpi}`;
    }
    if (this.currentLevel.targetIpc) {
      return `当前 IPC: ${this.performanceStats.ipc.toFixed(2)}，目标: ≥ ${this.currentLevel.targetIpc}`;
    }
    return '继续优化！';
  }
}
