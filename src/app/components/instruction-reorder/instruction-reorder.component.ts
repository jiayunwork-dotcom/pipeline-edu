import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Instruction, Opcode } from '../../models/instruction.model';
import { InstructionParserService } from '../../services/instruction-parser.service';
import { HazardType } from '../../models/register.model';

interface ReorderInstruction {
  instruction: Instruction;
  violations: DependencyViolation[];
}

interface DependencyViolation {
  register: number;
  type: 'RAW' | 'WAR' | 'WAW';
  dependsOnId: string;
}

interface HazardPreview {
  rawHazards: number;
  stallCycles: number;
  estimatedCpi: number;
}

@Component({
  selector: 'app-instruction-reorder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="reorder-container">
      <div class="card-title flex justify-between items-center">
        <span>指令重排序</span>
        <div class="reorder-actions">
          <button class="warning" (click)="autoOptimize()" [disabled]="reorderedList.length < 2">
            ✨ 自动优化
          </button>
          <button class="success" (click)="applyToSimulator()" [disabled]="reorderedList.length === 0 || hasViolations">
            ▶ 应用到模拟器
          </button>
        </div>
      </div>

      <div *ngIf="optimizationResult" class="optimization-result">
        <div class="optimization-title">优化结果</div>
        <div class="optimization-stats">
          <span>优化前 CPI: <strong>{{optimizationResult.beforeCpi.toFixed(2)}}</strong></span>
          <span>→</span>
          <span>优化后 CPI: <strong class="text-success">{{optimizationResult.afterCpi.toFixed(2)}}</strong></span>
          <span *ngIf="optimizationResult.improvement > 0" class="text-success">
            (提升 {{optimizationResult.improvement.toFixed(1)}}%)
          </span>
        </div>
      </div>

      <div class="reorder-content">
        <div class="instruction-list-wrapper">
          <div *ngIf="reorderedList.length === 0" class="empty-reorder">
            <div class="empty-icon">📝</div>
            <p>在上方输入指令后，此处将显示可拖拽的指令列表</p>
          </div>

          <div
            *ngFor="let item of reorderedList; let i = index; trackBy: trackById"
            class="instruction-card"
            [class.dragging]="draggingIndex === i"
            [class.drag-over]="dragOverIndex === i && dragDirection === 'above'"
            [class.drag-over-below]="dragOverIndex === i && dragDirection === 'below'"
            [class.has-violation]="item.violations.length > 0"
            draggable="true"
            (dragstart)="onDragStart(i, $event)"
            (dragend)="onDragEnd()"
            (dragover)="onDragOver(i, $event)"
            (dragleave)="onDragLeave()"
            (drop)="onDrop(i, $event)"
          >
            <div class="card-header">
              <span class="instruction-index">{{i + 1}}</span>
              <span class="drag-handle">⋮⋮</span>
            </div>
            <div class="instruction-content">
              <code class="instruction-text">{{item.instruction.rawText}}</code>
              <div class="instruction-meta">
                <span *ngIf="item.instruction.rd !== undefined && item.instruction.needsWriteback" class="meta-badge write">
                  写 x{{item.instruction.rd}}
                </span>
                <span *ngIf="item.instruction.rs1 !== undefined" class="meta-badge read">
                  读 x{{item.instruction.rs1}}
                </span>
                <span *ngIf="item.instruction.rs2 !== undefined" class="meta-badge read">
                  读 x{{item.instruction.rs2}}
                </span>
                <span *ngIf="item.instruction.isLoad" class="meta-badge load">LOAD</span>
                <span *ngIf="item.instruction.isStore" class="meta-badge store">STORE</span>
                <span *ngIf="item.instruction.isBranch" class="meta-badge branch">BRANCH</span>
              </div>
            </div>
            <div *ngIf="item.violations.length > 0" class="violation-warning">
              <div class="violation-icon">⚠️</div>
              <div class="violation-text">
                <div *ngFor="let v of item.violations" class="violation-item">
                  {{v.type}}冒险: x{{v.register}} 依赖被破坏
                </div>
              </div>
            </div>
          </div>

          <div
            *ngIf="dragOverIndex === reorderedList.length && draggingIndex !== null"
            class="drop-indicator-bottom"
          ></div>
        </div>

        <div class="hazard-preview">
          <div class="preview-title">冒险预览</div>
          
          <div class="preview-stats">
            <div class="stat-item">
              <div class="stat-value hazard-raw">{{hazardPreview.rawHazards}}</div>
              <div class="stat-label">RAW 冒险</div>
            </div>
            <div class="stat-item">
              <div class="stat-value hazard-stall">{{hazardPreview.stallCycles}}</div>
              <div class="stat-label">Stall 周期</div>
            </div>
            <div class="stat-item">
              <div class="stat-value hazard-cpi">{{hazardPreview.estimatedCpi.toFixed(2)}}</div>
              <div class="stat-label">预估 CPI</div>
            </div>
          </div>

          <div class="preview-details">
            <div class="detail-title">冒险详情</div>
            <div *ngIf="detailedHazards.length === 0" class="no-hazards">
              ✅ 未检测到数据冒险
            </div>
            <div *ngFor="let h of detailedHazards" class="hazard-detail-item">
              <span class="hazard-type-badge" [ngClass]="'type-' + h.type.toLowerCase()">
                {{h.type}}
              </span>
              <span class="hazard-detail-text">
                指令 {{h.instrIndex1 + 1}} → {{h.instrIndex2 + 1}} (x{{h.register}})
                <span *ngIf="h.needsStall" class="stall-tag">需要Stall</span>
              </span>
            </div>
          </div>

          <div class="preview-legend">
            <div class="legend-title">图例</div>
            <div class="legend-items">
              <div class="legend-item">
                <span class="legend-dot write"></span>
                <span>写寄存器</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot read"></span>
                <span>读寄存器</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot load"></span>
                <span>加载指令</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .reorder-container {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .reorder-actions {
      display: flex;
      gap: 8px;
    }
    .reorder-actions button {
      padding: 6px 12px;
      font-size: 13px;
    }
    .optimization-result {
      padding: 12px;
      background: linear-gradient(135deg, #eafaf1, #d4edda);
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .optimization-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--success);
      margin-bottom: 4px;
    }
    .optimization-stats {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .reorder-content {
      display: grid;
      grid-template-columns: 1fr 260px;
      gap: 16px;
    }
    @media (max-width: 900px) {
      .reorder-content {
        grid-template-columns: 1fr;
      }
    }
    .instruction-list-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 500px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .empty-reorder {
      padding: 40px 20px;
      text-align: center;
      color: var(--gray-500);
      background: var(--gray-100);
      border-radius: 6px;
      border: 2px dashed var(--gray-300);
    }
    .empty-icon {
      font-size: 36px;
      margin-bottom: 8px;
    }
    .instruction-card {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      background: var(--gray-100);
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: grab;
      transition: all 0.15s ease;
      position: relative;
    }
    .instruction-card:hover {
      background: var(--gray-200);
      border-color: var(--gray-300);
    }
    .instruction-card.dragging {
      opacity: 0.4;
      cursor: grabbing;
    }
    .instruction-card.drag-over {
      border-top-color: var(--primary);
      border-top-width: 3px;
    }
    .instruction-card.drag-over-below {
      border-bottom-color: var(--primary);
      border-bottom-width: 3px;
    }
    .instruction-card.has-violation {
      background: #fde8e8;
      border-color: #f5c6cb;
    }
    .card-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 36px;
    }
    .instruction-index {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: var(--primary);
      color: white;
      border-radius: 50%;
      font-size: 12px;
      font-weight: 600;
    }
    .has-violation .instruction-index {
      background: var(--danger);
    }
    .drag-handle {
      color: var(--gray-400);
      font-size: 14px;
      letter-spacing: -2px;
      line-height: 1;
    }
    .instruction-content {
      flex: 1;
      min-width: 0;
    }
    .instruction-text {
      display: block;
      font-family: 'Courier New', 'Monaco', monospace;
      font-size: 13px;
      font-weight: 600;
      color: var(--gray-800);
      margin-bottom: 4px;
    }
    .instruction-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .meta-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
    }
    .meta-badge.write {
      background: #fde2e2;
      color: #c92a2a;
    }
    .meta-badge.read {
      background: #d3f9d8;
      color: #2f9e44;
    }
    .meta-badge.load {
      background: #e7f5ff;
      color: #1971c2;
    }
    .meta-badge.store {
      background: #fff3bf;
      color: #e67700;
    }
    .meta-badge.branch {
      background: #f3d9fa;
      color: #9c36b5;
    }
    .violation-warning {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 6px 8px;
      background: #fff5f5;
      border-radius: 4px;
      margin-top: 6px;
    }
    .violation-icon {
      font-size: 14px;
    }
    .violation-text {
      flex: 1;
    }
    .violation-item {
      font-size: 11px;
      color: #c92a2a;
      line-height: 1.4;
    }
    .drop-indicator-bottom {
      height: 4px;
      background: var(--primary);
      border-radius: 2px;
    }
    .hazard-preview {
      background: var(--gray-100);
      border-radius: 6px;
      padding: 12px;
    }
    .preview-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--gray-800);
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--gray-300);
    }
    .preview-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .stat-item {
      text-align: center;
      padding: 8px 4px;
      background: white;
      border-radius: 4px;
    }
    .stat-value {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.1;
    }
    .stat-value.hazard-raw {
      color: var(--danger);
    }
    .stat-value.hazard-stall {
      color: var(--warning);
    }
    .stat-value.hazard-cpi {
      color: var(--primary);
    }
    .stat-label {
      font-size: 11px;
      color: var(--gray-600);
      margin-top: 2px;
    }
    .preview-details {
      margin-bottom: 12px;
    }
    .detail-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--gray-700);
      margin-bottom: 6px;
    }
    .no-hazards {
      padding: 8px;
      background: #d4edda;
      color: #155724;
      border-radius: 4px;
      font-size: 12px;
      text-align: center;
    }
    .hazard-detail-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      background: white;
      border-radius: 3px;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .hazard-type-badge {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
    }
    .hazard-type-badge.type-raw {
      background: #fde8e8;
      color: var(--danger);
    }
    .hazard-type-badge.type-war {
      background: #fff3cd;
      color: var(--warning);
    }
    .hazard-type-badge.type-waw {
      background: #fff3cd;
      color: var(--warning);
    }
    .hazard-detail-text {
      flex: 1;
      color: var(--gray-700);
    }
    .stall-tag {
      display: inline-block;
      padding: 0 4px;
      background: #fff3cd;
      color: #856404;
      border-radius: 2px;
      font-size: 10px;
      margin-left: 4px;
    }
    .preview-legend {
      padding-top: 8px;
      border-top: 1px solid var(--gray-300);
    }
    .legend-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--gray-700);
      margin-bottom: 6px;
    }
    .legend-items {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--gray-600);
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }
    .legend-dot.write {
      background: #fde2e2;
      border: 1px solid #c92a2a;
    }
    .legend-dot.read {
      background: #d3f9d8;
      border: 1px solid #2f9e44;
    }
    .legend-dot.load {
      background: #e7f5ff;
      border: 1px solid #1971c2;
    }
  `]
})
export class InstructionReorderComponent implements OnChanges {
  @Input() instructions: Instruction[] = [];
  @Input() enableForwarding: boolean = true;

  @Output() applyInstructions = new EventEmitter<Instruction[]>();

  reorderedList: ReorderInstruction[] = [];
  draggingIndex: number | null = null;
  dragOverIndex: number | null = null;
  dragDirection: 'above' | 'below' = 'above';

  hazardPreview: HazardPreview = {
    rawHazards: 0,
    stallCycles: 0,
    estimatedCpi: 1.0
  };

  detailedHazards: Array<{
    type: 'RAW' | 'WAR' | 'WAW';
    instrIndex1: number;
    instrIndex2: number;
    register: number;
    needsStall: boolean;
  }> = [];

  optimizationResult: {
    beforeCpi: number;
    afterCpi: number;
    improvement: number;
  } | null = null;

  constructor(private parser: InstructionParserService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['instructions']) {
      this.syncFromInstructions();
    }
  }

  get hasViolations(): boolean {
    return this.reorderedList.some(item => item.violations.length > 0);
  }

  trackById(index: number, item: ReorderInstruction): string {
    return item.instruction.id;
  }

  private syncFromInstructions(): void {
    this.reorderedList = this.instructions.map(instr => ({
      instruction: instr,
      violations: []
    }));
    this.optimizationResult = null;
    this.checkAllDependencies();
    this.updateHazardPreview();
  }

  onDragStart(index: number, event: DragEvent): void {
    this.draggingIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', index.toString());
    }
  }

  onDragEnd(): void {
    this.draggingIndex = null;
    this.dragOverIndex = null;
  }

  onDragOver(index: number, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    this.dragDirection = event.clientY < midY ? 'above' : 'below';
    this.dragOverIndex = index;
  }

  onDragLeave(): void {
    if (this.dragOverIndex !== null) {
      this.dragOverIndex = null;
    }
  }

  onDrop(targetIndex: number, event: DragEvent): void {
    event.preventDefault();
    if (this.draggingIndex === null || this.draggingIndex === targetIndex) {
      this.draggingIndex = null;
      this.dragOverIndex = null;
      return;
    }

    const sourceIndex = this.draggingIndex;
    const item = this.reorderedList[sourceIndex];
    
    let insertIndex = targetIndex;
    if (this.dragDirection === 'below') {
      insertIndex = targetIndex + 1;
    }
    if (sourceIndex < insertIndex) {
      insertIndex--;
    }

    const newList = [...this.reorderedList];
    newList.splice(sourceIndex, 1);
    newList.splice(insertIndex, 0, item);
    this.reorderedList = newList;

    this.draggingIndex = null;
    this.dragOverIndex = null;
    this.optimizationResult = null;

    this.checkAllDependencies();
    this.updateHazardPreview();
  }

  private checkAllDependencies(): void {
    const writeMap = new Map<number, string[]>();
    
    for (let i = 0; i < this.reorderedList.length; i++) {
      const item = this.reorderedList[i];
      item.violations = [];
      const instr = item.instruction;

      if (instr.rs1 !== undefined && instr.rs1 !== 0) {
        const writers = writeMap.get(instr.rs1) || [];
        if (writers.length === 0) {
          const originalWriters = this.findOriginalWriters(instr.rs1, i);
          if (originalWriters.length > 0) {
            item.violations.push({
              register: instr.rs1,
              type: 'RAW',
              dependsOnId: originalWriters[0]
            });
          }
        }
      }

      if (instr.rs2 !== undefined && instr.rs2 !== 0) {
        const writers = writeMap.get(instr.rs2) || [];
        if (writers.length === 0) {
          const originalWriters = this.findOriginalWriters(instr.rs2, i);
          if (originalWriters.length > 0) {
            item.violations.push({
              register: instr.rs2,
              type: 'RAW',
              dependsOnId: originalWriters[0]
            });
          }
        }
      }

      if (instr.rd !== undefined && instr.needsWriteback && instr.rd !== 0) {
        if (!writeMap.has(instr.rd)) {
          writeMap.set(instr.rd, []);
        }
        writeMap.get(instr.rd)!.push(instr.id);
      }
    }
  }

  private findOriginalWriters(register: number, currentIndex: number): string[] {
    const writers: string[] = [];
    for (let j = currentIndex + 1; j < this.reorderedList.length; j++) {
      const laterInstr = this.reorderedList[j].instruction;
      if (laterInstr.rd !== undefined && laterInstr.rd === register && laterInstr.needsWriteback) {
        writers.push(laterInstr.id);
      }
    }
    return writers;
  }

  private updateHazardPreview(): void {
    const orderedInstructions = this.reorderedList.map(item => item.instruction);
    
    let rawHazards = 0;
    let stallCycles = 0;
    const hazards: typeof this.detailedHazards = [];

    for (let i = 0; i < orderedInstructions.length; i++) {
      const instr = orderedInstructions[i];
      const regsToCheck: number[] = [];
      
      if (instr.rs1 !== undefined && instr.rs1 !== 0) regsToCheck.push(instr.rs1);
      if (instr.rs2 !== undefined && instr.rs2 !== 0) regsToCheck.push(instr.rs2);

      for (const reg of regsToCheck) {
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const prevInstr = orderedInstructions[j];
          if (prevInstr.rd !== undefined && prevInstr.rd === reg && prevInstr.needsWriteback) {
            const distance = i - j;
            let needsStall = false;

            if (!this.enableForwarding) {
              if (distance <= 3) {
                needsStall = true;
                stallCycles += (4 - distance);
              }
            } else {
              if (prevInstr.isLoad && distance === 1) {
                needsStall = true;
                stallCycles += 1;
              }
            }

            rawHazards++;
            hazards.push({
              type: 'RAW',
              instrIndex1: j,
              instrIndex2: i,
              register: reg,
              needsStall
            });
            break;
          }
        }
      }
    }

    const baseCycles = 4 + orderedInstructions.length;
    const totalCycles = baseCycles + stallCycles;
    const estimatedCpi = orderedInstructions.length > 0 ? totalCycles / orderedInstructions.length : 1.0;

    this.hazardPreview = {
      rawHazards,
      stallCycles,
      estimatedCpi
    };

    this.detailedHazards = hazards;
  }

  autoOptimize(): void {
    if (this.reorderedList.length < 2) return;

    const beforeCpi = this.hazardPreview.estimatedCpi;
    const originalInstructions = this.reorderedList.map(item => ({ ...item.instruction }));

    const optimized = this.greedyOptimize(originalInstructions);
    
    this.reorderedList = optimized.map(instr => ({
      instruction: instr,
      violations: []
    }));

    this.checkAllDependencies();
    this.updateHazardPreview();

    const afterCpi = this.hazardPreview.estimatedCpi;
    const improvement = beforeCpi > 0 ? ((beforeCpi - afterCpi) / beforeCpi) * 100 : 0;

    this.optimizationResult = {
      beforeCpi,
      afterCpi,
      improvement: Math.max(0, improvement)
    };
  }

  private greedyOptimize(instructions: Instruction[]): Instruction[] {
    const remaining = [...instructions];
    const result: Instruction[] = [];
    const pendingWrites = new Map<number, { instr: Instruction; issuedAt: number }>();

    while (remaining.length > 0) {
      let bestIndex = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const score = this.scoreCandidate(candidate, pendingWrites, result.length);
        
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex === -1) {
        bestIndex = 0;
      }

      const selected = remaining.splice(bestIndex, 1)[0];
      result.push(selected);

      pendingWrites.forEach((value, key) => {
        if (result.length - value.issuedAt >= 4) {
          pendingWrites.delete(key);
        }
      });

      if (selected.rd !== undefined && selected.needsWriteback && selected.rd !== 0) {
        pendingWrites.set(selected.rd, { instr: selected, issuedAt: result.length - 1 });
      }
    }

    return result;
  }

  private scoreCandidate(
    candidate: Instruction,
    pendingWrites: Map<number, { instr: Instruction; issuedAt: number }>,
    currentPosition: number
  ): number {
    let score = 0;

    const regsToCheck: number[] = [];
    if (candidate.rs1 !== undefined && candidate.rs1 !== 0) regsToCheck.push(candidate.rs1);
    if (candidate.rs2 !== undefined && candidate.rs2 !== 0) regsToCheck.push(candidate.rs2);

    for (const reg of regsToCheck) {
      const pending = pendingWrites.get(reg);
      if (pending) {
        const distance = currentPosition - pending.issuedAt;
        if (pending.instr.isLoad && distance < 2) {
          score -= 100;
        } else if (distance < 2) {
          score -= 50;
        } else if (distance < 3) {
          score -= 20;
        } else if (!this.enableForwarding && distance < 4) {
          score -= 30;
        }
      }
    }

    if (regsToCheck.length === 0) {
      score += 5;
    }

    if (candidate.isLoad) {
      score += 3;
    }

    return score;
  }

  applyToSimulator(): void {
    if (this.hasViolations) return;
    const orderedInstructions = this.reorderedList.map(item => item.instruction);
    this.applyInstructions.emit(orderedInstructions);
  }
}
