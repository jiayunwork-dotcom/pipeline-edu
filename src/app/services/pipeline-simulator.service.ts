import { Injectable } from '@angular/core';
import { Instruction, Opcode, createNop } from '../models/instruction.model';
import {
  RegisterFile, createRegisterFile, readRegister, writeRegister, markRegisterBusy,
  PipelineRegister, createEmptyPipelineRegister,
  Hazard, HazardType, ForwardingPath,
  PipelineModel, PipelineStage, getPipelineStages,
  PipelineTimeline, PipelineTimelineCell, getCellKey, PIPELINE_STAGES_5
} from '../models/register.model';
import { BranchPredictionService } from './branch-prediction.service';
import { BranchPredictionStrategy } from '../models/branch-prediction.model';
import { PerformanceStats, BranchPredictionPerfStats } from '../models/performance.model';

export interface SimulatorConfig {
  model: PipelineModel;
  enableForwarding: boolean;
  enableStallInsertion: boolean;
  enableDelaySlot: boolean;
  branchPrediction: BranchPredictionStrategy | null;
  maxCycles: number;
}

export interface SimulatorState {
  cycle: number;
  pc: number;
  pipelineRegisters: Map<string, PipelineRegister>;
  registerFile: RegisterFile;
  memory: Map<number, number>;
  hazards: Hazard[];
  forwardingPaths: ForwardingPath[];
  timelineCells: Map<string, PipelineTimelineCell>;
  instructionStartCycle: Map<string, number>;
  instructionStages: Map<string, Map<PipelineStage | 'BUBBLE', number[]>>;
  completedInstructions: string[];
  flushedInstructions: string[];
  stallCount: number;
  branchStats: BranchPredictionPerfStats;
  superscalarPipe?: {
    pipelineRegisters2: Map<string, PipelineRegister>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class PipelineSimulatorService {
  private state!: SimulatorState;
  private instructions: Instruction[] = [];
  private config!: SimulatorConfig;

  constructor(private branchPrediction: BranchPredictionService) {}

  initialize(instructions: Instruction[], config: SimulatorConfig): void {
    this.instructions = instructions;
    this.config = config;
    this.branchPrediction.reset();

    const stages = getPipelineStages(config.model);
    const pipelineRegisters = new Map<string, PipelineRegister>();
    stages.forEach(stage => pipelineRegisters.set(stage, createEmptyPipelineRegister()));

    let superscalarPipe: SimulatorState['superscalarPipe'];
    if (config.model === 'superscalar-2way') {
      const pipelineRegisters2 = new Map<string, PipelineRegister>();
      stages.forEach(stage => pipelineRegisters2.set(stage, createEmptyPipelineRegister()));
      superscalarPipe = { pipelineRegisters2 };
    }

    this.state = {
      cycle: 0,
      pc: 0,
      pipelineRegisters,
      registerFile: createRegisterFile(),
      memory: new Map(),
      hazards: [],
      forwardingPaths: [],
      timelineCells: new Map(),
      instructionStartCycle: new Map(),
      instructionStages: new Map(),
      completedInstructions: [],
      flushedInstructions: [],
      stallCount: 0,
      branchStats: {
        totalBranches: 0,
        correct: 0,
        incorrect: 0,
        accuracy: 0,
        mispredictionPenalty: 0
      },
      superscalarPipe
    };

    for (let i = 0; i < 1024; i++) {
      this.state.memory.set(i, i * 2);
    }
  }

  getState(): SimulatorState {
    return this.state;
  }

  getConfig(): SimulatorConfig {
    return this.config;
  }

  getInstructions(): Instruction[] {
    return this.instructions;
  }

  runFullSimulation(): PipelineTimeline {
    while (!this.isComplete() && this.state.cycle < this.config.maxCycles) {
      this.step();
    }
    return this.buildTimeline();
  }

  step(): boolean {
    if (this.isComplete()) return false;

    this.state.cycle++;
    const stages = getPipelineStages(this.config.model);
    const cycle = this.state.cycle;

    if (this.config.model === 'superscalar-2way') {
      this.stepSuperscalar();
      return !this.isComplete();
    }

    this.wbStage(cycle, 'WB');

    if (this.config.model === '7-stage') {
      this.memStage(cycle, 'MEM');
      this.exStage(cycle, 'EX2');
      this.exStage(cycle, 'EX1');
    } else {
      this.memStage(cycle, 'MEM');
      this.exStage(cycle, 'EX');
    }

    this.idStage(cycle, this.config.model === '7-stage' ? 'ID' : 'ID');

    if (this.config.model === '7-stage') {
      this.ifStage(cycle, 'IF2');
      this.ifStage(cycle, 'IF1');
    } else {
      this.ifStage(cycle, 'IF');
    }

    return !this.isComplete();
  }

  private stepSuperscalar(): void {
    const cycle = this.state.cycle;
    const stages = PIPELINE_STAGES_5;

    for (let pipe = 0; pipe < 2; pipe++) {
      const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
      this.wbStageSuperscalar(cycle, 'WB', pipe);
    }
    for (let pipe = 0; pipe < 2; pipe++) {
      const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
      this.memStageSuperscalar(cycle, 'MEM', pipe);
    }
    for (let pipe = 0; pipe < 2; pipe++) {
      const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
      this.exStageSuperscalar(cycle, 'EX', pipe);
    }
    for (let pipe = 0; pipe < 2; pipe++) {
      this.idStageSuperscalar(cycle, 'ID', pipe);
    }

    this.ifStageSuperscalar(cycle);
  }

  private ifStage(cycle: number, stageName: PipelineStage): void {
    const stages = getPipelineStages(this.config.model);
    const ifStageName = this.config.model === '7-stage' ? 'IF1' : 'IF';
    const nextIfStage = this.config.model === '7-stage' ? 'IF2' : 'ID';
    const idStage = this.config.model === '7-stage' ? 'ID' : 'ID';

    if (stageName === ifStageName) {
      const idReg = this.state.pipelineRegisters.get(idStage)!;
      if (idReg.stalled) {
        this.recordTimeline(null, stageName, cycle, true);
        return;
      }

      if (this.state.pc < this.instructions.length * 4) {
        const instrIndex = this.state.pc / 4;
        const instr = this.instructions[instrIndex];
        const nextPc = this.state.pc + 4;

        if (this.config.branchPrediction && instr.isBranch) {
          const targetAddr = instr.address + (instr.immediate || 0) * 4;
          const prediction = this.branchPrediction.predict(
            instr.address,
            this.config.branchPrediction,
            targetAddr
          );
          if (prediction.predicted) {
            this.state.pc = prediction.predictedTarget;
          } else {
            this.state.pc = nextPc;
          }
          (this.state.pipelineRegisters.get(ifStageName) as any).predictedBranch = prediction;
        } else {
          this.state.pc = nextPc;
        }

        const newReg = createEmptyPipelineRegister();
        newReg.instruction = instr;
        newReg.pc = instr.address;
        newReg.nextPc = nextPc;

        if (this.config.model === '7-stage') {
          this.state.pipelineRegisters.set('IF1', newReg);
        } else {
          this.state.pipelineRegisters.set('IF', newReg);
        }

        if (!this.state.instructionStartCycle.has(instr.id)) {
          this.state.instructionStartCycle.set(instr.id, cycle);
        }
        this.recordTimeline(instr, stageName, cycle, false);
      } else {
        this.state.pipelineRegisters.set(ifStageName, createEmptyPipelineRegister());
        this.recordTimeline(null, stageName, cycle, true);
      }
    } else if (stageName === 'IF2' && this.config.model === '7-stage') {
      const if1Reg = this.state.pipelineRegisters.get('IF1')!;
      this.state.pipelineRegisters.set('IF2', { ...if1Reg });
      if (if1Reg.instruction) {
        this.recordTimeline(if1Reg.instruction, stageName, cycle, false);
      } else {
        this.recordTimeline(null, stageName, cycle, true);
      }
    }
  }

  private idStage(cycle: number, stageName: PipelineStage): void {
    const prevStage = this.config.model === '7-stage' ? 'IF2' : 'IF';
    const prevReg = this.state.pipelineRegisters.get(prevStage)!;
    const currentReg = this.state.pipelineRegisters.get(stageName)!;

    if (prevReg.stalled) {
      this.state.pipelineRegisters.set(stageName, { ...prevReg, stalled: true });
      if (prevReg.instruction) {
        this.recordTimeline(prevReg.instruction, stageName, cycle, false, true);
      } else {
        this.recordTimeline(null, stageName, cycle, true);
      }
      return;
    }

    if (prevReg.isBubble || !prevReg.instruction) {
      this.state.pipelineRegisters.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true);
      return;
    }

    const instr = prevReg.instruction;
    const newReg = createEmptyPipelineRegister();
    newReg.instruction = instr;
    newReg.pc = prevReg.pc;
    newReg.nextPc = prevReg.nextPc;

    if (instr.rs1 !== undefined) {
      newReg.rs1Value = readRegister(this.state.registerFile, instr.rs1);
    }
    if (instr.rs2 !== undefined) {
      newReg.rs2Value = readRegister(this.state.registerFile, instr.rs2);
    }
    newReg.immediate = instr.immediate || 0;

    const stallNeeded = this.detectDataHazardsForStall(instr, cycle);
    if (stallNeeded && this.config.enableStallInsertion && !this.config.enableForwarding) {
      newReg.stalled = true;
      prevReg.stalled = true;
      this.state.stallCount++;

      const exStage = this.config.model === '7-stage' ? 'EX1' : 'EX';
      this.state.pipelineRegisters.set(exStage, createEmptyPipelineRegister());

      if (instr.rs1 !== undefined && this.isRegisterUsedAfter(instr, instr.rs1)) {
        const hazard: Hazard = {
          type: HazardType.RAW,
          instructionId1: this.findWriterOfRegister(instr.rs1) || '',
          instructionId2: instr.id,
          register: instr.rs1,
          description: `RAW冒险: x${instr.rs1} 需要等待写入完成`,
          cycle
        };
        this.state.hazards.push(hazard);
      }
    }

    if (instr.rd !== undefined && instr.needsWriteback) {
      markRegisterBusy(this.state.registerFile, instr.rd, instr.id);
    }

    this.state.pipelineRegisters.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false, stallNeeded);
  }

