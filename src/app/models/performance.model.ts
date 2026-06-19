import { HazardType } from './register.model';
import { BranchPredictionStrategy } from './branch-prediction.model';

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

export type ExperimentPipelineModel = '5-stage' | '7-stage';

export interface ExperimentConfig {
  id: string;
  name: string;
  model: ExperimentPipelineModel;
  enableForwarding: boolean;
  enableStallInsertion: boolean;
  branchPrediction: BranchPredictionStrategy | null;
}

export interface ExperimentResult {
  config: ExperimentConfig;
  stats: PerformanceStats;
  totalHazards: number;
}

export interface ExperimentAnalysis {
  bestConfig: ExperimentResult;
  forwardingImpact: {
    withForwardingCpi: number;
    withoutForwardingCpi: number;
    improvementPercent: number;
  } | null;
  predictionComparison: {
    strategy: string;
    accuracy: number;
  }[];
  recommendation: string;
  modelDimension?: {
    hasVariation: boolean;
    groups: {
      model: string;
      avgCpi: number;
      count: number;
    }[];
    conclusion: string;
  };
  predictionDimension?: {
    hasVariation: boolean;
    groups: {
      strategy: string;
      strategyKey: string | null;
      avgCpi: number;
      count: number;
    }[];
    conclusion: string;
  };
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
