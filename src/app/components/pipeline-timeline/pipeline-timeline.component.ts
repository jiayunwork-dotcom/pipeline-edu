import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PipelineTimeline, PipelineStage, PipelineTimelineCell,
  getPipelineStages, PipelineModel, ForwardingPath, HazardType
} from '../../models/register.model';
import { Instruction } from '../../models/instruction.model';
import { InstructionParserService } from '../../services/instruction-parser.service';

@Component({
  selector: 'app-pipeline-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-container" *ngIf="timeline">
      <div class="timeline-header">
        <div class="instruction-label-header">指令</div>
        <div class="cycles-container">
          <div
            *ngFor="let c of cycleNumbers"
            class="cycle-header"
            [class.current-cycle]="c === currentCycle"
          >
            {{c}}
          </div>
        </div>
      </div>
      <div class="timeline-body">
        <div
          *ngFor="let instr of timeline.instructions; let i = index"
          class="timeline-row"
        >
          <div class="instruction-label" [title]="instr.rawText">
            <span class="instr-index">{{i + 1}}.</span>
            <span class="instr-text">{{parser.formatInstruction(instr)}}</span>
          </div>
          <div class="cycles-container">
            <ng-container *ngFor="let c of cycleNumbers">
              <div
                *ngFor="let stage of stages"
                class="timeline-cell-wrapper"
              >
                <div
                  *ngIf="getCell(i, c, stage) as cell"
                  class="timeline-cell"
                  [class]="getCellClass(cell, stage)"
                  [title]="getCellTitle(cell, stage)"
                >
                  <span *ngIf="!cell.isBubble">{{stage}}</span>
                  <span *ngIf="cell.isBubble && stage === stages[0]">
                    <span class="bubble-text">BUBBLE</span>
                  </span>
                </div>
              </div>
            </ng-container>
          </div>
        </div>
      </div>

      <svg *ngIf="forwardingPaths.length > 0" class="forwarding-arrows">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#27ae60" />
          </marker>
        </defs>
      </svg>

      <div class="legend">
        <div class="legend-item">
          <span class="legend-color if"></span>
          <span>取指 IF</span>
        </div>
        <div class="legend-item">
          <span class="legend-color id"></span>
          <span>译码 ID</span>
        </div>
        <div class="legend-item">
          <span class="legend-color ex"></span>
          <span>执行 EX</span>
        </div>
        <div class="legend-item">
          <span class="legend-color mem"></span>
          <span>访存 MEM</span>
        </div>
        <div class="legend-item">
          <span class="legend-color wb"></span>
          <span>写回 WB</span>
        </div>
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
    .cycle-header {
      width: 60px;
      min-width: 60px;
      padding: 6px;
      text-align: center;
      font-size: 11px;
      font-weight: 600;
      color: #6c757d;
      border-right: 1px solid #e9ecef;
    }
    .cycle-header.current-cycle {
      background: #e3f2fd;
      color: #1976d2;
    }
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
      transition: transform 0.15s;
    }
    .timeline-cell:hover {
      transform: scale(1.05);
      z-index: 5;
      position: relative;
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
    .forwarding-arrows {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
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
export class PipelineTimelineComponent implements OnInit, OnChanges {
  @Input() timeline!: PipelineTimeline;
  @Input() pipelineModel: PipelineModel = '5-stage';
  @Input() currentCycle: number = 0;
  @Input() forwardingPaths: ForwardingPath[] = [];

  stages: PipelineStage[] = [];
  cycleNumbers: number[] = [];

  constructor(public parser: InstructionParserService) {}

  ngOnInit(): void {
    this.updateData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['timeline'] || changes['pipelineModel']) {
      this.updateData();
    }
  }

  private updateData(): void {
    this.stages = getPipelineStages(this.pipelineModel);
    if (this.timeline) {
      this.cycleNumbers = Array.from({ length: this.timeline.cycles }, (_, i) => i + 1);
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

  getCellClass(cell: PipelineTimelineCell, stage: PipelineStage): string[] {
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
