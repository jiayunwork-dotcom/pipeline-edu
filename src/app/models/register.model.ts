import { Instruction } from './instruction.model';

export interface RegisterFile {
  registers: number[];
  registerBusy: (string | null)[];
}

export function createRegisterFile(): RegisterFile {
  const registers = new Array(32).fill(0);
  const registerBusy = new Array(32).fill(null);
  return { registers, registerBusy };
}

export function readRegister(rf: RegisterFile, reg: number): number {
  if (reg === 0) return 0;
  return rf.registers[reg] || 0;
}

export function writeRegister(rf: RegisterFile, reg: number, value: number, instructionId?: string): void {
  if (reg === 0) return;
  rf.registers[reg] = value;
  if (instructionId && rf.registerBusy[reg] === instructionId) {
    rf.registerBusy[reg] = null;
  }
}

export function markRegisterBusy(rf: RegisterFile, reg: number, instructionId: string): void {
  if (reg === 0) return;
  rf.registerBusy[reg] = instructionId;
}

export interface PipelineRegister {
  instruction: Instruction | null;
  pc?: number;
  nextPc?: number;
  rs1Value?: number;
  rs2Value?: number;
  immediate?: number;
  aluResult?: number;
  memoryAddress?: number;
  memoryData?: number;
  writeData?: number;
  branchTaken?: boolean;
  branchTarget?: number;
  regWrite?: boolean;
  memRead?: boolean;
  memWrite?: boolean;
  forwardRs1From?: 'EX' | 'MEM' | 'WB' | null;
  forwardRs2From?: 'EX' | 'MEM' | 'WB' | null;
  isBubble?: boolean;
  stalled?: boolean;
}

export function createEmptyPipelineRegister(): PipelineRegister {
  return {
    instruction: null,
    isBubble: false,
    stalled: false
  };
}

export interface ForwardingPath {
  fromInstructionId: string;
  toInstructionId: string;
  fromStage: string;
  toStage: string;
  register: number;
  value: number;
}

export enum HazardType {
  RAW = 'RAW',
  WAR = 'WAR',
  WAW = 'WAW',
  CONTROL = 'CONTROL',
  STRUCTURAL = 'STRUCTURAL'
}

export interface Hazard {
  type: HazardType;
  instructionId1: string;
  instructionId2: string;
  register?: number;
  description: string;
  cycle: number;
  resolved?: boolean;
  resolutionMethod?: string;
}

export type PipelineModel = '5-stage' | '7-stage' | 'superscalar-2way';

export type PipelineStage5 = 'IF' | 'ID' | 'EX' | 'MEM' | 'WB';
export type PipelineStage7 = 'IF1' | 'IF2' | 'ID' | 'EX1' | 'EX2' | 'MEM' | 'WB';
export type PipelineStage = PipelineStage5 | PipelineStage7;

export const PIPELINE_STAGES_5: PipelineStage5[] = ['IF', 'ID', 'EX', 'MEM', 'WB'];
export const PIPELINE_STAGES_7: PipelineStage7[] = ['IF1', 'IF2', 'ID', 'EX1', 'EX2', 'MEM', 'WB'];

export function getPipelineStages(model: PipelineModel): PipelineStage[] {
  switch (model) {
    case '5-stage': return PIPELINE_STAGES_5 as PipelineStage[];
    case '7-stage': return PIPELINE_STAGES_7 as PipelineStage[];
    case 'superscalar-2way': return PIPELINE_STAGES_5 as PipelineStage[];
  }
}

export interface PipelineTimelineCell {
  instructionId: string;
  stage: PipelineStage | 'BUBBLE';
  cycle: number;
  isBubble: boolean;
  hazardHighlight?: HazardType;
  forwardArrow?: ForwardingPath;
  flushed?: boolean;
}

export interface PipelineTimeline {
  instructions: Instruction[];
  cycles: number;
  cells: Map<string, PipelineTimelineCell>;
  hazards: Hazard[];
  forwardingPaths: ForwardingPath[];
}

export function getCellKey(instructionIndex: number, cycle: number): string {
  return `${instructionIndex}_${cycle}`;
}
