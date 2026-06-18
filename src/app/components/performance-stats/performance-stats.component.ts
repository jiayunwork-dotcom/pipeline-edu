import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PerformanceStats } from '../../models/performance.model';
import { HazardType } from '../../models/register.model';

@Component({
  selector: 'app-performance-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="card-title">性能统计</div>

      <div class="stats-grid">
        <div class="stat-item big">
          <div class="stat-value primary">{{stats?.cpi?.toFixed(2) || '0.00'}}</div>
          <div class="stat-label">CPI (每条指令周期数)</div>
        </div>
        <div class="stat-item big">
          <div class="stat-value success">{{stats?.ipc?.toFixed(2) || '0.00'}}</div>
          <div class="stat-label">IPC (每周期指令数)</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{stats?.totalCycles || 0}}</div>
          <div class="stat-label">总周期数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{stats?.completedInstructions || 0}} / {{stats?.totalInstructions || 0}}</div>
          <div class="stat-label">完成/总指令</div>
        </div>
        <div class="stat-item">
          <div class="stat-value warning">{{stats?.totalStallCycles || 0}}</div>
          <div class="stat-label">停顿周期数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value success">{{stats?.forwardingUsed || 0}}</div>
          <div class="stat-label">数据转发次数</div>
        </div>
      </div>

      <div class="section-divider"></div>

      <div class="section-title">流水线级利用率</div>
      <div class="utilization-list">
        <div *ngFor="let util of stageUtilizations" class="util-row">
          <div class="util-stage">{{util.stage}}</div>
          <div class="util-bar-container">
            <div
              class="util-bar"
              [style.width]="(util.value * 100).toFixed(1) + '%'"
              [class]="'stage-' + util.stage.toLowerCase()"
            ></div>
          </div>
          <div class="util-value">{{(util.value * 100).toFixed(1)}}%</div>
        </div>
      </div>

      <div class="section-divider"></div>

      <div class="section-title">冒险统计</div>
      <div *ngIf="hazardBreakdown.length > 0" class="hazard-list">
        <div *ngFor="let h of hazardBreakdown" class="hazard-row">
          <span class="badge" [ngClass]="'badge-' + getHazardBadgeClass(h.type)">
            {{getHazardTypeName(h.type)}}
          </span>
          <span class="hazard-count">{{h.count}} 次</span>
        </div>
      </div>
      <div *ngIf="hazardBreakdown.length === 0" class="text-success">
        ✓ 未检测到冒险
      </div>

      <div *ngIf="stats?.branchPredictionStats" class="section-divider"></div>

      <div *ngIf="stats?.branchPredictionStats" class="section-title">分支预测</div>
      <div *ngIf="hasBranchStats" class="branch-stats">
        <div class="branch-row">
          <span>准确率:</span>
          <span class="stat-value" [ngClass]="branchAccuracy >= 0.8 ? 'text-success' : 'text-warning'">
            {{(branchAccuracy * 100).toFixed(1)}}%
          </span>
        </div>
        <div class="branch-row">
          <span>正确:</span>
          <span class="text-success">{{branchCorrect}}</span>
        </div>
        <div class="branch-row">
          <span>错误:</span>
          <span class="text-danger">{{branchIncorrect}}</span>
        </div>
        <div class="branch-row">
          <span>预测惩罚:</span>
          <span>{{branchPenalty}} 周期</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat-item {
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
      text-align: center;
    }
    .stat-item.big {
      grid-column: span 1;
      padding: 16px;
      background: linear-gradient(135deg, #ebf5fb 0%, #e8f8f5 100%);
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #2c3e50;
    }
    .stat-value.primary { color: #3498db; }
    .stat-value.success { color: #27ae60; }
    .stat-value.warning { color: #f39c12; }
    .stat-label {
      font-size: 12px;
      color: #6c757d;
      margin-top: 4px;
    }
    .section-divider {
      border-top: 1px solid #e9ecef;
      margin: 16px 0;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #495057;
      margin-bottom: 10px;
    }
    .util-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .util-stage {
      width: 40px;
      font-size: 12px;
      font-weight: 600;
      color: #495057;
    }
    .util-bar-container {
      flex: 1;
      height: 16px;
      background: #e9ecef;
      border-radius: 8px;
      overflow: hidden;
    }
    .util-bar {
      height: 100%;
      border-radius: 8px;
      transition: width 0.3s;
    }
    .util-bar.stage-if { background: #3498db; }
    .util-bar.stage-id { background: #2ecc71; }
    .util-bar.stage-ex { background: #f39c12; }
    .util-bar.stage-mem { background: #9b59b6; }
    .util-bar.stage-wb { background: #1abc9c; }
    .util-bar.stage-if1 { background: #2980b9; }
    .util-bar.stage-if2 { background: #3498db; }
    .util-bar.stage-ex1 { background: #e67e22; }
    .util-bar.stage-ex2 { background: #f39c12; }
    .util-value {
      width: 50px;
      text-align: right;
      font-size: 12px;
      font-weight: 600;
      color: #495057;
    }
    .hazard-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .hazard-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .hazard-count {
      font-weight: 600;
      font-size: 13px;
    }
    .branch-stats {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .branch-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 8px;
      background: #f8f9fa;
      border-radius: 4px;
      font-size: 13px;
    }
  `]
})
export class PerformanceStatsComponent {
  @Input() stats: PerformanceStats | null = null;

  get hasBranchStats(): boolean {
    return !!this.stats?.branchPredictionStats;
  }

  get branchAccuracy(): number {
    return this.stats?.branchPredictionStats?.accuracy || 0;
  }

  get branchCorrect(): number {
    return this.stats?.branchPredictionStats?.correct || 0;
  }

  get branchIncorrect(): number {
    return this.stats?.branchPredictionStats?.incorrect || 0;
  }

  get branchPenalty(): number {
    return this.stats?.branchPredictionStats?.mispredictionPenalty || 0;
  }

  get stageUtilizations(): { stage: string; value: number }[] {
    if (!this.stats?.stageUtilization) return [];
    const result: { stage: string; value: number }[] = [];
    this.stats.stageUtilization.forEach((value, stage) => {
      result.push({ stage, value });
    });
    return result.sort((a, b) => a.stage.localeCompare(b.stage));
  }

  get hazardBreakdown(): { type: HazardType; count: number }[] {
    if (!this.stats?.hazardStalls) return [];
    const result: { type: HazardType; count: number }[] = [];
    this.stats.hazardStalls.forEach((count, type) => {
      result.push({ type, count });
    });
    return result;
  }

  getHazardTypeName(type: HazardType): string {
    switch (type) {
      case HazardType.RAW: return 'RAW 写后读';
      case HazardType.WAR: return 'WAR 读后写';
      case HazardType.WAW: return 'WAW 写后写';
      case HazardType.CONTROL: return '控制冒险';
      case HazardType.STRUCTURAL: return '结构冒险';
      default: return '未知';
    }
  }

  getHazardBadgeClass(type: HazardType): string {
    switch (type) {
      case HazardType.RAW: return 'danger';
      case HazardType.WAR: return 'warning';
      case HazardType.WAW: return 'warning';
      case HazardType.CONTROL: return 'info';
      case HazardType.STRUCTURAL: return 'warning';
      default: return 'warning';
    }
  }
}
