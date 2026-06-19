import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PerformanceStats } from '../../models/performance.model';
import { HazardType } from '../../models/register.model';

interface ComparisonStats {
  label: string;
  stats: PerformanceStats | null;
  isBetter?: boolean;
}

@Component({
  selector: 'app-performance-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="card-title">性能统计</div>

      <!-- 对比模式：两行表格 -->
      <div *ngIf="comparisonStats && comparisonStats.length > 0" class="comparison-mode">
        <div class="comparison-table">
          <table>
            <thead>
              <tr>
                <th>配置</th>
                <th>总周期</th>
                <th>CPI</th>
                <th>停顿数</th>
                <th>转发数</th>
                <th>冲刷数</th>
                <th>IPC</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of comparisonStats" [class.better-row]="item.isBetter">
                <td class="config-label">
                  <strong>{{item.label}}</strong>
                </td>
                <td>{{item.stats?.totalCycles ?? '-'}}</td>
                <td class="cpi-cell" [class.better-cpi]="item.isBetter">
                  {{item.stats?.cpi?.toFixed(2) ?? '-'}}
                  <span *ngIf="item.isBetter" class="best-badge">✓ 更优</span>
                </td>
                <td>{{item.stats?.totalStallCycles ?? '-'}}</td>
                <td>{{item.stats?.forwardingUsed ?? '-'}}</td>
                <td>{{getFlushCount(item.stats)}}</td>
                <td>{{item.stats?.ipc?.toFixed(2) ?? '-'}}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="section-divider"></div>

        <div class="comparison-details">
          <div *ngFor="let item of comparisonStats" class="detail-block">
            <div class="detail-title" [class.better-title]="item.isBetter">
              {{item.label}} {{item.isBetter ? '(更优)' : ''}}
            </div>
            <div class="detail-stats-grid">
              <div class="mini-stat">
                <div class="mini-stat-value" [class.primary]="!item.isBetter" [class.success]="item.isBetter">
                  {{item.stats?.cpi?.toFixed(2) || '0.00'}}
                </div>
                <div class="mini-stat-label">CPI</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-value success">{{item.stats?.ipc?.toFixed(2) || '0.00'}}</div>
                <div class="mini-stat-label">IPC</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-value">{{item.stats?.totalCycles || 0}}</div>
                <div class="mini-stat-label">总周期</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-value warning">{{item.stats?.totalStallCycles || 0}}</div>
                <div class="mini-stat-label">停顿</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-value success">{{item.stats?.forwardingUsed || 0}}</div>
                <div class="mini-stat-label">转发</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-value danger">{{getFlushCount(item.stats)}}</div>
                <div class="mini-stat-label">冲刷</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 单配置模式：原显示方式 -->
      <ng-container *ngIf="!comparisonModeEnabled">
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
      </ng-container>
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
    .stat-value.danger { color: #e74c3c; }
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
    .text-success { color: #27ae60; }
    .text-warning { color: #f39c12; }
    .text-danger { color: #e74c3c; }

    /* 对比模式样式 */
    .comparison-mode .comparison-table {
      overflow-x: auto;
      border-radius: 6px;
    }
    .comparison-mode table {
      width: 100%;
      font-size: 12px;
      border-collapse: collapse;
    }
    .comparison-mode th {
      background: #34495e;
      color: white;
      padding: 8px 6px;
      font-weight: 600;
      white-space: nowrap;
    }
    .comparison-mode td {
      padding: 8px 6px;
      text-align: center;
      border-bottom: 1px solid #e9ecef;
      background: #f8f9fa;
    }
    .comparison-mode .config-label {
      text-align: left;
      font-weight: 600;
    }
    .comparison-mode tr.better-row td {
      background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
      border-bottom-color: #a3d9a5;
    }
    .comparison-mode .cpi-cell {
      font-weight: 600;
      font-size: 14px;
    }
    .comparison-mode .better-cpi {
      color: #27ae60;
    }
    .comparison-mode .best-badge {
      display: inline-block;
      font-size: 10px;
      background: #27ae60;
      color: white;
      padding: 1px 5px;
      border-radius: 8px;
      margin-left: 4px;
      font-weight: 500;
    }
    .comparison-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .detail-block {
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
    }
    .detail-title {
      font-size: 13px;
      font-weight: 600;
      color: #34495e;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 2px solid #dee2e6;
    }
    .better-title {
      color: #27ae60;
      border-bottom-color: #27ae60;
    }
    .detail-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .mini-stat {
      text-align: center;
      padding: 6px 4px;
      background: white;
      border-radius: 4px;
    }
    .mini-stat-value {
      font-size: 16px;
      font-weight: 700;
      color: #2c3e50;
    }
    .mini-stat-value.primary { color: #3498db; }
    .mini-stat-value.success { color: #27ae60; }
    .mini-stat-value.warning { color: #f39c12; }
    .mini-stat-value.danger { color: #e74c3c; }
    .mini-stat-label {
      font-size: 10px;
      color: #6c757d;
      margin-top: 2px;
    }
    @media (max-width: 600px) {
      .comparison-details { grid-template-columns: 1fr; }
    }
  `]
})
export class PerformanceStatsComponent {
  @Input() stats: PerformanceStats | null = null;
  @Input() comparisonStats: ComparisonStats[] | null = null;

  get comparisonModeEnabled(): boolean {
    return this.comparisonStats !== null && this.comparisonStats.length > 0;
  }

  getFlushCount(stats: PerformanceStats | null | undefined): number {
    if (!stats?.hazardStalls) return 0;
    return stats.hazardStalls.get(HazardType.CONTROL) || 0;
  }

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
