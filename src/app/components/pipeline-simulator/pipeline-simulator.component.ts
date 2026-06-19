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
              ▶ 运行模拟
            </button>
            <button (click)="stepSimulation()" [disabled]="!instructions.length">
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
          [instructions]="instructions"
          [enableForwarding]="config.enableForwarding"
          (applyInstructions)="onApplyReorderedInstructions($event)"
        ></app-instruction-reorder>

        <div class="card">
          <div class="card-title">模拟器配置</div>

          <div class="config-row">
            <label>流水线模型</label>
            <select [(ngModel)]="config.model" (ngModelChange)="resetSimulation()">
              <option value="5-stage">5级 (经典)</option>
              <option value="7-stage">7级 (超流水)</option>
              <option value="superscalar-2way">超标量 2发射</option>
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

          <div class="config-row">
            <label>对比模式</label>
            <select [(ngModel)]="comparisonMode">
              <option value="none">不使用对比</option>
              <option value="forwarding">对比: 无转发 vs 有转发</option>
              <option value="branch">对比: 分支预测策略</option>
              <option value="full">对比: 顺序 vs 转发 vs 乱序</option>
            </select>
          </div>
        </div>
      </div>

      <div class="center-panel">
        <div class="card" *ngIf="!enableTomasulo">
          <div class="card-title flex justify-between items-center">
            <span>流水线时序图</span>
            <div class="cycle-info">
              <span class="badge badge-info">当前周期: {{currentCycle}}</span>
            </div>
          </div>

          <app-pipeline-timeline
            *ngIf="timeline"
            [timeline]="timeline"
            [pipelineModel]="config.model"
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

        <div *ngIf="comparisonMode !== 'none' && comparisonResults.length > 1" class="card mt-4">
          <div class="card-title">对比模式 - 性能数据</div>
          <div class="comparison-table">
            <table>
              <thead>
                <tr>
                  <th>配置</th>
                  <th>CPI</th>
                  <th>IPC</th>
                  <th>总周期</th>
                  <th>停顿周期</th>
                  <th>冒险次数</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let r of comparisonResults">
                  <td><strong>{{r.configName}}</strong></td>
                  <td>{{r.stats.cpi.toFixed(2)}}</td>
                  <td>{{r.stats.ipc.toFixed(2)}}</td>
                  <td>{{r.stats.totalCycles}}</td>
                  <td>{{r.stats.totalStallCycles}}</td>
                  <td>{{getTotalHazards(r.stats)}}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="right-panel">
        <app-performance-stats
          [stats]="performanceStats"
        ></app-performance-stats>

        <app-register-file
          *ngIf="simulatorState"
          [registerFile]="simulatorState.registerFile"
        ></app-register-file>

        <div class="card" *ngIf="currentLevel && performanceStats">
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
      grid-template-columns: 340px 1fr 340px;
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
    .config-row {
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .config-row select {
      flex: 1;
      max-width: 200px;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-weight: 400;
    }
    .checkbox-label input {
      width: 16px;
      height: 16px;
    }
    .cycle-info {
      display: flex;
      gap: 8px;
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
    .star {
      margin: 0 2px;
    }
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
    .comparison-table {
      overflow-x: auto;
    }
    .comparison-table table {
      width: 100%;
      font-size: 13px;
    }
    .comparison-table th {
      background: #34495e;
      color: white;
    }
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

  config: SimulatorConfig = {
    model: '5-stage',
    enableForwarding: true,
    enableStallInsertion: true,
    enableDelaySlot: false,
    branchPrediction: null,
    maxCycles: 500
  };

  branchPredictionValue: string = 'none';
  enableTomasulo = false;
  comparisonMode: string = 'none';

  timeline: PipelineTimeline | null = null;
  simulatorState: any = null;
  tomasuloState: TomasuloState | null = null;
  tomasuloTimeline: TomasuloState[] = [];
  currentCycle = 0;
  currentStep = 0;
  forwardingPaths: ForwardingPath[] = [];
  hazards: Hazard[] = [];
  performanceStats: PerformanceStats | null = null;
  comparisonResults: { configName: string; stats: PerformanceStats }[] = [];

  currentLevel: typeof LEVELS[0] | null = null;
  currentLevelIsEditable = false;

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

  ngOnDestroy(): void {}

  loadLevel(id: number): void {
    const level = LEVELS.find(l => l.id === id);
    if (!level) return;

    this.currentLevel = level;
    this.assemblyCode = level.instructions;
    this.config.model = level.pipelineModel;
    this.config.enableForwarding = level.enableForwarding;
    this.config.enableStallInsertion = true;
    this.enableTomasulo = level.enableTomasulo;

    if (level.enableBranchPrediction && level.branchPredictionStrategy) {
      this.branchPredictionValue = level.branchPredictionStrategy;
      this.config.branchPrediction = level.branchPredictionStrategy as any;
    } else {
      this.branchPredictionValue = 'none';
      this.config.branchPrediction = null;
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

  onBranchPredictionChange(): void {
    if (this.branchPredictionValue === 'none') {
      this.config.branchPrediction = null;
    } else {
      this.config.branchPrediction = this.branchPredictionValue as BranchPredictionStrategy;
    }
    this.resetSimulation();
  }

  runSimulation(): void {
    this.parseCode();
    if (this.instructions.length === 0) return;
    this.hazards = [];
    this.forwardingPaths = [];
    this.comparisonResults = [];

    if (this.enableTomasulo) {
      this.tomasulo.initialize(this.instructions);
      this.tomasulo.runFull(500);
      this.tomasuloTimeline = this.tomasulo.getStates();
      this.currentStep = this.tomasuloTimeline.length - 1;
      this.tomasuloState = this.tomasuloTimeline[this.currentStep];
      this.currentCycle = this.tomasuloState?.cycle || 0;
      this.buildTomasuloStats();
    } else {
      this.simulator.initialize(this.instructions, { ...this.config });
      this.timeline = this.simulator.runFullSimulation();
      this.simulatorState = this.simulator.getState();
      this.currentCycle = this.timeline?.cycles || 0;
      this.hazards = this.timeline?.hazards || [];
      this.forwardingPaths = this.timeline?.forwardingPaths || [];
      this.performanceStats = this.simulator.getPerformanceStats();
    }

    if (this.comparisonMode !== 'none') {
      this.runComparison();
    }
  }

  stepSimulation(): void {
    this.parseCode();
    if (this.instructions.length === 0) return;

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
        this.simulator.initialize(this.instructions, { ...this.config });
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
    this.comparisonResults = [];
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

  private runComparison(): void {
    this.comparisonResults = [];

    if (this.comparisonMode === 'forwarding') {
      const configNoFwd: SimulatorConfig = { ...this.config, enableForwarding: false };
      this.simulator.initialize(this.instructions, configNoFwd);
      this.simulator.runFullSimulation();
      this.comparisonResults.push({
        configName: '无数据转发',
        stats: this.simulator.getPerformanceStats()
      });

      const configFwd: SimulatorConfig = { ...this.config, enableForwarding: true };
      this.simulator.initialize(this.instructions, configFwd);
      this.simulator.runFullSimulation();
      this.comparisonResults.push({
        configName: '有数据转发',
        stats: this.simulator.getPerformanceStats()
      });
    } else if (this.comparisonMode === 'branch') {
      const strategies = [
        { name: '不使用预测', value: null as any },
        { name: '静态-不跳转', value: BranchPredictionStrategy.STATIC_NOT_TAKEN },
        { name: '1-bit预测', value: BranchPredictionStrategy.ONE_BIT },
        { name: '2-bit预测', value: BranchPredictionStrategy.TWO_BIT }
      ];

      for (const s of strategies) {
        const cfg: SimulatorConfig = { ...this.config, branchPrediction: s.value };
        this.simulator.initialize(this.instructions, cfg);
        this.simulator.runFullSimulation();
        this.comparisonResults.push({
          configName: s.name,
          stats: this.simulator.getPerformanceStats()
        });
      }
    } else if (this.comparisonMode === 'full') {
      const cfg1: SimulatorConfig = { ...this.config, enableForwarding: false };
      this.simulator.initialize(this.instructions, cfg1);
      this.simulator.runFullSimulation();
      this.comparisonResults.push({
        configName: '顺序执行(无转发)',
        stats: this.simulator.getPerformanceStats()
      });

      const cfg2: SimulatorConfig = { ...this.config, enableForwarding: true };
      this.simulator.initialize(this.instructions, cfg2);
      this.simulator.runFullSimulation();
      this.comparisonResults.push({
        configName: '有数据转发',
        stats: this.simulator.getPerformanceStats()
      });

      this.tomasulo.initialize(this.instructions);
      this.tomasulo.runFull(500);
      const tStates = this.tomasulo.getStates();
      const lastState = tStates[tStates.length - 1];
      this.comparisonResults.push({
        configName: 'Tomasulo乱序执行',
        stats: {
          totalCycles: lastState.cycle,
          totalInstructions: this.instructions.filter(i => !i.isNop).length,
          completedInstructions: lastState.committedInstructions.length,
          cpi: lastState.committedInstructions.length > 0 ? lastState.cycle / lastState.committedInstructions.length : 0,
          ipc: lastState.cycle > 0 ? lastState.committedInstructions.length / lastState.cycle : 0,
          stageUtilization: new Map(),
          hazardStalls: new Map(),
          totalStallCycles: 0,
          forwardingUsed: 0
        }
      });
    }
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

  getTotalHazards(stats: PerformanceStats): number {
    let total = 0;
    stats.hazardStalls.forEach(c => total += c);
    return total;
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
