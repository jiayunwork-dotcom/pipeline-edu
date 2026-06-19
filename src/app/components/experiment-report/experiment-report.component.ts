import { Component, ViewChild, ElementRef, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import html2canvas from 'html2canvas';
import { InstructionParserService, ParseError } from '../../services/instruction-parser.service';
import { PipelineSimulatorService, SimulatorConfig } from '../../services/pipeline-simulator.service';
import { BranchPredictionStrategy } from '../../models/branch-prediction.model';
import {
  ExperimentConfig, ExperimentResult, ExperimentAnalysis,
  ExperimentPipelineModel
} from '../../models/performance.model';

@Component({
  selector: 'app-experiment-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="experiment-container">
      <div class="experiment-header">
        <h2>📊 批量实验与对比报告</h2>
        <p class="subtitle">配置多组流水线参数，自动运行并生成对比分析报告</p>
      </div>

      <div class="experiment-content">
        <div class="config-panel panel">
          <div class="panel-header">
            <h3>⚙️ 实验配置</h3>
          </div>

          <div class="instruction-section">
            <label class="section-label">指令序列</label>
            <div *ngIf="parseErrors.length > 0" class="parse-errors">
              <div class="text-danger mb-2"><strong>语法错误：</strong></div>
              <div *ngFor="let err of parseErrors" class="error-item">
                第 {{err.line}} 行: {{err.message}}
              </div>
            </div>
            <textarea
              [(ngModel)]="assemblyCode"
              (ngModelChange)="onCodeChange()"
              class="code-editor"
              placeholder="在此输入 RISC-V 汇编代码...

示例:
ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2
SW x3, 0(x0)
LW x4, 0(x0)
BEQ x1, x2, loop"
              rows="10"
            ></textarea>
          </div>

          <div class="experiments-section">
            <div class="section-header">
              <label class="section-label">实验组 ({{experimentGroups.length}}/{{maxGroups}})</label>
              <button (click)="addExperimentGroup()" [disabled]="experimentGroups.length >= maxGroups" class="btn-small">
                + 添加实验组
              </button>
            </div>

            <div class="experiment-groups">
              <div *ngFor="let group of experimentGroups; let i = index" class="experiment-group">
                <div class="group-header" (click)="toggleGroup(i)">
                  <div class="group-title">
                    <span class="group-badge">{{i + 1}}</span>
                    <input type="text" [(ngModel)]="group.name" (click)="$event.stopPropagation()" class="group-name-input" placeholder="组名">
                    <span class="group-summary">{{getGroupSummary(group)}}</span>
                  </div>
                  <div class="group-actions">
                    <button
                      (click)="$event.stopPropagation(); addControlGroup(i)"
                      [disabled]="experimentGroups.length >= maxGroups"
                      class="btn-small secondary"
                      title="快速添加对照组">
                      🔬 对照
                    </button>
                    <button
                      (click)="$event.stopPropagation(); removeExperimentGroup(i)"
                      [disabled]="experimentGroups.length <= minGroups"
                      class="btn-small danger"
                      title="删除">
                      ✕
                    </button>
                    <span class="expand-icon">{{expandedGroups[i] ? '▼' : '▶'}}</span>
                  </div>
                </div>

                <div *ngIf="expandedGroups[i]" class="group-content">
                  <div class="config-row">
                    <label>流水线模型</label>
                    <select [(ngModel)]="group.model">
                      <option value="5-stage">5级 (经典)</option>
                      <option value="7-stage">7级 (超流水)</option>
                    </select>
                  </div>

                  <div class="config-row">
                    <label class="checkbox-label">
                      <input type="checkbox" [(ngModel)]="group.enableForwarding">
                      启用数据转发 (旁路)
                    </label>
                  </div>

                  <div class="config-row">
                    <label class="checkbox-label">
                      <input type="checkbox" [(ngModel)]="group.enableStallInsertion">
                      自动插入气泡
                    </label>
                  </div>

                  <div class="config-row">
                    <label>分支预测策略</label>
                    <select [(ngModel)]="group.branchPrediction">
                      <option [ngValue]="null">不使用</option>
                      <option [ngValue]="BranchPredictionStrategy.STATIC_NOT_TAKEN">静态 - 总是不跳转</option>
                      <option [ngValue]="BranchPredictionStrategy.STATIC_TAKEN">静态 - 总是跳转</option>
                      <option [ngValue]="BranchPredictionStrategy.ONE_BIT">1-bit 动态预测</option>
                      <option [ngValue]="BranchPredictionStrategy.TWO_BIT">2-bit 饱和计数器</option>
                      <option [ngValue]="BranchPredictionStrategy.BTB">BTB 分支目标缓冲</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="control-panel panel">
          <div class="panel-header">
            <h3>▶️ 运行控制</h3>
          </div>

          <div class="control-content">
            <button
              (click)="runAllExperiments()"
              [disabled]="isRunning || !canRunExperiments"
              class="btn-large success"
            >
              <span *ngIf="!isRunning">🚀 运行全部实验</span>
              <span *ngIf="isRunning">⏳ 运行中...</span>
            </button>

            <div *ngIf="isRunning" class="progress-section">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="progressPercent"></div>
              </div>
              <div class="progress-text">
                {{completedCount}}/{{experimentGroups.length}} 组完成
              </div>
            </div>

            <div *ngIf="experimentResults.length > 0 && !isRunning" class="status-info">
              <div class="status-success">
                ✅ 已完成 {{experimentResults.length}} 组实验
              </div>
            </div>

            <div *ngIf="!canRunExperiments" class="status-info">
              <div class="status-warning">
                ⚠️ 请输入有效的指令代码，并确保至少配置 {{minGroups}} 组实验
              </div>
            </div>
          </div>

          <div class="tip-section">
            <div class="tip-title">💡 使用提示</div>
            <ul class="tip-list">
              <li>配置 2-8 组不同的流水线参数进行对比</li>
              <li>使用"快速添加对照组"进行单变量实验</li>
              <li>实验完成后自动生成分析报告</li>
              <li>可导出报告为 PNG 图片保存</li>
            </ul>
          </div>
        </div>

        <div class="report-panel panel">
          <div class="panel-header">
            <h3>📈 报告展示</h3>
            <button
              *ngIf="experimentResults.length > 0"
              (click)="exportReport()"
              [disabled]="isExporting"
              class="btn-small"
            >
              {{isExporting ? '导出中...' : '📷 导出为PNG'}}
            </button>
          </div>

          <div #reportArea class="report-content">
            <div *ngIf="experimentResults.length === 0" class="empty-report">
              <div class="empty-icon">📊</div>
              <p>运行实验后将在此显示对比分析报告</p>
            </div>

            <div *ngIf="experimentResults.length > 0">
              <div class="chart-section">
                <h4>CPI & 总周期数对比</h4>
                <svg [attr.viewBox]="'0 0 ' + chartWidth + ' ' + chartHeight" class="bar-chart">
                  <g *ngFor="let result of experimentResults; let i = index">
                    <rect
                      [attr.x]="getBarX(i, 'cpi')"
                      [attr.y]="getBarY(i, 'cpi')"
                      [attr.width]="barWidth"
                      [attr.height]="getBarHeight(i, 'cpi')"
                      [attr.fill]="getBarColor(i, 'cpi')"
                      class="bar"
                    />
                    <rect
                      [attr.x]="getBarX(i, 'cycles')"
                      [attr.y]="getBarY(i, 'cycles')"
                      [attr.width]="barWidth"
                      [attr.height]="getBarHeight(i, 'cycles')"
                      [attr.fill]="getBarColor(i, 'cycles')"
                      class="bar"
                    />
                    <text
                      [attr.x]="getBarX(i, 'cpi') + barWidth / 2"
                      [attr.y]="chartHeight - 10"
                      text-anchor="middle"
                      class="x-label"
                    >
                      {{result.config.name}}
                    </text>
                    <text
                      [attr.x]="getBarX(i, 'cpi') + barWidth / 2"
                      [attr.y]="getBarY(i, 'cpi') - 5"
                      text-anchor="middle"
                      class="bar-value"
                    >
                      {{result.stats.cpi.toFixed(2)}}
                    </text>
                    <text
                      [attr.x]="getBarX(i, 'cycles') + barWidth / 2"
                      [attr.y]="getBarY(i, 'cycles') - 5"
                      text-anchor="middle"
                      class="bar-value"
                    >
                      {{result.stats.totalCycles}}
                    </text>
                  </g>

                  <line [attr.x1]="chartPadding" [attr.y1]="chartHeight - 30" [attr.x2]="chartWidth - chartPadding" [attr.y2]="chartHeight - 30" stroke="#ccc" stroke-width="2"/>
                  <line [attr.x1]="chartPadding" [attr.y1]="20" [attr.x2]="chartPadding" [attr.y2]="chartHeight - 30" stroke="#ccc" stroke-width="2"/>

                  <text x="10" y="35" class="y-label">CPI</text>
                  <text [attr.x]="chartWidth - 80" y="35" class="y-label">总周期</text>

                  <g class="legend" [attr.transform]="'translate(' + (chartWidth / 2 - 60) + ', 5)'">
                    <rect x="0" y="0" width="15" height="15" fill="#4CAF50"/>
                    <text x="20" y="12" class="legend-text">CPI</text>
                    <rect x="80" y="0" width="15" height="15" fill="#2196F3"/>
                    <text x="100" y="12" class="legend-text">总周期</text>
                  </g>
                </svg>
              </div>

              <div class="table-section">
                <h4>数据对比表</h4>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th (click)="sortResults('name')">组名 {{getSortIcon('name')}}</th>
                      <th (click)="sortResults('model')">流水线模型 {{getSortIcon('model')}}</th>
                      <th (click)="sortResults('forwarding')">转发 {{getSortIcon('forwarding')}}</th>
                      <th (click)="sortResults('stall')">气泡 {{getSortIcon('stall')}}</th>
                      <th (click)="sortResults('prediction')">预测策略 {{getSortIcon('prediction')}}</th>
                      <th (click)="sortResults('cycles')">总周期 {{getSortIcon('cycles')}}</th>
                      <th (click)="sortResults('cpi')">CPI {{getSortIcon('cpi')}}</th>
                      <th (click)="sortResults('ipc')">IPC {{getSortIcon('ipc')}}</th>
                      <th (click)="sortResults('stallCycles')">Stall周期 {{getSortIcon('stallCycles')}}</th>
                      <th (click)="sortResults('hazards')">冒险数 {{getSortIcon('hazards')}}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let result of sortedResults; let i = index" [class.best-row]="isBestResult(result)">
                      <td><strong>{{result.config.name}}</strong></td>
                      <td>{{result.config.model === '5-stage' ? '5级' : '7级'}}</td>
                      <td>{{result.config.enableForwarding ? '✓' : '✗'}}</td>
                      <td>{{result.config.enableStallInsertion ? '✓' : '✗'}}</td>
                      <td>{{getPredictionName(result.config.branchPrediction)}}</td>
                      <td>{{result.stats.totalCycles}}</td>
                      <td>{{result.stats.cpi.toFixed(2)}}</td>
                      <td>{{result.stats.ipc.toFixed(2)}}</td>
                      <td>{{result.stats.totalStallCycles}}</td>
                      <td>{{result.totalHazards}}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="analysis-section" *ngIf="analysis">
                <h4>🔍 自动分析</h4>
                <div class="analysis-content">
                  <p><strong>最优配置：</strong>「{{analysis.bestConfig.config.name}}」CPI 最低，为 {{analysis.bestConfig.stats.cpi.toFixed(2)}}</p>
                  <p *ngIf="analysis.forwardingImpact">
                    <strong>转发效果：</strong>开启转发可将 CPI 从 {{analysis.forwardingImpact.withoutForwardingCpi.toFixed(2)}}
                    降至 {{analysis.forwardingImpact.withForwardingCpi.toFixed(2)}}，
                    降低 {{analysis.forwardingImpact.improvementPercent.toFixed(1)}}%
                  </p>
                  <p *ngIf="analysis.predictionComparison.length > 0">
                    <strong>预测准确率：</strong>
                    <span *ngFor="let p of analysis.predictionComparison; let i = index">
                      {{p.strategy}}: {{(p.accuracy * 100).toFixed(1)}}%<span *ngIf="i < analysis.predictionComparison.length - 1">，</span>
                    </span>
                  </p>
                  <p class="recommendation"><strong>💡 优化建议：</strong>{{analysis.recommendation}}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .experiment-container {
      width: 100%;
      min-height: calc(100vh - 120px);
    }

    .experiment-header {
      text-align: center;
      margin-bottom: 20px;
    }

    .experiment-header h2 {
      margin: 0 0 8px 0;
      color: #2c3e50;
      font-size: 28px;
    }

    .subtitle {
      color: #7f8c8d;
      margin: 0;
      font-size: 14px;
    }

    .experiment-content {
      display: grid;
      grid-template-columns: 320px 280px 1fr;
      gap: 16px;
      height: 100%;
    }

    .panel {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      padding: 12px 16px;
      background: linear-gradient(135deg, #34495e 0%, #2c3e50 100%);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 16px;
    }

    .config-panel, .control-panel {
      max-height: calc(100vh - 180px);
      overflow-y: auto;
    }

    .report-panel {
      max-height: calc(100vh - 180px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .report-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .section-label {
      display: block;
      font-weight: 600;
      color: #34495e;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .instruction-section, .experiments-section {
      padding: 16px;
      border-bottom: 1px solid #ecf0f1;
    }

    .code-editor {
      width: 100%;
      padding: 10px;
      border: 1px solid #dfe6e9;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      resize: vertical;
      background: #fafbfc;
    }

    .code-editor:focus {
      outline: none;
      border-color: #3498db;
    }

    .parse-errors {
      background: #fdecea;
      border: 1px solid #f5c6cb;
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .error-item {
      color: #721c24;
      margin-bottom: 4px;
    }

    .text-danger {
      color: #e74c3c;
    }

    .mb-2 {
      margin-bottom: 8px;
    }

    .experiment-groups {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .experiment-group {
      border: 1px solid #dfe6e9;
      border-radius: 6px;
      overflow: hidden;
    }

    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: #f8f9fa;
      cursor: pointer;
      transition: background 0.2s;
    }

    .group-header:hover {
      background: #e9ecef;
    }

    .group-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .group-badge {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #3498db;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      flex-shrink: 0;
    }

    .group-name-input {
      border: none;
      background: transparent;
      font-size: 13px;
      font-weight: 600;
      color: #2c3e50;
      width: 60px;
      padding: 2px 4px;
      border-radius: 3px;
    }

    .group-name-input:hover, .group-name-input:focus {
      background: white;
      outline: 1px solid #3498db;
    }

    .group-summary {
      font-size: 11px;
      color: #7f8c8d;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .group-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .expand-icon {
      font-size: 10px;
      color: #95a5a6;
      margin-left: 4px;
    }

    .group-content {
      padding: 12px;
      border-top: 1px solid #e9ecef;
      background: white;
    }

    .config-row {
      margin-bottom: 12px;
    }

    .config-row:last-child {
      margin-bottom: 0;
    }

    .config-row label {
      display: block;
      font-size: 12px;
      color: #576574;
      margin-bottom: 4px;
    }

    .config-row select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #dfe6e9;
      border-radius: 4px;
      font-size: 12px;
      background: white;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 12px;
    }

    .checkbox-label input {
      cursor: pointer;
    }

    .btn-small {
      padding: 4px 10px;
      font-size: 11px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: #3498db;
      color: white;
      transition: background 0.2s;
    }

    .btn-small:hover:not([disabled]) {
      background: #2980b9;
    }

    .btn-small:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-small.secondary {
      background: #9b59b6;
    }

    .btn-small.secondary:hover:not([disabled]) {
      background: #8e44ad;
    }

    .btn-small.danger {
      background: #e74c3c;
    }

    .btn-small.danger:hover:not([disabled]) {
      background: #c0392b;
    }

    .control-content {
      padding: 20px 16px;
      text-align: center;
    }

    .btn-large {
      width: 100%;
      padding: 14px 20px;
      font-size: 15px;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-large.success {
      background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(46, 204, 113, 0.3);
    }

    .btn-large.success:hover:not([disabled]) {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(46, 204, 113, 0.4);
    }

    .btn-large:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .progress-section {
      margin-top: 16px;
    }

    .progress-bar {
      width: 100%;
      height: 10px;
      background: #ecf0f1;
      border-radius: 5px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3498db, #2ecc71);
      transition: width 0.3s ease;
    }

    .progress-text {
      margin-top: 8px;
      font-size: 13px;
      color: #576574;
    }

    .status-info {
      margin-top: 16px;
    }

    .status-success {
      padding: 10px;
      background: #d5f5e3;
      color: #1e8449;
      border-radius: 4px;
      font-size: 13px;
    }

    .status-warning {
      padding: 10px;
      background: #fef5e7;
      color: #d68910;
      border-radius: 4px;
      font-size: 12px;
    }

    .tip-section {
      padding: 16px;
      border-top: 1px solid #ecf0f1;
      background: #fafbfc;
    }

    .tip-title {
      font-weight: 600;
      color: #34495e;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .tip-list {
      margin: 0;
      padding-left: 20px;
      font-size: 12px;
      color: #576574;
    }

    .tip-list li {
      margin-bottom: 4px;
    }

    .empty-report {
      text-align: center;
      padding: 60px 20px;
      color: #95a5a6;
    }

    .empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .chart-section {
      margin-bottom: 24px;
    }

    .chart-section h4, .table-section h4, .analysis-section h4 {
      margin: 0 0 12px 0;
      color: #2c3e50;
      font-size: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #3498db;
    }

    .bar-chart {
      width: 100%;
      height: 300px;
      background: #fafbfc;
      border-radius: 4px;
    }

    .bar {
      transition: opacity 0.2s;
    }

    .bar:hover {
      opacity: 0.8;
    }

    .x-label {
      font-size: 11px;
      fill: #576574;
    }

    .y-label {
      font-size: 11px;
      fill: #7f8c8d;
    }

    .bar-value {
      font-size: 10px;
      fill: #2c3e50;
      font-weight: 600;
    }

    .legend-text {
      font-size: 11px;
      fill: #576574;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .data-table th {
      background: #34495e;
      color: white;
      padding: 8px 6px;
      text-align: center;
      cursor: pointer;
      user-select: none;
      font-weight: 500;
      position: sticky;
      top: 0;
    }

    .data-table th:hover {
      background: #2c3e50;
    }

    .data-table td {
      padding: 8px 6px;
      text-align: center;
      border-bottom: 1px solid #ecf0f1;
    }

    .data-table tbody tr:hover {
      background: #f8f9fa;
    }

    .data-table .best-row {
      background: #d5f5e3 !important;
    }

    .analysis-section {
      margin-top: 24px;
    }

    .analysis-content {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 6px;
      border-left: 4px solid #3498db;
    }

    .analysis-content p {
      margin: 0 0 10px 0;
      font-size: 13px;
      line-height: 1.6;
    }

    .analysis-content p:last-child {
      margin-bottom: 0;
    }

    .recommendation {
      color: #1e8449;
      font-weight: 500;
    }

    @media (max-width: 1400px) {
      .experiment-content {
        grid-template-columns: 300px 250px 1fr;
      }
    }

    @media (max-width: 1100px) {
      .experiment-content {
        grid-template-columns: 1fr;
      }

      .config-panel, .control-panel, .report-panel {
        max-height: none;
      }
    }
  `]
})
export class ExperimentReportComponent implements OnInit {
  @ViewChild('reportArea') reportArea!: ElementRef;

  readonly BranchPredictionStrategy = BranchPredictionStrategy;
  readonly minGroups = 2;
  readonly maxGroups = 8;

  assemblyCode: string = `ADDI x1, x0, 10
ADDI x2, x0, 20
ADD x3, x1, x2
SUB x4, x1, x2
MUL x5, x3, x4
SW x3, 0(x0)
LW x6, 0(x0)
ADD x7, x5, x6
BEQ x1, x2, skip
ADDI x8, x0, 100
ADD x9, x8, x7
skip:
SW x9, 4(x0)`;
  parseErrors: ParseError[] = [];

  experimentGroups: ExperimentConfig[] = [
    {
      id: 'group-1',
      name: '组1-无转发',
      model: '5-stage',
      enableForwarding: false,
      enableStallInsertion: true,
      branchPrediction: BranchPredictionStrategy.TWO_BIT
    },
    {
      id: 'group-2',
      name: '组2-有转发',
      model: '5-stage',
      enableForwarding: true,
      enableStallInsertion: true,
      branchPrediction: BranchPredictionStrategy.TWO_BIT
    }
  ];
  expandedGroups: boolean[] = [true, true];

  isRunning = false;
  completedCount = 0;
  progressPercent = 0;

  experimentResults: ExperimentResult[] = [];
  sortedResults: ExperimentResult[] = [];
  analysis: ExperimentAnalysis | null = null;

  sortField: string | null = null;
  sortAscending = true;

  isExporting = false;
  canRunExperiments = false;

  readonly chartWidth = 800;
  readonly chartHeight = 300;
  readonly chartPadding = 60;
  readonly barWidth = 30;
  readonly barGap = 15;

  constructor(
    private instructionParser: InstructionParserService,
    private pipelineSimulator: PipelineSimulatorService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    setTimeout(() => {
      this.updateCanRun();
      this.cdr.detectChanges();
    }, 0);
  }

  onCodeChange(): void {
    this.updateCanRun();
    this.cdr.detectChanges();
  }

  private updateCanRun(): void {
    try {
      const parseResult = this.instructionParser.parse(this.assemblyCode);
      this.parseErrors = parseResult.errors;
      this.canRunExperiments = parseResult.instructions.length > 0 &&
                               parseResult.errors.length === 0 &&
                               this.experimentGroups.length >= this.minGroups &&
                               this.experimentGroups.length <= this.maxGroups;
    } catch (e) {
      console.error('Error checking canRun:', e);
      this.canRunExperiments = false;
    }
  }

  getGroupSummary(group: ExperimentConfig): string {
    const parts: string[] = [];
    parts.push(group.model === '5-stage' ? '5级' : '7级');
    if (group.enableForwarding) parts.push('转发');
    if (group.enableStallInsertion) parts.push('气泡');
    if (group.branchPrediction) {
      const predMap: Record<string, string> = {
        'STATIC_NOT_TAKEN': '静态不跳',
        'STATIC_TAKEN': '静态跳',
        'ONE_BIT': '1bit',
        'TWO_BIT': '2bit',
        'BTB': 'BTB'
      };
      parts.push(predMap[group.branchPrediction] || '预测');
    }
    return parts.join('+');
  }

  toggleGroup(index: number): void {
    this.expandedGroups[index] = !this.expandedGroups[index];
  }

  addExperimentGroup(): void {
    if (this.experimentGroups.length >= this.maxGroups) return;

    const lastGroup = this.experimentGroups[this.experimentGroups.length - 1];
    const newGroup: ExperimentConfig = {
      id: `group-${Date.now()}`,
      name: `组${this.experimentGroups.length + 1}`,
      model: lastGroup?.model || '5-stage',
      enableForwarding: lastGroup?.enableForwarding || false,
      enableStallInsertion: lastGroup?.enableStallInsertion || true,
      branchPrediction: lastGroup?.branchPrediction || null
    };

    this.experimentGroups.push(newGroup);
    this.expandedGroups.push(true);
    this.updateCanRun();
  }

  removeExperimentGroup(index: number): void {
    if (this.experimentGroups.length <= this.minGroups) return;
    this.experimentGroups.splice(index, 1);
    this.expandedGroups.splice(index, 1);
    this.experimentResults.splice(index, 1);
    this.updateCanRun();
    this.updateResults();
  }

  addControlGroup(index: number): void {
    if (this.experimentGroups.length >= this.maxGroups) return;

    const sourceGroup = this.experimentGroups[index];
    const controlGroup: ExperimentConfig = {
      ...JSON.parse(JSON.stringify(sourceGroup)),
      id: `group-${Date.now()}`,
      name: `${sourceGroup.name}对照`
    };

    if (!controlGroup.enableForwarding) {
      controlGroup.enableForwarding = true;
      controlGroup.enableStallInsertion = false;
    } else if (controlGroup.branchPrediction === null) {
      controlGroup.branchPrediction = BranchPredictionStrategy.TWO_BIT;
    } else if (controlGroup.model === '5-stage') {
      controlGroup.model = '7-stage';
    } else {
      controlGroup.enableForwarding = false;
      controlGroup.enableStallInsertion = true;
    }

    this.experimentGroups.splice(index + 1, 0, controlGroup);
    this.expandedGroups.splice(index + 1, 0, true);
    this.updateCanRun();
  }

  async runAllExperiments(): Promise<void> {
    if (!this.canRunExperiments || this.isRunning) return;

    this.isRunning = true;
    this.completedCount = 0;
    this.progressPercent = 0;
    this.experimentResults = [];

    const parseResult = this.instructionParser.parse(this.assemblyCode);
    this.parseErrors = parseResult.errors;

    if (parseResult.errors.length > 0 || parseResult.instructions.length === 0) {
      this.isRunning = false;
      return;
    }

    for (let i = 0; i < this.experimentGroups.length; i++) {
      const group = this.experimentGroups[i];
      const result = await this.runSingleExperiment(group, parseResult.instructions);
      this.experimentResults.push(result);
      this.completedCount = i + 1;
      this.progressPercent = ((i + 1) / this.experimentGroups.length) * 100;
      this.cdr.detectChanges();

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isRunning = false;
    this.updateResults();
    this.cdr.detectChanges();
  }

  private async runSingleExperiment(
    config: ExperimentConfig,
    instructions: any[]
  ): Promise<ExperimentResult> {
    const simulatorConfig: SimulatorConfig = {
      model: config.model,
      enableForwarding: config.enableForwarding,
      enableStallInsertion: config.enableStallInsertion,
      enableDelaySlot: false,
      branchPrediction: config.branchPrediction,
      maxCycles: 1000
    };

    this.pipelineSimulator.initialize(instructions, simulatorConfig);
    this.pipelineSimulator.runFullSimulation();
    const stats = this.pipelineSimulator.getPerformanceStats();
    const state = this.pipelineSimulator.getState();

    return {
      config,
      stats,
      totalHazards: state.hazards.length
    };
  }

  private updateResults(): void {
    this.sortedResults = [...this.experimentResults];
    if (this.sortField) {
      this.sortResults(this.sortField);
    }
    this.analysis = this.generateAnalysis();
  }

  sortResults(field: string): void {
    if (this.sortField === field) {
      this.sortAscending = !this.sortAscending;
    } else {
      this.sortField = field;
      this.sortAscending = true;
    }

    const multiplier = this.sortAscending ? 1 : -1;

    this.sortedResults.sort((a, b) => {
      let va: any, vb: any;

      switch (field) {
        case 'name':
          va = a.config.name;
          vb = b.config.name;
          break;
        case 'model':
          va = a.config.model;
          vb = b.config.model;
          break;
        case 'forwarding':
          va = a.config.enableForwarding ? 1 : 0;
          vb = b.config.enableForwarding ? 1 : 0;
          break;
        case 'stall':
          va = a.config.enableStallInsertion ? 1 : 0;
          vb = b.config.enableStallInsertion ? 1 : 0;
          break;
        case 'prediction':
          va = a.config.branchPrediction || '';
          vb = b.config.branchPrediction || '';
          break;
        case 'cycles':
          va = a.stats.totalCycles;
          vb = b.stats.totalCycles;
          break;
        case 'cpi':
          va = a.stats.cpi;
          vb = b.stats.cpi;
          break;
        case 'ipc':
          va = a.stats.ipc;
          vb = b.stats.ipc;
          break;
        case 'stallCycles':
          va = a.stats.totalStallCycles;
          vb = b.stats.totalStallCycles;
          break;
        case 'hazards':
          va = a.totalHazards;
          vb = b.totalHazards;
          break;
        default:
          return 0;
      }

      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * multiplier;
      }
      return (va - vb) * multiplier;
    });
  }

  getSortIcon(field: string): string {
    if (this.sortField !== field) return '↕';
    return this.sortAscending ? '↑' : '↓';
  }

  getPredictionName(prediction: BranchPredictionStrategy | null): string {
    if (!prediction) return '无';
    const names: Record<BranchPredictionStrategy, string> = {
      [BranchPredictionStrategy.STATIC_NOT_TAKEN]: '静态不跳',
      [BranchPredictionStrategy.STATIC_TAKEN]: '静态跳',
      [BranchPredictionStrategy.ONE_BIT]: '1-bit',
      [BranchPredictionStrategy.TWO_BIT]: '2-bit',
      [BranchPredictionStrategy.BTB]: 'BTB'
    };
    return names[prediction] || prediction;
  }

  getGroupIndex(result: ExperimentResult): number {
    return this.experimentResults.indexOf(result);
  }

  isBestResult(result: ExperimentResult): boolean {
    if (!this.analysis) return false;
    return result.config.id === this.analysis.bestConfig.config.id;
  }

  private getChartMaxValues(): { maxCpi: number; maxCycles: number } {
    let maxCpi = 0;
    let maxCycles = 0;
    for (const result of this.experimentResults) {
      maxCpi = Math.max(maxCpi, result.stats.cpi);
      maxCycles = Math.max(maxCycles, result.stats.totalCycles);
    }
    return { maxCpi, maxCycles };
  }

  getBarX(index: number, type: 'cpi' | 'cycles'): number {
    const groupWidth = this.barWidth * 2 + this.barGap;
    const totalGroupsWidth = this.experimentResults.length * groupWidth + this.barGap;
    const startX = this.chartPadding + (this.chartWidth - 2 * this.chartPadding - totalGroupsWidth) / 2;
    const baseX = startX + index * groupWidth + this.barGap;
    return type === 'cpi' ? baseX : baseX + this.barWidth + this.barGap / 2;
  }

  getBarY(index: number, type: 'cpi' | 'cycles'): number {
    const { maxCpi, maxCycles } = this.getChartMaxValues();
    const result = this.experimentResults[index];
    const chartTop = 20;
    const chartBottom = this.chartHeight - 30;
    const availableHeight = chartBottom - chartTop;

    const value = type === 'cpi' ? result.stats.cpi : result.stats.totalCycles;
    const maxValue = type === 'cpi' ? maxCpi : maxCycles;
    const normalizedValue = maxValue > 0 ? value / maxValue : 0;

    return chartBottom - normalizedValue * availableHeight;
  }

  getBarHeight(index: number, type: 'cpi' | 'cycles'): number {
    const y = this.getBarY(index, type);
    const chartBottom = this.chartHeight - 30;
    return chartBottom - y;
  }

  getBarColor(index: number, type: 'cpi' | 'cycles'): string {
    const cpiColors = ['#4CAF50', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9', '#E8F5E9'];
    const cycleColors = ['#2196F3', '#42A5F5', '#64B5F6', '#90CAF9', '#BBDEFB', '#E3F2FD'];
    const colors = type === 'cpi' ? cpiColors : cycleColors;
    return colors[index % colors.length];
  }

  private generateAnalysis(): ExperimentAnalysis | null {
    if (this.experimentResults.length === 0) return null;

    const bestConfig = [...this.experimentResults].sort((a, b) => a.stats.cpi - b.stats.cpi)[0];

    let forwardingImpact: ExperimentAnalysis['forwardingImpact'] = null;
    const withForwarding = this.experimentResults.find(r => r.config.enableForwarding);
    const withoutForwarding = this.experimentResults.find(r =>
      !r.config.enableForwarding &&
      r.config.model === withForwarding?.config.model &&
      r.config.branchPrediction === withForwarding?.config.branchPrediction
    );

    if (withForwarding && withoutForwarding) {
      const improvement = ((withoutForwarding.stats.cpi - withForwarding.stats.cpi) / withoutForwarding.stats.cpi) * 100;
      forwardingImpact = {
        withForwardingCpi: withForwarding.stats.cpi,
        withoutForwardingCpi: withoutForwarding.stats.cpi,
        improvementPercent: improvement
      };
    }

    const predictionComparison: ExperimentAnalysis['predictionComparison'] = [];
    for (const result of this.experimentResults) {
      if (result.config.branchPrediction && result.stats.branchPredictionStats) {
        predictionComparison.push({
          strategy: this.getPredictionName(result.config.branchPrediction),
          accuracy: result.stats.branchPredictionStats.accuracy
        });
      }
    }

    let recommendation = '';
    if (forwardingImpact && forwardingImpact.improvementPercent > 10) {
      recommendation = `开启数据转发可将 CPI 从 ${forwardingImpact.withoutForwardingCpi.toFixed(2)} 降至 ${forwardingImpact.withForwardingCpi.toFixed(2)}，降低 ${forwardingImpact.improvementPercent.toFixed(1)}%，建议启用数据转发。`;
    } else if (predictionComparison.length > 0) {
      const bestPred = predictionComparison.sort((a, b) => b.accuracy - a.accuracy)[0];
      recommendation = `使用「${bestPred.strategy}」分支预测策略准确率最高，可达 ${(bestPred.accuracy * 100).toFixed(1)}%，能有效减少控制冒险。`;
    } else if (bestConfig.config.model === '7-stage') {
      recommendation = '7级超流水线在当前指令序列下表现更优，通过增加流水线级数提高了指令吞吐量。';
    } else {
      recommendation = '当前配置下「' + bestConfig.config.name + '」表现最优，可通过调整转发和分支预测策略进一步优化性能。';
    }

    return {
      bestConfig,
      forwardingImpact,
      predictionComparison,
      recommendation
    };
  }

  async exportReport(): Promise<void> {
    if (!this.reportArea || this.isExporting) return;

    this.isExporting = true;
    try {
      const canvas = await html2canvas(this.reportArea.nativeElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true
      });

      const link = document.createElement('a');
      link.download = `流水线实验报告_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('导出失败:', error);
    } finally {
      this.isExporting = false;
    }
  }
}
