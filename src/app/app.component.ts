import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-container">
      <header class="app-header">
        <div class="header-content">
          <h1 class="app-title">
            <span class="logo">⚡</span>
            CPU流水线冒险检测与指令调度教学工具
          </h1>
          <nav class="nav-links">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
              模拟器
            </a>
            <a routerLink="/levels" routerLinkActive="active">
              教学关卡
            </a>
          </nav>
        </div>
      </header>
      <main class="app-main">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .app-header {
      background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
      color: white;
      padding: 0;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    }
    .header-content {
      max-width: 1800px;
      margin: 0 auto;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .app-title {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .logo {
      font-size: 28px;
    }
    .nav-links {
      display: flex;
      gap: 8px;
    }
    .nav-links a {
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 4px;
      transition: background 0.2s;
      font-size: 14px;
    }
    .nav-links a:hover {
      background: rgba(255,255,255,0.15);
    }
    .nav-links a.active {
      background: rgba(255,255,255,0.25);
      font-weight: 500;
    }
    .app-main {
      flex: 1;
      max-width: 1800px;
      width: 100%;
      margin: 0 auto;
      padding: 20px 24px;
    }
  `]
})
export class AppComponent {
  title = 'pipeline-edu';
}
