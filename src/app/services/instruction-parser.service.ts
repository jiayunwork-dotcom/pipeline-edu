import { Injectable } from '@angular/core';
import {
  Instruction, Opcode, InstructionType,
  getInstructionType, isBranchInstruction, isJumpInstruction,
  isLoadInstruction, isStoreInstruction, needsWriteback, needsMemory,
  getExecutionCycles, createNop
} from '../models/instruction.model';

export interface ParseError {
  line: number;
  message: string;
  rawText: string;
}

export interface ParseResult {
  instructions: Instruction[];
  errors: ParseError[];
  labels: Map<string, number>;
}

@Injectable({
  providedIn: 'root'
})
export class InstructionParserService {
  private validOpcodes = new Set<string>(Object.values(Opcode));

  parse(assemblyCode: string): ParseResult {
    const errors: ParseError[] = [];
    const instructions: Instruction[] = [];
    const labels = new Map<string, number>();
    const lines = assemblyCode.split('\n');
    let address = 0;
    let instructionIndex = 0;
    const preprocessedLines: { line: string; lineNum: number; label?: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      const commentIndex = line.indexOf('#');
      if (commentIndex !== -1) {
        line = line.substring(0, commentIndex).trim();
      }
      if (!line) continue;

      const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (labelMatch) {
        const labelName = labelMatch[1];
        labels.set(labelName, address);
        line = labelMatch[2].trim();
        if (!line) continue;
      }

      preprocessedLines.push({ line, lineNum: i + 1 });
      address += 4;
    }

    address = 0;
    for (const { line, lineNum } of preprocessedLines) {
      try {
        const instr = this.parseInstruction(line, address, instructionIndex, labels);
        if (instr) {
          instructions.push(instr);
          instructionIndex++;
        }
      } catch (e) {
        errors.push({
          line: lineNum,
          message: e instanceof Error ? e.message : '未知错误',
          rawText: line
        });
      }
      address += 4;
    }

    return { instructions, errors, labels };
  }