  private exStage(cycle: number, stageName: PipelineStage): void {
    const prevStage = this.config.model === '7-stage'
      ? (stageName === 'EX2' ? 'EX1' : 'ID')
      : 'ID';
    const prevReg = this.state.pipelineRegisters.get(prevStage)!;
    const newReg = createEmptyPipelineRegister();

    if (!prevReg.instruction || prevReg.isBubble) {
      this.state.pipelineRegisters.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true);
      return;
    }

    const instr = prevReg.instruction;
    newReg.instruction = instr;
    newReg.pc = prevReg.pc;
    newReg.nextPc = prevReg.nextPc;
    newReg.immediate = prevReg.immediate;
    newReg.regWrite = instr.needsWriteback;
    newReg.memRead = instr.isLoad;
    newReg.memWrite = instr.isStore;

    let rs1Val = prevReg.rs1Value || 0;
    let rs2Val = prevReg.rs2Value || 0;

    if (this.config.enableForwarding) {
      const forward1 = this.checkForwarding(instr, instr.rs1, 'rs1', cycle);
      if (forward1) {
        rs1Val = forward1.value;
        newReg.forwardRs1From = forward1.fromStage as any;
        this.state.forwardingPaths.push(forward1);
      }

      const forward2 = this.checkForwarding(instr, instr.rs2, 'rs2', cycle);
      if (forward2) {
        rs2Val = forward2.value;
        newReg.forwardRs2From = forward2.fromStage as any;
        this.state.forwardingPaths.push(forward2);
      }
    }

