export enum BranchPredictionStrategy {
  STATIC_NOT_TAKEN = 'STATIC_NOT_TAKEN',
  STATIC_TAKEN = 'STATIC_TAKEN',
  ONE_BIT = 'ONE_BIT',
  TWO_BIT = 'TWO_BIT',
  BTB = 'BTB'
}

export enum TwoBitState {
  STRONGLY_NOT_TAKEN = 0,
  WEAKLY_NOT_TAKEN = 1,
  WEAKLY_TAKEN = 2,
  STRONGLY_TAKEN = 3
}

export interface BranchPredictionEntry {
  address: number;
  prediction: boolean;
  twoBitState?: TwoBitState;
  targetAddress?: number;
  lastTaken?: boolean;
}

export interface BranchPredictionResult {
  address: number;
  predicted: boolean;
  predictedTarget?: number;
  actual: boolean;
  actualTarget: number;
  correct: boolean;
}

export interface BranchPredictionStats {
  totalBranches: number;
  correctPredictions: number;
  incorrectPredictions: number;
  accuracy: number;
  results: BranchPredictionResult[];
}
