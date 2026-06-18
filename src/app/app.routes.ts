import { Routes } from '@angular/router';
import { PipelineSimulatorComponent } from './components/pipeline-simulator/pipeline-simulator.component';
import { LevelsComponent } from './components/levels/levels.component';

export const routes: Routes = [
  { path: '', component: PipelineSimulatorComponent, pathMatch: 'full' },
  { path: 'levels', component: LevelsComponent },
  { path: '**', redirectTo: '' }
];
