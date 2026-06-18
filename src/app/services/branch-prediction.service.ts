import { Injectable } from '@angular/core';
import {
  BranchPredictionStrategy,
  BranchPredictionEntry,
  BranchPredictionResult,
  BranchPredictionStats,
  TwoBitState
} from '../models/branch-prediction.model';

@Injectable({
  providedIn: 'root'
})
export class BranchPredictionService {
  private predictions: Map<number, BranchPredictionEntry> = new Map();
  private results: BranchPredictionResult[] = [];

  reset(): void {
    this.predictions.clear();
    this.results = [];
  }

  predict(
    address: number,
    strategy: BranchPredictionStrategy,
    defaultTarget: number = address + 4
  ): { predicted: boolean; predictedTarget: number } {
    switch (strategy) {
      case BranchPredictionStrategy.STATIC_NOT_TAKEN:
        return { predicted: false, predictedTarget: address + 4 };

      case BranchPredictionStrategy.STATIC_TAKEN:
        return { predicted: true, predictedTarget: defaultTarget };

      case BranchPredictionStrategy.ONE_BIT: {
        const entry = this.predictions.get(address);
        if (!entry) {
          return { predicted: false, predictedTarget: address + 4 };
        }
        return {
          predicted: entry.prediction,
          predictedTarget: entry.prediction ? (entry.targetAddress || defaultTarget) : address + 4
        };
      }

      case BranchPredictionStrategy.TWO_BIT: {
        const entry = this.predictions.get(address);
        if (!entry) {
          return { predicted: false, predictedTarget: address + 4 };
        }
        const taken = entry.twoBitState! >= TwoBitState.WEAKLY_TAKEN;
        return {
          predicted: taken,
          predictedTarget: taken ? (entry.targetAddress || defaultTarget) : address + 4
        };
      }

      case BranchPredictionStrategy.BTB: {
        const entry = this.predictions.get(address);
        if (!entry) {
          return { predicted: false, predictedTarget: address + 4 };
        }
        return {
          predicted: entry.prediction,
          predictedTarget: entry.targetAddress || address + 4
        };
      }
    }
  }

  update(
    address: number,
    actualTaken: boolean,
    actualTarget: number,
    predicted: boolean,
    predictedTarget: number,
    strategy: BranchPredictionStrategy
  ): BranchPredictionResult {
    const correct = predicted === actualTaken && (predicted === false || predictedTarget === actualTarget);

    const result: BranchPredictionResult = {
      address,
      predicted,
      predictedTarget,
      actual: actualTaken,
      actualTarget,
      correct
    };

    this.results.push(result);

    let entry = this.predictions.get(address);
    if (!entry) {
      entry = {
        address,
        prediction: false,
        twoBitState: TwoBitState.WEAKLY_NOT_TAKEN,
        targetAddress: actualTarget,
        lastTaken: actualTaken
      };
      this.predictions.set(address, entry);
    }

    entry.targetAddress = actualTarget;
    entry.lastTaken = actualTaken;

    switch (strategy) {
      case BranchPredictionStrategy.ONE_BIT:
        entry.prediction = actualTaken;
        break;

      case BranchPredictionStrategy.TWO_BIT:
        entry.twoBitState = this.updateTwoBitState(
          entry.twoBitState || TwoBitState.WEAKLY_NOT_TAKEN,
          actualTaken
        );
        entry.prediction = entry.twoBitState >= TwoBitState.WEAKLY_TAKEN;
        break;

      case BranchPredictionStrategy.BTB:
        entry.prediction = actualTaken;
        break;

      default:
        break;
    }

    return result;
  }

  private updateTwoBitState(current: TwoBitState, taken: boolean): TwoBitState {
    if (taken) {
      switch (current) {
        case TwoBitState.STRONGLY_NOT_TAKEN: return TwoBitState.WEAKLY_NOT_TAKEN;
        case TwoBitState.WEAKLY_NOT_TAKEN: return TwoBitState.WEAKLY_TAKEN;
        case TwoBitState.WEAKLY_TAKEN: return TwoBitState.STRONGLY_TAKEN;
        case TwoBitState.STRONGLY_TAKEN: return TwoBitState.STRONGLY_TAKEN;
      }
    } else {
      switch (current) {
        case TwoBitState.STRONGLY_TAKEN: return TwoBitState.WEAKLY_TAKEN;
        case TwoBitState.WEAKLY_TAKEN: return TwoBitState.WEAKLY_NOT_TAKEN;
        case TwoBitState.WEAKLY_NOT_TAKEN: return TwoBitState.STRONGLY_NOT_TAKEN;
        case TwoBitState.STRONGLY_NOT_TAKEN: return TwoBitState.STRONGLY_NOT_TAKEN;
      }
    }
  }

  getStats(): BranchPredictionStats {
    const total = this.results.length;
    const correct = this.results.filter(r => r.correct).length;
    return {
      totalBranches: total,
      correctPredictions: correct,
      incorrectPredictions: total - correct,
      accuracy: total > 0 ? correct / total : 0,
      results: [...this.results]
    };
  }

  getAllPredictions(): Map<number, BranchPredictionEntry> {
    return new Map(this.predictions);
  }
}