  private parseInstruction(line: string, address: number, index: number, labels: Map<string, number>): Instruction | null {
    const upperLine = line.toUpperCase().trim();
    const tokens = upperLine.split(/[\s,()]+/).filter(t => t.length > 0);
    const originalTokens = line.trim().split(/[\s,()]+/).filter(t => t.length > 0);

    if (tokens.length === 0) return null;

    const opcodeStr = tokens[0];
    if (!this.validOpcodes.has(opcodeStr) && opcodeStr !== 'NOP') {
      throw new Error(`未知操作码: ${opcodeStr}`);
    }

    const opcode = opcodeStr as Opcode;
    const type = getInstructionType(opcode);

    let rd: number | undefined;
    let rs1: number | undefined;
    let rs2: number | undefined;
    let immediate: number | undefined;
    let labelRef: string | undefined;

    switch (type) {
      case InstructionType.R_TYPE:
        if (tokens.length < 4) throw new Error('R型指令需要4个操作数');
        rd = this.parseRegister(tokens[1]);
        rs1 = this.parseRegister(tokens[2]);
        rs2 = this.parseRegister(tokens[3]);
        break;

      case InstructionType.I_TYPE:
        if (tokens.length < 3) throw new Error('I型指令需要至少3个操作数');
        if (isLoadInstruction(opcode)) {
          rd = this.parseRegister(tokens[1]);
          const { offset, baseReg } = this.parseMemoryOperand(tokens.slice(2).join(' '), line);
          immediate = offset;
          rs1 = baseReg;
        } else if (opcode === Opcode.JALR) {
          rd = this.parseRegister(tokens[1]);
          rs1 = this.parseRegister(tokens[2]);
          if (tokens.length > 3) immediate = this.parseImmediate(tokens[3]);
          else immediate = 0;
        } else {
          rd = this.parseRegister(tokens[1]);
          rs1 = this.parseRegister(tokens[2]);
          immediate = this.parseImmediate(tokens[3]);
        }
        break;

      case InstructionType.S_TYPE:
        if (tokens.length < 3) throw new Error('S型指令需要至少3个操作数');
        rs2 = this.parseRegister(tokens[1]);
        const memOp = this.parseMemoryOperand(tokens.slice(2).join(' '), line);
        immediate = memOp.offset;
        rs1 = memOp.baseReg;
        break;

      case InstructionType.B_TYPE:
        if (tokens.length < 4) throw new Error('B型指令需要4个操作数');
        rs1 = this.parseRegister(tokens[1]);
        rs2 = this.parseRegister(tokens[2]);
        const bLabelOrImm = originalTokens[3];
        if (labels.has(bLabelOrImm)) {
          labelRef = bLabelOrImm;
          immediate = (labels.get(bLabelOrImm)! - address) / 4;
        } else {
          immediate = this.parseImmediate(tokens[3]);
        }
        break;

      case InstructionType.J_TYPE:
        if (tokens.length < 3) throw new Error('J型指令需要3个操作数');
        rd = this.parseRegister(tokens[1]);
        const jLabelOrImm = originalTokens[2];
        if (labels.has(jLabelOrImm)) {
          labelRef = jLabelOrImm;
          immediate = (labels.get(jLabelOrImm)! - address) / 4;
        } else {
          immediate = this.parseImmediate(tokens[2]);
        }
        break;

      case InstructionType.NOP:
        return createNop();
    }

    return {
      id: `instr_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      address,
      opcode,
      type,
      rd,
      rs1,
      rs2,
      immediate,
      label: labelRef,
      rawText: line,
      isNop: false,
      executionCycles: getExecutionCycles(opcode),
      needsMemory: needsMemory(opcode),
      needsWriteback: needsWriteback(opcode),
      isBranch: isBranchInstruction(opcode),
      isJump: isJumpInstruction(opcode),
      isLoad: isLoadInstruction(opcode),
      isStore: isStoreInstruction(opcode)
    };
  }

  private parseRegister(token: string): number {
    const match = token.match(/^X(\d+)$/i);
    if (!match) {
      throw new Error(`无效的寄存器格式: ${token}, 应该是 x0-x31`);
    }
    const regNum = parseInt(match[1], 10);
    if (regNum < 0 || regNum > 31) {
      throw new Error(`寄存器编号越界: ${regNum}, 应该是 0-31`);
    }
    return regNum;
  }

  private parseImmediate(token: string): number {
    let value: number;
    if (token.startsWith('0X') || token.startsWith('0x')) {
      value = parseInt(token, 16);
    } else if (token.startsWith('0B') || token.startsWith('0b')) {
      value = parseInt(token.substring(2), 2);
    } else {
      value = parseInt(token, 10);
    }
    if (isNaN(value)) {
      throw new Error(`无效的立即数: ${token}`);
    }
    return value;
  }

  private parseMemoryOperand(operand: string, rawLine: string): { offset: number; baseReg: number } {
    const match = operand.match(/^(-?\d+)\s*\(\s*X(\d+)\s*\)$/i);
    if (!match) {
      const match2 = rawLine.match(/(-?\d+)\s*\(\s*X(\d+)\s*\)/i);
      if (match2) {
        return {
          offset: parseInt(match2[1], 10),
          baseReg: parseInt(match2[2], 10)
        };
      }
      throw new Error(`无效的内存操作数格式: ${operand}, 应该是 offset(xN)`);
    }
    return {
      offset: parseInt(match[1], 10),
      baseReg: parseInt(match[2], 10)
    };
  }

  formatInstruction(instr: Instruction): string {
    if (instr.isNop) return 'NOP';

    const parts: string[] = [instr.opcode];

    if (instr.type === InstructionType.R_TYPE) {
      parts.push(`x${instr.rd}`, `x${instr.rs1}`, `x${instr.rs2}`);
    } else if (instr.type === InstructionType.I_TYPE) {
      if (instr.isLoad) {
        parts.push(`x${instr.rd}`, `${instr.immediate}(x${instr.rs1})`);
      } else {
        parts.push(`x${instr.rd}`, `x${instr.rs1}`, `${instr.immediate}`);
      }
    } else if (instr.type === InstructionType.S_TYPE) {
      parts.push(`x${instr.rs2}`, `${instr.immediate}(x${instr.rs1})`);
    } else if (instr.type === InstructionType.B_TYPE) {
      parts.push(`x${instr.rs1}`, `x${instr.rs2}`, instr.label || `${instr.immediate}`);
    } else if (instr.type === InstructionType.J_TYPE) {
      parts.push(`x${instr.rd}`, instr.label || `${instr.immediate}`);
    }

    return parts.join(' ');
  }
}
