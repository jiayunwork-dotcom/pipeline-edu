import { HazardType } from './register.model';

export interface PerformanceStats {
  totalCycles: number;
  totalInstructions: number;
  completedInstructions: number;
  cpi: number;
  ipc: number;
  stageUtilization: Map<string, number>;
  hazardStalls: Map<HazardType, number>;
  totalStallCycles: number;
  forwardingUsed: number;
  branchPredictionStats?: BranchPredictionPerfStats;
}

export interface BranchPredictionPerfStats {
  totalBranches: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  mispredictionPenalty: number;
}

export interface ComparisonResult {
  configName: string;
  stats: PerformanceStats;
}

export interface LevelConfig {
  id: number;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  instructions: string;
  pipelineModel: '5-stage' | '7-stage' | 'superscalar-2way';
  enableForwarding: boolean;
  enableStallInsertion?: boolean;
  enableBranchPrediction: boolean;
  branchPredictionStrategy?: string;
  enableTomasulo: boolean;
  targetCpi?: number;
  targetIpc?: number;
  maxCycles?: number;
  hint: string;
  learningObjective: string;
}

export interface LevelResult {
  levelId: number;
  passed: boolean;
  score: number;
  actualCpi: number;
  actualIpc: number;
  cyclesUsed: number;
  stars: number;
}
