import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LEVELS } from '../../data/levels.data';
import { LevelConfig } from '../../models/performance.model';

@Component({
  selector: 'app-levels',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="levels-container">
      <div class="card">
        <div class="card-title">
          <h2 style="margin: 0;">教学关卡</h2>
          <p class="subtitle">共 {{levels.length}} 关，循序渐进学习流水线技术</p>
        </div>

        <div class="difficulty-filters">
          <button
            *ngFor="let d of difficulties"
            [class.active]="currentFilter === d"
            (click)="currentFilter = d"
            class="secondary"
          >
            {{d === 'all' ? '全部' : getDifficultyName(d)}}
          </button>
        </div>

        <div class="levels-grid">
          <div
            *ngFor="let level of filteredLevels"
            class="level-card"
            [ngClass]="'diff-' + level.difficulty"
            (click)="startLevel(level)"
          >
            <div class="level-header">
              <span class="level-number">第{{level.id}}关</span>
              <span class="badge" [ngClass]="getDifficultyBadge(level.difficulty)">
                {{getDifficultyName(level.difficulty)}}
              </span>
            </div>
            <div class="level-title">{{level.title}}</div>
            <div class="level-desc">{{level.description}}</div>
            <div class="level-tags">
              <span *ngIf="level.enableForwarding" class="tag tag-green">数据转发</span>
              <span *ngIf="level.enableBranchPrediction" class="tag tag-blue">分支预测</span>
              <span *ngIf="level.enableTomasulo" class="tag tag-purple">乱序执行</span>
              <span *ngIf="level.pipelineModel === '7-stage'" class="tag tag-orange">7级流水线</span>
              <span *ngIf="level.pipelineModel === 'superscalar-2way'" class="tag tag-pink">超标量</span>
            </div>
            <div class="level-objective">
              <strong>🎯 学习目标：</strong>{{level.learningObjective}}
            </div>
            <div *ngIf="level.targetCpi || level.targetIpc || level.maxCycles" class="level-targets">
              <span *ngIf="level.targetCpi">目标 CPI ≤ {{level.targetCpi}}</span>
              <span *ngIf="level.targetIpc">目标 IPC ≥ {{level.targetIpc}}</span>
            </div>
            <div class="level-hint" *ngIf="level.hint">
              💡 提示：{{level.hint}}
            </div>
            <button class="start-btn">开始挑战 →</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .levels-container {
      max-width: 1400px;
      margin: 0 auto;
    }
    .subtitle {
      color: #6c757d;
      margin: 6px 0 0 0;
      font-size: 14px;
      font-weight: normal;
    }
    .difficulty-filters {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .difficulty-filters button {
      background: white;
      color: #495057;
      border: 1px solid #dee2e6;
      padding: 6px 14px;
    }
    .difficulty-filters button.active {
      background: #3498db;
      color: white;
      border-color: #3498db;
    }
    .levels-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    .level-card {
      padding: 16px;
      border: 2px solid #dee2e6;
      border-radius: 10px;
      background: white;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .level-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.12);
    }
    .level-card.diff-easy { border-left: 4px solid #27ae60; }
    .level-card.diff-medium { border-left: 4px solid #f39c12; }
    .level-card.diff-hard { border-left: 4px solid #e67e22; }
    .level-card.diff-expert { border-left: 4px solid #e74c3c; }
    .level-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .level-number {
      font-weight: 700;
      color: #34495e;
      font-size: 13px;
    }
    .level-title {
      font-size: 17px;
      font-weight: 600;
      color: #2c3e50;
    }
    .level-desc {
      font-size: 13px;
      color: #6c757d;
      line-height: 1.5;
    }
    .level-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }
    .tag-green { background: #d4edda; color: #155724; }
    .tag-blue { background: #d1ecf1; color: #0c5460; }
    .tag-purple { background: #e2d5f0; color: #5b2c6f; }
    .tag-orange { background: #ffe5cc; color: #873600; }
    .tag-pink { background: #fadbd8; color: #922b21; }
    .level-objective {
      font-size: 12px;
      color: #495057;
      padding: 8px 10px;
      background: #f8f9fa;
      border-radius: 6px;
    }
    .level-targets {
      display: flex;
      gap: 12px;
      font-size: 13px;
      font-weight: 600;
      color: #2980b9;
    }
    .level-hint {
      font-size: 12px;
      color: #7d6608;
      padding: 6px 10px;
      background: #fffae6;
      border-radius: 4px;
      border-left: 3px solid #f39c12;
    }
    .start-btn {
      margin-top: auto;
      padding: 10px;
      font-weight: 600;
      background: linear-gradient(135deg, #3498db, #2980b9);
    }
    .start-btn:hover {
      background: linear-gradient(135deg, #2980b9, #1f618d);
    }
  `]
})
export class LevelsComponent {
  levels = LEVELS;
  currentFilter: string = 'all';
  difficulties = ['all', 'easy', 'medium', 'hard', 'expert'];

  constructor(private router: Router) {}

  get filteredLevels(): LevelConfig[] {
    if (this.currentFilter === 'all') return this.levels;
    return this.levels.filter(l => l.difficulty === this.currentFilter);
  }

  getDifficultyName(d: string): string {
    switch (d) {
      case 'easy': return '入门';
      case 'medium': return '进阶';
      case 'hard': return '困难';
      case 'expert': return '专家';
      default: return d;
    }
  }

  getDifficultyBadge(d: string): string {
    switch (d) {
      case 'easy': return 'badge-success';
      case 'medium': return 'badge-warning';
      case 'hard': return 'badge-warning';
      case 'expert': return 'badge-danger';
      default: return 'badge-info';
    }
  }

  startLevel(level: LevelConfig): void {
    this.router.navigate(['/'], { queryParams: { level: level.id } });
  }
}
