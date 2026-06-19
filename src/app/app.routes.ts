import { Routes } from '@angular/router';
import { PipelineSimulatorComponent } from './components/pipeline-simulator/pipeline-simulator.component';
import { LevelsComponent } from './components/levels/levels.component';
import { ExperimentReportComponent } from './components/experiment-report/experiment-report.component';
import { GanttTimelineComponent } from './components/gantt-timeline/gantt-timeline.component';

export const routes: Routes = [
  { path: '', component: PipelineSimulatorComponent, pathMatch: 'full' },
  { path: 'levels', component: LevelsComponent },
  { path: 'experiment', component: ExperimentReportComponent },
  { path: 'gantt', component: GanttTimelineComponent },
  { path: '**', redirectTo: '' }
];
