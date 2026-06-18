import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterFile } from '../../models/register.model';

@Component({
  selector: 'app-register-file',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <div class="card-title">寄存器文件 (x0 - x31)</div>
      <div class="register-grid">
        <div
          *ngFor="let reg of registerDisplay"
          class="register-cell"
          [class.busy]="reg.busy"
          [class.modified]="reg.value !== 0"
          [title]="reg.busy ? '正被写入: ' + reg.busyBy : ''"
        >
          <div class="reg-name">{{reg.name}}</div>
          <div class="reg-value" [class.hex-view]="showHex">{{reg.displayValue}}</div>
        </div>
      </div>
      <div class="mt-4 flex gap-2">
        <button class="secondary" (click)="toggleHexView()">
          {{ showHex ? '显示十进制' : '显示十六进制' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .register-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 6px;
    }
    .register-cell {
      padding: 8px;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      text-align: center;
      background: #f8f9fa;
      transition: all 0.2s;
    }
    .register-cell:hover {
      background: #e9ecef;
      transform: translateY(-1px);
    }
    .register-cell.busy {
      border-color: #e74c3c;
      background: #fde8e8;
    }
    .register-cell.modified {
      border-color: #3498db;
      background: #ebf5fb;
    }
    .reg-name {
      font-size: 11px;
      font-weight: 600;
      color: #495057;
      margin-bottom: 2px;
    }
    .reg-value {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #2c3e50;
    }
    .reg-value.hex-view {
      color: #8e44ad;
    }
  `]
})
export class RegisterFileComponent {
  @Input() registerFile!: RegisterFile;
  showHex = false;

  get registerDisplay(): { name: string; value: number; displayValue: string; busy: boolean; busyBy: string | null }[] {
    if (!this.registerFile) return [];
    return this.registerFile.registers.map((val, i) => ({
      name: `x${i}`,
      value: val,
      displayValue: this.showHex ? `0x${(val >>> 0).toString(16).toUpperCase()}` : val.toString(),
      busy: !!this.registerFile.registerBusy[i],
      busyBy: this.registerFile.registerBusy[i]
    }));
  }

  toggleHexView(): void {
    this.showHex = !this.showHex;
  }
}