    let aluResult = 0;
    switch (instr.opcode) {
      case Opcode.ADD: aluResult = rs1Val + rs2Val; break;
      case Opcode.SUB: aluResult = rs1Val - rs2Val; break;
      case Opcode.MUL: aluResult = rs1Val * rs2Val; break;
      case Opcode.AND: aluResult = rs1Val & rs2Val; break;
      case Opcode.OR: aluResult = rs1Val | rs2Val; break;
      case Opcode.XOR: aluResult = rs1Val ^ rs2Val; break;
      case Opcode.SLL: aluResult = rs1Val << (rs2Val & 0x1f); break;
      case Opcode.SRL: aluResult = rs1Val >>> (rs2Val & 0x1f); break;
      case Opcode.ADDI: aluResult = rs1Val + (prevReg.immediate || 0); break;
      case Opcode.ANDI: aluResult = rs1Val & (prevReg.immediate || 0); break;
      case Opcode.ORI: aluResult = rs1Val | (prevReg.immediate || 0); break;
      case Opcode.LW:
      case Opcode.LH:
      case Opcode.LB: aluResult = rs1Val + (prevReg.immediate || 0); break;
      case Opcode.SW:
      case Opcode.SH:
      case Opcode.SB: aluResult = rs1Val + (prevReg.immediate || 0); break;
      case Opcode.JAL: aluResult = prevReg.nextPc || 0; break;
      case Opcode.JALR: aluResult = (rs1Val + (prevReg.immediate || 0)) & ~1; break;
      default: aluResult = 0;
    }

