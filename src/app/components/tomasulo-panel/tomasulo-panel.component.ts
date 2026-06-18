import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TomasuloState, ReservationStation, ROBEntry } from '../../models/tomasulo.model';

@Component({
  selector: 'app-tomasulo-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tomasulo-container">
      <div class="card">
        <div class="card-title flex justify-between items-center">
          <span>Tomasulo 算法状态</span>
          <span class="badge badge-info">周期: {{state?.cycle || 0}}</span>
        </div>

        <div class="mb-4">
          <div class="section-subtitle">保留站 (Reservation Stations)</div>
          <div class="table-container">
            <table class="rs-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Busy</th>
                  <th>Op</th>
                  <th>Vj</th>
                  <th>Vk</th>
                  <th>Qj</th>
                  <th>Qk</th>
                  <th>A</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let rs of state?.reservationStations" [class.busy]="rs.busy">
                  <td class="rs-name">{{rs.name}}</td>
                  <td>
                    <span [class]="rs.busy ? 'badge badge-danger' : 'badge badge-success'">
                      {{rs.busy ? '是' : '否'}}
                    </span>
                  </td>
                  <td class="mono">{{rs.op || '-'}}</td>
                  <td class="mono" [class.has-value]="rs.Vj !== null">{{rs.Vj !== null ? rs.Vj : '-'}}</td>
                  <td class="mono" [class.has-value]="rs.Vk !== null">{{rs.Vk !== null ? rs.Vk : '-'}}</td>
                  <td class="mono" [class.waiting]="rs.Qj !== null">{{rs.Qj || '-'}}</td>
                  <td class="mono" [class.waiting]="rs.Qk !== null">{{rs.Qk || '-'}}</td>
                  <td class="mono">{{rs.A !== null ? rs.A : '-'}}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mb-4">
          <div class="section-subtitle">功能单元 (Functional Units)</div>
          <div class="fu-grid">
            <div *ngFor="let fu of state?.functionalUnits" class="fu-card" [class.busy]="fu.busy">
              <div class="fu-name">{{fu.name}}</div>
              <div class="fu-type">{{fu.type}}</div>
              <div class="fu-status" [class]="fu.busy ? 'text-warning' : 'text-success'">
                {{fu.busy ? '执行中' : '空闲'}}
              </div>
              <div *ngIf="fu.busy" class="fu-cycles">
                剩余: {{fu.cyclesRemaining}} / {{fu.latency}}
              </div>
            </div>
          </div>
        </div>

        <div class="mb-4">
          <div class="section-subtitle">重排序缓冲 (ROB)</div>
          <div *ngIf="robLength === 0" class="text-center text-muted py-4">
            ROB 为空
          </div>
          <div *ngIf="robLength > 0" class="rob-container">
            <div *ngFor="let rob of reorderBuffer" class="rob-entry" [class.ready]="rob.ready" [class.committed]="rob.state === 'COMMIT'">
              <div class="rob-id">{{rob.id}}</div>
              <div class="rob-state">
                <span class="badge" [ngClass]="getRobStateBadge(rob.state)">
                  {{getRobStateName(rob.state)}}
                </span>
              </div>
              <div class="rob-instr mono">{{rob.instruction.opcode}}</div>
              <div class="rob-dest">
                {{rob.destination !== null ? 'x' + rob.destination : '-'}}
              </div>
              <div class="rob-value mono" [class.has-value]="rob.value !== null">
                {{rob.value !== null ? rob.value : '-'}}
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="hasLastCDB" class="mb-4">
          <div class="section-subtitle">CDB 广播 (最新)</div>
          <div class="cdb-broadcast">
            <div class="cdb-row">
              <span>来源:</span>
              <span class="mono font-bold">{{lastCDBSource}}</span>
            </div>
            <div class="cdb-row">
              <span>值:</span>
              <span class="mono font-bold text-success">{{lastCDBValue}}</span>
            </div>
            <div class="cdb-row">
              <span>目标寄存器:</span>
              <span class="mono">
                {{lastCDBDest}}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div class="section-subtitle">寄存器重命名映射</div>
          <div class="rename-grid">
            <div *ngFor="let rr of renameDisplay" class="rename-cell" [class.has-rob]="rr.robId !== null">
              <span class="rename-reg">{{rr.reg}}</span>
              <span class="rename-rob">{{rr.robId || '—'}}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .section-subtitle {
      font-size: 13px;
      font-weight: 600;
      color: #34495e;
      margin-bottom: 8px;
      padding-left: 4px;
      border-left: 3px solid #3498db;
    }
    .table-container {
      overflow-x: auto;
    }
    .rs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .rs-table th {
      background: #34495e;
      color: white;
      padding: 8px 10px;
      text-align: center;
      font-weight: 500;
    }
    .rs-table td {
      padding: 6px 10px;
      border: 1px solid #dee2e6;
      text-align: center;
    }
    .rs-table tr.busy td {
      background: #fff8e1;
    }
    .rs-name {
      font-weight: 600;
      color: #2980b9;
    }
    .mono {
      font-family: 'Courier New', monospace;
    }
    .font-bold {
      font-weight: 700;
    }
    .has-value {
      color: #27ae60;
      font-weight: 600;
    }
    .waiting {
      color: #e74c3c;
      font-weight: 600;
    }
    .fu-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
    }
    .fu-card {
      padding: 12px;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      text-align: center;
      background: #f8f9fa;
    }
    .fu-card.busy {
      background: #fff8e1;
      border-color: #f39c12;
    }
    .fu-name {
      font-weight: 600;
      font-size: 13px;
      color: #2c3e50;
    }
    .fu-type {
      font-size: 11px;
      color: #7f8c8d;
      margin: 2px 0;
    }
    .fu-status {
      font-size: 12px;
      font-weight: 600;
    }
    .fu-cycles {
      font-size: 11px;
      color: #e67e22;
      margin-top: 4px;
    }
    .rob-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .rob-entry {
      display: grid;
      grid-template-columns: 60px 100px 1fr 60px 1fr;
      gap: 10px;
      align-items: center;
      padding: 8px 12px;
      background: #f8f9fa;
      border-radius: 6px;
      border-left: 4px solid #95a5a6;
    }
    .rob-entry.ready {
      border-left-color: #27ae60;
      background: #eafaf1;
    }
    .rob-entry.committed {
      border-left-color: #2ecc71;
      background: #d5f5e3;
      opacity: 0.8;
    }
    .rob-id {
      font-weight: 700;
      color: #2980b9;
    }
    .rob-dest {
      font-family: 'Courier New', monospace;
      text-align: center;
    }
    .rob-value.has-value {
      color: #27ae60;
      font-weight: 600;
    }
    .cdb-broadcast {
      padding: 12px;
      background: linear-gradient(135deg, #e8f6f3 0%, #d5f5e3 100%);
      border-radius: 6px;
      border: 1px solid #a3e4d7;
    }
    .cdb-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 13px;
    }
    .rename-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
    }
    .rename-cell {
      display: flex;
      justify-content: space-between;
      padding: 4px 8px;
      background: #f8f9fa;
      border-radius: 4px;
      font-size: 11px;
      border: 1px solid #dee2e6;
    }
    .rename-cell.has-rob {
      background: #fef9e7;
      border-color: #f39c12;
    }
    .rename-reg {
      color: #495057;
      font-weight: 600;
    }
    .rename-rob {
      font-family: 'Courier New', monospace;
      color: #e67e22;
      font-weight: 600;
    }
    .text-muted {
      color: #adb5bd;
    }
  `]
})
export class TomasuloPanelComponent {
  @Input() state: TomasuloState | null = null;

  get reorderBuffer(): ROBEntry[] {
    return this.state?.reorderBuffer || [];
  }

  get robLength(): number {
    return this.state?.reorderBuffer?.length || 0;
  }

  get hasLastCDB(): boolean {
    return !!this.state?.lastCDBBroadcast;
  }

  get lastCDBSource(): string {
    return this.state?.lastCDBBroadcast?.source || '';
  }

  get lastCDBValue(): number {
    return this.state?.lastCDBBroadcast?.value || 0;
  }

  get lastCDBDest(): string {
    const dest = this.state?.lastCDBBroadcast?.destination;
    return dest !== null && dest !== undefined ? 'x' + dest : '无';
  }

  get renameDisplay(): { reg: string; robId: string | null }[] {
    if (!this.state?.registerReorder) return [];
    return this.state.registerReorder.map((id, i) => ({
      reg: `x${i}`,
      robId: id
    }));
  }

  getRobStateName(state: string): string {
    switch (state) {
      case 'ISSUE': return '发射';
      case 'EXECUTE': return '执行';
      case 'WRITE_RESULT': return '写回';
      case 'COMMIT': return '提交';
      default: return state;
    }
  }

  getRobStateBadge(state: string): string {
    switch (state) {
      case 'ISSUE': return 'badge-info';
      case 'EXECUTE': return 'badge-warning';
      case 'WRITE_RESULT': return 'badge-success';
      case 'COMMIT': return 'badge-success';
      default: return 'badge-warning';
    }
  }
}
