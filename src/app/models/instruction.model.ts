export enum Opcode {
  ADD = 'ADD', SUB = 'SUB', MUL = 'MUL',
  AND = 'AND', OR = 'OR', XOR = 'XOR', SLL = 'SLL', SRL = 'SRL',
  ADDI = 'ADDI', ANDI = 'ANDI', ORI = 'ORI',
  LW = 'LW', LH = 'LH', LB = 'LB',
  SW = 'SW', SH = 'SH', SB = 'SB',
  BEQ = 'BEQ', BNE = 'BNE', BLT = 'BLT', BGE = 'BGE',
  JAL = 'JAL', JALR = 'JALR',
  NOP = 'NOP'
}

export enum InstructionType {
  R_TYPE = 'R_TYPE',
  I_TYPE = 'I_TYPE',
  S_TYPE = 'S_TYPE',
  B_TYPE = 'B_TYPE',
  J_TYPE = 'J_TYPE',
  NOP = 'NOP'
}

export interface Operand {
  type: 'register' | 'immediate' | 'label' | 'offset';
  value: number | string;
  registerNum?: number;
}

export interface Instruction {
  id: string;
  address: number;
  opcode: Opcode;
  type: InstructionType;
  rd?: number;
  rs1?: number;
  rs2?: number;
  immediate?: number;
  label?: string;
  rawText: string;
  isNop: boolean;
  executionCycles: number;
  needsMemory: boolean;
  needsWriteback: boolean;
  isBranch: boolean;
  isJump: boolean;
  isLoad: boolean;
  isStore: boolean;
  comment?: string;
}

export function getInstructionType(opcode: Opcode): InstructionType {
  const rTypes = [Opcode.ADD, Opcode.SUB, Opcode.MUL, Opcode.AND, Opcode.OR, Opcode.XOR, Opcode.SLL, Opcode.SRL];
  const iTypes = [Opcode.ADDI, Opcode.ANDI, Opcode.ORI, Opcode.LW, Opcode.LH, Opcode.LB, Opcode.JALR];
  const sTypes = [Opcode.SW, Opcode.SH, Opcode.SB];
  const bTypes = [Opcode.BEQ, Opcode.BNE, Opcode.BLT, Opcode.BGE];
  const jTypes = [Opcode.JAL];

  if (rTypes.includes(opcode)) return InstructionType.R_TYPE;
  if (iTypes.includes(opcode)) return InstructionType.I_TYPE;
  if (sTypes.includes(opcode)) return InstructionType.S_TYPE;
  if (bTypes.includes(opcode)) return InstructionType.B_TYPE;
  if (jTypes.includes(opcode)) return InstructionType.J_TYPE;
  return InstructionType.NOP;
}

export function isBranchInstruction(opcode: Opcode): boolean {
  return [Opcode.BEQ, Opcode.BNE, Opcode.BLT, Opcode.BGE].includes(opcode);
}

export function isJumpInstruction(opcode: Opcode): boolean {
  return [Opcode.JAL, Opcode.JALR].includes(opcode);
}

export function isLoadInstruction(opcode: Opcode): boolean {
  return [Opcode.LW, Opcode.LH, Opcode.LB].includes(opcode);
}

export function isStoreInstruction(opcode: Opcode): boolean {
  return [Opcode.SW, Opcode.SH, Opcode.SB].includes(opcode);
}

export function needsWriteback(opcode: Opcode): boolean {
  if (opcode === Opcode.NOP) return false;
  if (isStoreInstruction(opcode)) return false;
  if (isBranchInstruction(opcode)) return false;
  return true;
}

export function needsMemory(opcode: Opcode): boolean {
  return isLoadInstruction(opcode) || isStoreInstruction(opcode);
}

export function getExecutionCycles(opcode: Opcode): number {
  if (opcode === Opcode.MUL) return 3;
  return 1;
}

export function createNop(): Instruction {
  return {
    id: `nop_${Math.random().toString(36).substr(2, 9)}`,
    address: -1,
    opcode: Opcode.NOP,
    type: InstructionType.NOP,
    rawText: 'NOP',
    isNop: true,
    executionCycles: 1,
    needsMemory: false,
    needsWriteback: false,
    isBranch: false,
    isJump: false,
    isLoad: false,
    isStore: false
  };
}