    newReg.aluResult = aluResult;
    newReg.writeData = rs2Val;

    if (instr.isBranch) {
      let taken = false;
      switch (instr.opcode) {
        case Opcode.BEQ: taken = rs1Val === rs2Val; break;
        case Opcode.BNE: taken = rs1Val !== rs2Val; break;
        case Opcode.BLT: taken = rs1Val < rs2Val; break;
        case Opcode.BGE: taken = rs1Val >= rs2Val; break;
      }
      const targetAddr = instr.address + (instr.immediate || 0) * 4;
      newReg.branchTaken = taken;
      newReg.branchTarget = taken ? targetAddr : prevReg.nextPc;

      this.state.branchStats.totalBranches++;
      if (this.config.branchPrediction) {
        const prediction = (prevReg as any).predictedBranch || { predicted: false, predictedTarget: prevReg.nextPc };
        const actual = taken;
        const correct = prediction.predicted === actual;
        if (correct) {
          this.state.branchStats.correct++;
        } else {
          this.state.branchStats.incorrect++;
          this.state.branchStats.mispredictionPenalty += 2;
          this.flushPipelineAfter(cycle);

          const hazard: Hazard = {
            type: HazardType.CONTROL,
            instructionId1: instr.id,
            instructionId2: instr.id,
            description: `控制冒险: 分支预测错误, 需要冲刷流水线`,
            cycle
          };
          this.state.hazards.push(hazard);
        }
        this.state.pc = newReg.branchTarget!;
        this.branchPrediction.update(
          instr.address, actual, targetAddr,
          prediction.predicted, prediction.predictedTarget,
          this.config.branchPrediction
        );
      } else if (taken) {
        this.state.pc = targetAddr;
        this.flushPipelineAfter(cycle);
        const hazard: Hazard = {
          type: HazardType.CONTROL,
          instructionId1: instr.id,
          instructionId2: instr.id,
          description: `控制冒险: 分支跳转, 需要冲刷流水线`,
          cycle
        };
        this.state.hazards.push(hazard);
      }

      this.state.branchStats.accuracy = this.state.branchStats.totalBranches > 0
        ? this.state.branchStats.correct / this.state.branchStats.totalBranches
        : 0;
    } else if (instr.isJump && instr.opcode === Opcode.JAL) {
      const targetAddr = instr.address + (instr.immediate || 0) * 4;
      this.state.pc = targetAddr;
      this.flushPipelineAfter(cycle);
    } else if (instr.isJump && instr.opcode === Opcode.JALR) {
      this.state.pc = aluResult;
      this.flushPipelineAfter(cycle);
    }

