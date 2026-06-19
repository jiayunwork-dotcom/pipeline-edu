import { Component, Input, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PipelineTimeline, PipelineStage, PipelineTimelineCell,
  getPipelineStages, PipelineModel, ForwardingPath, HazardType,
  PIPELINE_STAGES_5, PIPELINE_STAGES_7
} from '../../models/register.model';
import { Instruction } from '../../models/instruction.model';
import { InstructionParserService } from '../../services/instruction-parser.service';

interface LegendItem {
  colorClass: string;
  label: string;
}

interface ArrowLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  path: ForwardingPath;
}

@Component({
  selector: 'app-pipeline-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-container" *ngIf="timeline" #containerRef>
      <div class="timeline-header" *ngIf="title">
        <div class="timeline-title">{{title}}</div>
      </div>
      <div class="timeline-header">
        <div class="instruction-label-header">指令</div>
        <div class="cycles-container">
          <div
            *ngFor="let c of cycleNumbers"
            class="cycle-header-group"
            [class.current-cycle]="c === currentCycle"
          >
            <div class="cycle-number">{{c}}</div>
            <div class="cycle-stages-header">
              <div
                *ngFor="let stage of stages"
                class="stage-header-cell"
                [class]="stage.toLowerCase()"
              >
                {{stage}}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="timeline-body" #bodyRef>
        <div
          *ngFor="let instr of timeline.instructions; let i = index"
          class="timeline-row"
          [attr.data-row-index]="i"
        >
          <div class="instruction-label" [title]="instr.rawText">
            <span class="instr-index">{{i + 1}}.</span>
            <span class="instr-text">{{parser.formatInstruction(instr)}}</span>
          </div>
          <div class="cycles-container">
            <ng-container *ngFor="let c of cycleNumbers">
              <div
                *ngFor="let stage of stages; let sIdx = index"
                class="timeline-cell-wrapper"
                [attr.data-cycle]="c"
                [attr.data-stage]="stage"
                [attr.data-cell-key]="i + '_' + c + '_' + stage"
              >
                <div
                  *ngIf="getCell(i, c, stage) as cell"
                  class="timeline-cell"
                  [class]="getCellClass(cell, stage, i, c)"
                  [title]="getCellTitle(cell, stage)"
                  [class.diff-highlight]="isDiffHighlighted(i, c)"
                  [class.hover-blink]="isHoverBlinkCell(i, c)"
                >
                  <span *ngIf="!cell.isBubble">{{stage}}</span>
                  <span *ngIf="cell.isBubble && stage === stages[0]">
                    <span class="bubble-text">BUBBLE</span>
                  </span>
                </div>
                <div *ngIf="!getCell(i, c, stage)" class="timeline-cell empty-cell"></div>
              </div>
            </ng-container>
          </div>
        </div>
      </div>

      <svg class="forwarding-arrows" [attr.width]="svgWidth" [attr.height]="svgHeight">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#27ae60" />
          </marker>
          <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#2980b9" />
          </marker>
          <marker id="arrowhead-orange" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#e67e22" />
          </marker>
        </defs>
        <g *ngFor="let arrow of arrowLines; let idx = index">
          <path
            [attr.d]="getArrowPath(arrow)"
            fill="none"
            [attr.stroke]="getArrowColor(arrow.path.fromStage)"
            stroke-width="2.5"
            stroke-linecap="round"
            marker-end="url(#arrowhead)"
            [attr.data-forward-idx]="idx"
          />
          <title>转发: x{{arrow.path.register}} 从 {{arrow.path.fromStage}} → {{arrow.path.toStage}}</title>
        </g>
      </svg>

      <div class="legend" *ngIf="showLegend">
        <ng-container *ngFor="let item of legendItems">
          <div class="legend-item">
            <span class="legend-color" [ngClass]="item.colorClass"></span>
            <span>{{item.label}}</span>
          </div>
        </ng-container>
        <div class="legend-item">
          <span class="legend-color bubble"></span>
          <span>气泡</span>
        </div>
        <div class="legend-item">
          <span class="legend-color hazard"></span>
          <span>冒险</span>
        </div>
        <div class="legend-item">
          <span class="legend-color flushed"></span>
          <span>冲刷</span>
        </div>
        <div class="legend-item" *ngIf="forwardingPaths.length > 0">
          <svg width="40" height="12">
            <line x1="2" y1="6" x2="30" y2="6" stroke="#27ae60" stroke-width="2.5" marker-end="url(#legend-arrow)"/>
            <defs>
              <marker id="legend-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#27ae60" />
              </marker>
            </defs>
          </svg>
          <span>数据转发路径</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .timeline-container {
      background: white;
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      position: relative;
    }
    .timeline-title {
      font-size: 15px;
      font-weight: 700;
      color: #2c3e50;
      padding: 4px 0 12px 0;
      border-bottom: 2px solid #e9ecef;
      margin-bottom: 8px;
    }
    .timeline-header, .timeline-row {
      display: flex;
      align-items: stretch;
    }
    .timeline-header {
      position: sticky;
      top: 0;
      background: white;
      z-index: 10;
      border-bottom: 2px solid #dee2e6;
      margin-bottom: 8px;
    }
    .instruction-label-header, .instruction-label {
      width: 220px;
      min-width: 220px;
      padding: 8px 12px;
      font-size: 12px;
      display: flex;
      align-items: center;
      border-right: 2px solid #dee2e6;
      font-weight: 600;
      color: #495057;
    }
    .instruction-label {
      font-weight: 400;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }
    .instr-index {
      color: #868e96;
      margin-right: 6px;
    }
    .instr-text {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cycles-container {
      display: flex;
      flex-wrap: nowrap;
    }
    .cycle-header-group {
      display: flex;
      flex-direction: column;
      border-right: 1px solid #e9ecef;
    }
    .cycle-header-group.current-cycle {
      background: #e3f2fd;
    }
    .cycle-header-group.current-cycle .cycle-number {
      color: #1976d2;
      background: #bbdefb;
    }
    .cycle-number {
      padding: 4px 6px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      color: #6c757d;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }
    .cycle-stages-header {
      display: flex;
    }
    .stage-header-cell {
      width: 56px;
      min-width: 56px;
      margin: 0 2px;
      padding: 2px 0;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      color: white;
      border-radius: 3px 3px 0 0;
      opacity: 0.85;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .stage-header-cell.if { background: #3498db; }
    .stage-header-cell.id { background: #2ecc71; }
    .stage-header-cell.ex { background: #f39c12; }
    .stage-header-cell.mem { background: #9b59b6; }
    .stage-header-cell.wb { background: #1abc9c; }
    .stage-header-cell.if1 { background: #2980b9; }
    .stage-header-cell.if2 { background: #3498db; opacity: 0.85; }
    .stage-header-cell.ex1 { background: #e67e22; }
    .stage-header-cell.ex2 { background: #f39c12; }
    .timeline-row {
      margin-bottom: 2px;
    }
    .timeline-cell-wrapper {
      display: flex;
    }
    .timeline-cell {
      width: 56px;
      min-width: 56px;
      height: 32px;
      margin: 0 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: white;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .timeline-cell:hover {
      transform: scale(1.05);
      z-index: 5;
      position: relative;
    }
    .timeline-cell.empty-cell {
      background: transparent;
      border: 1px dashed #dee2e6;
    }
    .timeline-cell.if { background: #3498db; }
    .timeline-cell.id { background: #2ecc71; }
    .timeline-cell.ex { background: #f39c12; }
    .timeline-cell.mem { background: #9b59b6; }
    .timeline-cell.wb { background: #1abc9c; }
    .timeline-cell.if1 { background: #2980b9; }
    .timeline-cell.if2 { background: #3498db; opacity: 0.85; }
    .timeline-cell.ex1 { background: #e67e22; }
    .timeline-cell.ex2 { background: #f39c12; }
    .timeline-cell.bubble {
      background: repeating-linear-gradient(
        45deg,
        #dee2e6,
        #dee2e6 4px,
        #ced4da 4px,
        #ced4da 8px
      );
      color: #6c757d;
    }
    .bubble-text {
      font-size: 9px;
      color: #6c757d;
    }
    .timeline-cell.hazard {
      box-shadow: 0 0 0 3px #e74c3c, inset 0 0 0 1px #c0392b;
      animation: hazardPulse 1.5s infinite;
    }
    .timeline-cell.diff-highlight {
      box-shadow: 0 0 0 3px #9b59b6, inset 0 0 0 1px #8e44ad;
    }
    .timeline-cell.hover-blink {
      animation: diffBlink 0.6s ease-in-out infinite;
      z-index: 10;
      position: relative;
    }
    @keyframes diffBlink {
      0%, 100% {
        box-shadow: 0 0 0 4px #e74c3c, 0 0 12px rgba(231,76,60,0.6);
        transform: scale(1.08);
      }
      50% {
        box-shadow: 0 0 0 2px #f39c12, 0 0 6px rgba(243,156,18,0.4);
        transform: scale(1.02);
      }
    }
    @keyframes hazardPulse {
      0%, 100% { box-shadow: 0 0 0 3px #e74c3c; }
      50% { box-shadow: 0 0 0 5px #e74c3c, 0 0 10px rgba(231,76,60,0.5); }
    }
    .timeline-cell.flushed {
      background: repeating-linear-gradient(
        135deg,
        #fde8e8,
        #fde8e8 4px,
        #fbd5d5 4px,
        #fbd5d5 8px
      );
      color: #e74c3c;
      text-decoration: line-through;
    }
    .timeline-body {
      position: relative;
    }
    .forwarding-arrows {
      position: absolute;
      top: 0;
      left: 220px;
      pointer-events: none;
      z-index: 20;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e9ecef;
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
    }
    .legend-color.if { background: #3498db; }
    .legend-color.id { background: #2ecc71; }
    .legend-color.ex { background: #f39c12; }
    .legend-color.mem { background: #9b59b6; }
    .legend-color.wb { background: #1abc9c; }
    .legend-color.bubble {
      background: repeating-linear-gradient(
        45deg,
        #dee2e6,
        #dee2e6 4px,
        #ced4da 4px,
        #ced4da 8px
      );
    }
    .legend-color.hazard {
      background: white;
      box-shadow: 0 0 0 2px #e74c3c;
    }
    .legend-color.flushed {
      background: repeating-linear-gradient(
        135deg,
        #fde8e8,
        #fde8e8 4px,
        #fbd5d5 4px,
        #fbd5d5 8px
      );
    }
  `]
})
export class PipelineTimelineComponent implements OnInit, OnChanges, AfterViewChecked {
  @Input() timeline!: PipelineTimeline;
  @Input() pipelineModel: PipelineModel = '5-stage';
  @Input() currentCycle: number = 0;
  @Input() forwardingPaths: ForwardingPath[] = [];
  @Input() extendedCycles: number = 0;
  @Input() diffCells: Set<string> = new Set();
  @Input() hoverHighlightCells: Set<string> = new Set();
  @Input() title: string = '';
  @Input() showLegend: boolean = true;

  @ViewChild('containerRef', { static: false }) containerRef!: ElementRef;
  @ViewChild('bodyRef', { static: false }) bodyRef!: ElementRef;

  stages: PipelineStage[] = [];
  cycleNumbers: number[] = [];
  legendItems: LegendItem[] = [];
  arrowLines: ArrowLine[] = [];
  svgWidth = 0;
  svgHeight = 0;

  private lastSvgUpdateKey = '';

  constructor(public parser: InstructionParserService) {}

  ngOnInit(): void {
    this.updateData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['timeline'] || changes['pipelineModel'] || changes['extendedCycles']) {
      this.updateData();
    }
    if (changes['timeline'] || changes['forwardingPaths'] || changes['extendedCycles']) {
      this.scheduleArrowCalculation();
    }
  }

  ngAfterViewChecked(): void {
    this.scheduleArrowCalculation();
  }

  private scheduleArrowCalculation(): void {
    const key = `${this.timeline?.cycles || 0}_${this.forwardingPaths.length}_${this.stages.length}_${this.extendedCycles}`;
    if (key === this.lastSvgUpdateKey) return;
    this.lastSvgUpdateKey = key;
    setTimeout(() => this.calculateArrows(), 0);
  }

  private updateData(): void {
    this.stages = getPipelineStages(this.pipelineModel);
    if (this.timeline) {
      const totalCycles = Math.max(this.timeline.cycles, this.extendedCycles);
      this.cycleNumbers = Array.from({ length: totalCycles }, (_, i) => i + 1);
    }
    this.updateLegend();
  }

  private updateLegend(): void {
    const map5: Record<string, string> = {
      'IF': '取指 IF',
      'ID': '译码 ID',
      'EX': '执行 EX',
      'MEM': '访存 MEM',
      'WB': '写回 WB'
    };
    const map7: Record<string, string> = {
      'IF1': '取指1 IF1',
      'IF2': '取指2 IF2',
      'ID': '译码 ID',
      'EX1': '执行1 EX1',
      'EX2': '执行2 EX2',
      'MEM': '访存 MEM',
      'WB': '写回 WB'
    };
    const map = this.pipelineModel === '7-stage' ? map7 : map5;
    this.legendItems = this.stages.map(s => ({
      colorClass: s.toLowerCase(),
      label: map[s] || s
    }));
  }

  private calculateArrows(): void {
    if (!this.bodyRef || !this.containerRef || this.forwardingPaths.length === 0) {
      this.arrowLines = [];
      return;
    }

    const bodyEl: HTMLElement = this.bodyRef.nativeElement;
    const bodyRect = bodyEl.getBoundingClientRect();
    const lines: ArrowLine[] = [];
    const processed = new Set<string>();

    for (const path of this.forwardingPaths) {
      const key = `${path.fromInstructionId}_${path.fromStage}_${path.toInstructionId}_${path.toStage}_${path.register}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const fromKey = this.findLastStageCell(path.fromInstructionId, path.fromStage);
      const toKey = this.findFirstStageCell(path.toInstructionId, path.toStage);
      if (!fromKey || !toKey) continue;

      const fromEl = bodyEl.querySelector<HTMLElement>(`[data-cell-key="${fromKey}"]`);
      const toEl = bodyEl.querySelector<HTMLElement>(`[data-cell-key="${toKey}"]`);
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      lines.push({
        x1: fromRect.right - bodyRect.left,
        y1: fromRect.top + fromRect.height / 2 - bodyRect.top,
        x2: toRect.left - bodyRect.left,
        y2: toRect.top + toRect.height / 2 - bodyRect.top,
        path
      });
    }

    this.arrowLines = lines;
    this.svgWidth = bodyRect.width;
    this.svgHeight = bodyRect.height;
  }

  private findLastStageCell(instrId: string, stage: string): string | null {
    const instrIndex = this.timeline.instructions.findIndex(i => i.id === instrId);
    if (instrIndex < 0) return null;
    for (let c = this.cycleNumbers.length; c >= 1; c--) {
      const key = `${instrIndex}_${c}_${stage}`;
      if (this.timeline.cells.has(key)) {
        const cell = this.timeline.cells.get(key)!;
        if (!cell.isBubble) return key;
      }
    }
    return null;
  }

  private findFirstStageCell(instrId: string, stage: string): string | null {
    const instrIndex = this.timeline.instructions.findIndex(i => i.id === instrId);
    if (instrIndex < 0) return null;
    for (let c = 1; c <= this.cycleNumbers.length; c++) {
      const key = `${instrIndex}_${c}_${stage}`;
      if (this.timeline.cells.has(key)) {
        const cell = this.timeline.cells.get(key)!;
        if (!cell.isBubble) return key;
      }
    }
    return null;
  }

  getArrowPath(arrow: ArrowLine): string {
    const dx = arrow.x2 - arrow.x1;
    const dy = arrow.y2 - arrow.y1;
    const midX = (arrow.x1 + arrow.x2) / 2;
    if (Math.abs(dy) < 5) {
      return `M ${arrow.x1} ${arrow.y1} L ${arrow.x2} ${arrow.y2}`;
    }
    const ctrlOffset = Math.min(Math.abs(dx) * 0.4, 50);
    return `M ${arrow.x1} ${arrow.y1} C ${arrow.x1 + ctrlOffset} ${arrow.y1}, ${arrow.x2 - ctrlOffset} ${arrow.y2}, ${arrow.x2} ${arrow.y2}`;
  }

  getArrowColor(fromStage: string): string {
    switch (fromStage) {
      case 'EX': case 'EX1': case 'EX2': return '#27ae60';
      case 'MEM': return '#2980b9';
      case 'WB': return '#e67e22';
      default: return '#27ae60';
    }
  }

  getCell(instrIndex: number, cycle: number, stage: PipelineStage): PipelineTimelineCell | null {
    if (!this.timeline) return null;
    const key = `${instrIndex}_${cycle}_${stage}`;
    const cell = this.timeline.cells.get(key);
    if (cell) return cell;

    const keyP0 = `${instrIndex}_${cycle}_${stage}_p0`;
    const cellP0 = this.timeline.cells.get(keyP0);
    if (cellP0) return cellP0;

    return null;
  }

  getCellClass(cell: PipelineTimelineCell, stage: PipelineStage, instrIndex: number, cycle: number): string[] {
    const classes: string[] = [];
    if (cell.isBubble) {
      classes.push('bubble');
    } else {
      classes.push(stage.toLowerCase());
    }
    if (cell.hazardHighlight) {
      classes.push('hazard');
    }
    if (cell.flushed) {
      classes.push('flushed');
    }
    return classes;
  }

  isDiffHighlighted(instrIndex: number, cycle: number): boolean {
    return this.diffCells.has(`${instrIndex}_${cycle}`);
  }

  isHoverBlinkCell(instrIndex: number, cycle: number): boolean {
    return this.hoverHighlightCells.has(`${instrIndex}_${cycle}`);
  }

  getCellTitle(cell: PipelineTimelineCell, stage: PipelineStage): string {
    if (cell.isBubble) return '气泡 (流水线停顿)';
    let title = `${stage} 阶段`;
    if (cell.hazardHighlight) {
      title += `\n冒险类型: ${this.getHazardTypeName(cell.hazardHighlight)}`;
    }
    if (cell.flushed) {
      title += '\n已被冲刷';
    }
    return title;
  }

  private getHazardTypeName(type: HazardType | undefined): string {
    switch (type) {
      case HazardType.RAW: return 'RAW (写后读)';
      case HazardType.WAR: return 'WAR (读后写)';
      case HazardType.WAW: return 'WAW (写后写)';
      case HazardType.CONTROL: return '控制冒险';
      case HazardType.STRUCTURAL: return '结构冒险';
      default: return '未知';
    }
  }
}