    this.state.pipelineRegisters.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false);
  }

  private memStage(cycle: number, stageName: PipelineStage): void {
    const prevStage = this.config.model === '7-stage' ? 'EX2' : 'EX';
    const prevReg = this.state.pipelineRegisters.get(prevStage)!;
    const newReg = createEmptyPipelineRegister();

    if (!prevReg.instruction || prevReg.isBubble) {
      this.state.pipelineRegisters.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true);
      return;
    }

    const instr = prevReg.instruction;
    newReg.instruction = instr;
    newReg.aluResult = prevReg.aluResult;
    newReg.writeData = prevReg.writeData;
    newReg.regWrite = prevReg.regWrite;

    if (instr.isLoad) {
      const addr = prevReg.aluResult || 0;
      let data = this.state.memory.get(addr) || 0;
      if (instr.opcode === Opcode.LH) data = (data << 16) >> 16;
      if (instr.opcode === Opcode.LB) data = (data << 24) >> 24;
      newReg.memoryData = data;
    } else if (instr.isStore) {
      const addr = prevReg.aluResult || 0;
      const data = prevReg.writeData || 0;
      this.state.memory.set(addr, data);
    }

    this.state.pipelineRegisters.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false);
  }

  private wbStage(cycle: number, stageName: PipelineStage): void {
    const prevStage = 'MEM';
    const prevReg = this.state.pipelineRegisters.get(prevStage)!;

    if (!prevReg.instruction || prevReg.isBubble) {
      this.state.pipelineRegisters.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true);
      return;
    }

    const instr = prevReg.instruction;

    if (instr.needsWriteback && instr.rd !== undefined) {
      let writeValue: number;
      if (instr.isLoad) {
        writeValue = prevReg.memoryData || 0;
      } else {
        writeValue = prevReg.aluResult || 0;
      }
      writeRegister(this.state.registerFile, instr.rd, writeValue, instr.id);
    }

    if (!this.state.completedInstructions.includes(instr.id)) {
      this.state.completedInstructions.push(instr.id);
    }

    const newReg = createEmptyPipelineRegister();
    newReg.instruction = instr;
    this.state.pipelineRegisters.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false);
  }

  private ifStageSuperscalar(cycle: number): void {
    for (let pipe = 0; pipe < 2; pipe++) {
      const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
      if (this.state.pc < this.instructions.length * 4) {
        const instrIndex = this.state.pc / 4;
        const instr = this.instructions[instrIndex];

        if (pipe === 1 && this.hasWriteAfterWriteHazard(instr, this.state.pipelineRegisters.get('ID')?.instruction ?? null)) {
          pregs.set('IF', createEmptyPipelineRegister());
          this.recordTimeline(null, 'IF', cycle, true, false, pipe);
          continue;
        }

        const newReg = createEmptyPipelineRegister();
        newReg.instruction = instr;
        newReg.pc = instr.address;
        newReg.nextPc = this.state.pc + 4;
        pregs.set('IF', newReg);

        if (!this.state.instructionStartCycle.has(instr.id)) {
          this.state.instructionStartCycle.set(instr.id, cycle);
        }
        this.recordTimeline(instr, 'IF', cycle, false, false, pipe);
        this.state.pc += 4;
      } else {
        pregs.set('IF', createEmptyPipelineRegister());
        this.recordTimeline(null, 'IF', cycle, true, false, pipe);
      }
    }
  }

  private idStageSuperscalar(cycle: number, stageName: PipelineStage, pipe: number): void {
    const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
    const otherPregs = pipe === 0 ? this.state.superscalarPipe!.pipelineRegisters2 : this.state.pipelineRegisters;

    const prevReg = pregs.get('IF')!;
    if (!prevReg.instruction || prevReg.isBubble) {
      pregs.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true, false, pipe);
      return;
    }

    const instr = prevReg.instruction;
    const otherInstr = otherPregs.get('IF')?.instruction ?? null;

    if (pipe === 1 && this.hasDataDependency(instr, otherInstr)) {
      pregs.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true, false, pipe);
      return;
    }

    const newReg = createEmptyPipelineRegister();
    newReg.instruction = instr;
    newReg.pc = prevReg.pc;
    newReg.nextPc = prevReg.nextPc;
    if (instr.rs1 !== undefined) newReg.rs1Value = readRegister(this.state.registerFile, instr.rs1);
    if (instr.rs2 !== undefined) newReg.rs2Value = readRegister(this.state.registerFile, instr.rs2);
    newReg.immediate = instr.immediate || 0;
    pregs.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false, false, pipe);
  }

  private exStageSuperscalar(cycle: number, stageName: PipelineStage, pipe: number): void {
    const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
    const prevReg = pregs.get('ID')!;
    if (!prevReg.instruction || prevReg.isBubble) {
      pregs.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true, false, pipe);
      return;
    }
    const instr = prevReg.instruction;
    const newReg = createEmptyPipelineRegister();
    newReg.instruction = instr;
    let rs1Val = prevReg.rs1Value || 0;
    let rs2Val = prevReg.rs2Value || 0;
    let aluResult = 0;
    switch (instr.opcode) {
      case Opcode.ADD: aluResult = rs1Val + rs2Val; break;
      case Opcode.SUB: aluResult = rs1Val - rs2Val; break;
      case Opcode.MUL: aluResult = rs1Val * rs2Val; break;
      default: aluResult = 0;
    }
    newReg.aluResult = aluResult;
    newReg.writeData = rs2Val;
    pregs.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false, false, pipe);
  }

  private memStageSuperscalar(cycle: number, stageName: PipelineStage, pipe: number): void {
    const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
    const prevReg = pregs.get('EX')!;
    if (!prevReg.instruction || prevReg.isBubble) {
      pregs.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true, false, pipe);
      return;
    }
    const instr = prevReg.instruction;
    const newReg = createEmptyPipelineRegister();
    newReg.instruction = instr;
    newReg.aluResult = prevReg.aluResult;
    pregs.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false, false, pipe);
  }

  private wbStageSuperscalar(cycle: number, stageName: PipelineStage, pipe: number): void {
    const pregs = pipe === 0 ? this.state.pipelineRegisters : this.state.superscalarPipe!.pipelineRegisters2;
    const prevReg = pregs.get('MEM')!;
    if (!prevReg.instruction || prevReg.isBubble) {
      pregs.set(stageName, createEmptyPipelineRegister());
      this.recordTimeline(null, stageName, cycle, true, false, pipe);
      return;
    }
    const instr = prevReg.instruction;
    if (instr.needsWriteback && instr.rd !== undefined) {
      writeRegister(this.state.registerFile, instr.rd, prevReg.aluResult || 0, instr.id);
    }
    if (!this.state.completedInstructions.includes(instr.id)) {
      this.state.completedInstructions.push(instr.id);
    }
    const newReg = createEmptyPipelineRegister();
    newReg.instruction = instr;
    pregs.set(stageName, newReg);
    this.recordTimeline(instr, stageName, cycle, false, false, pipe);
  }

  private detectDataHazardsForStall(instr: Instruction, cycle: number): boolean {
    if (instr.rs1 === undefined && instr.rs2 === undefined) return false;

    const stages = getPipelineStages(this.config.model);
    for (const stage of stages) {
      const preg = this.state.pipelineRegisters.get(stage);
      if (!preg?.instruction) continue;
      const prevInstr = preg.instruction;

      if (prevInstr.rd !== undefined) {
        if (instr.rs1 === prevInstr.rd || instr.rs2 === prevInstr.rd) {
          return true;
        }
      }
    }
    return false;
  }

  private checkForwarding(
    currentInstr: Instruction,
    reg: number | undefined,
    operandName: string,
    cycle: number
  ): ForwardingPath | null {
    if (reg === undefined || reg === 0) return null;

    const memStage = this.config.model === '7-stage' ? 'MEM' : 'MEM';
    const wbStage = 'WB';

    const memReg = this.state.pipelineRegisters.get(memStage);
    if (memReg?.instruction && memReg.instruction.rd === reg && memReg.instruction.needsWriteback) {
      const value = memReg.instruction.isLoad ? (memReg.memoryData || 0) : (memReg.aluResult || 0);
      return {
        fromInstructionId: memReg.instruction.id,
        toInstructionId: currentInstr.id,
        fromStage: 'MEM',
        toStage: this.config.model === '7-stage' ? 'EX1' : 'EX',
        register: reg,
        value
      };
    }

    const wbReg = this.state.pipelineRegisters.get(wbStage);
    if (wbReg?.instruction && wbReg.instruction.rd === reg && wbReg.instruction.needsWriteback) {
      const value = wbReg.instruction.isLoad ? (wbReg.memoryData || 0) : (wbReg.aluResult || 0);
      return {
        fromInstructionId: wbReg.instruction.id,
        toInstructionId: currentInstr.id,
        fromStage: 'WB',
        toStage: this.config.model === '7-stage' ? 'EX1' : 'EX',
        register: reg,
        value
      };
    }

    return null;
  }

  private findWriterOfRegister(reg: number): string | null {
    const stages = getPipelineStages(this.config.model);
    for (const stage of stages) {
      const preg = this.state.pipelineRegisters.get(stage);
      if (preg?.instruction?.rd === reg) {
        return preg.instruction.id;
      }
    }
    return null;
  }

  private isRegisterUsedAfter(instr: Instruction, reg: number): boolean {
    return instr.rs1 === reg || instr.rs2 === reg;
  }

  private hasDataDependency(instr1: Instruction | null, instr2: Instruction | null): boolean {
    if (!instr1 || !instr2) return false;
    if (instr1.rs1 !== undefined && instr2.rd === instr1.rs1) return true;
    if (instr1.rs2 !== undefined && instr2.rd === instr1.rs2) return true;
    return false;
  }

  private hasWriteAfterWriteHazard(instr1: Instruction | null, instr2: Instruction | null): boolean {
    if (!instr1 || !instr2) return false;
    return instr1.rd !== undefined && instr1.rd === instr2.rd;
  }

  private flushPipelineAfter(cycle: number): void {
    const stages = getPipelineStages(this.config.model);
    for (let i = 0; i < stages.indexOf('EX'); i++) {
      const stage = stages[i];
      const preg = this.state.pipelineRegisters.get(stage);
      if (preg?.instruction && !preg.instruction.isBranch && !preg.instruction.isJump) {
        if (!this.state.flushedInstructions.includes(preg.instruction.id)) {
          this.state.flushedInstructions.push(preg.instruction.id);
        }
      }
      this.state.pipelineRegisters.set(stage, createEmptyPipelineRegister());
    }
  }

  private recordTimeline(
    instr: Instruction | null,
    stage: PipelineStage,
    cycle: number,
    isBubble: boolean,
    stalled: boolean = false,
    pipe: number = 0
  ): void {
    if (!instr) {
      const key = `bubble_${pipe}_${cycle}_${stage}`;
      this.state.timelineCells.set(key, {
        instructionId: 'bubble',
        stage: 'BUBBLE',
        cycle,
        isBubble: true
      });
      return;
    }

    const instrIndex = this.instructions.findIndex(i => i.id === instr.id);
    const key = getCellKey(instrIndex, cycle) + `_${stage}` + (pipe > 0 ? `_p${pipe}` : '');

    let hazardHighlight: HazardType | undefined;
    const hazard = this.state.hazards.find(h =>
      (h.instructionId1 === instr.id || h.instructionId2 === instr.id) &&
      h.cycle === cycle
    );
    if (hazard) hazardHighlight = hazard.type;

    this.state.timelineCells.set(key, {
      instructionId: instr.id,
      stage,
      cycle,
      isBubble,
      hazardHighlight,
      flushed: this.state.flushedInstructions.includes(instr.id)
    });

    if (!this.state.instructionStages.has(instr.id)) {
      this.state.instructionStages.set(instr.id, new Map());
    }
    const stageMap = this.state.instructionStages.get(instr.id)!;
    if (!stageMap.has(stage)) {
      stageMap.set(stage, []);
    }
    stageMap.get(stage)!.push(cycle);
  }

  private isComplete(): boolean {
    if (this.state.completedInstructions.length >= this.instructions.filter(i => !i.isNop).length) {
      return true;
    }
    const stages = getPipelineStages(this.config.model);
    let allEmpty = true;
    for (const stage of stages) {
      const preg = this.state.pipelineRegisters.get(stage);
      if (preg?.instruction && !preg.instruction.isNop) {
        allEmpty = false;
        break;
      }
    }
    if (this.config.model === 'superscalar-2way' && this.state.superscalarPipe) {
      for (const stage of stages) {
        const preg = this.state.superscalarPipe.pipelineRegisters2.get(stage);
        if (preg?.instruction && !preg.instruction.isNop) {
          allEmpty = false;
          break;
        }
      }
    }
    return allEmpty && this.state.pc >= this.instructions.length * 4;
  }

  private buildTimeline(): PipelineTimeline {
    return {
      instructions: this.instructions,
      cycles: this.state.cycle,
      cells: new Map(this.state.timelineCells),
      hazards: [...this.state.hazards],
      forwardingPaths: [...this.state.forwardingPaths]
    };
  }

  getPerformanceStats(): PerformanceStats {
    const totalCycles = this.state.cycle;
    const completed = this.state.completedInstructions.length;
    const stages = getPipelineStages(this.config.model);
    const stageUtilization = new Map<string, number>();

    for (const stage of stages) {
      let used = 0;
      this.state.timelineCells.forEach(cell => {
        if (cell.stage === stage && !cell.isBubble) used++;
      });
      stageUtilization.set(stage, totalCycles > 0 ? used / totalCycles : 0);
    }

    const hazardStalls = new Map<HazardType, number>();
    for (const hazard of this.state.hazards) {
      const current = hazardStalls.get(hazard.type) || 0;
      hazardStalls.set(hazard.type, current + 1);
    }

    return {
      totalCycles,
      totalInstructions: this.instructions.filter(i => !i.isNop).length,
      completedInstructions: completed,
      cpi: completed > 0 ? totalCycles / completed : 0,
      ipc: totalCycles > 0 ? completed / totalCycles : 0,
      stageUtilization,
      hazardStalls,
      totalStallCycles: this.state.stallCount,
      forwardingUsed: this.state.forwardingPaths.length,
      branchPredictionStats: { ...this.state.branchStats }
    };
  }
}
