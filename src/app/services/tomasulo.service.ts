import { Injectable } from '@angular/core';
import { Instruction, Opcode } from '../models/instruction.model';
import {
  TomasuloState, ReservationStation, FunctionalUnit, ROBEntry,
  CDBBroadcast, TomasuloTimeline
} from '../models/tomasulo.model';
import { Hazard, HazardType } from '../models/register.model';

const RS_CONFIGS = [
  { name: 'Load1', type: 'LOAD' as const, count: 2 },
  { name: 'Store1', type: 'STORE' as const, count: 2 },
  { name: 'Add1', type: 'INT' as const, count: 3 },
  { name: 'Mult1', type: 'MULT' as const, count: 2 },
];

const FU_CONFIGS = [
  { name: 'INT_ALU', type: 'INT' as const, latency: 1 },
  { name: 'MULT_ALU', type: 'MULT' as const, latency: 3 },
  { name: 'LOAD_UNIT', type: 'LOAD' as const, latency: 2 },
  { name: 'STORE_UNIT', type: 'STORE' as const, latency: 1 },
];

@Injectable({
  providedIn: 'root'
})
export class TomasuloService {
  private state!: TomasuloState;
  private instructions: Instruction[] = [];
  private hazards: Hazard[] = [];
  private states: TomasuloState[] = [];
  private maxROBSize = 8;

  initialize(instructions: Instruction[]): void {
    this.instructions = instructions;
    this.hazards = [];
    this.states = [];

    const reservationStations: ReservationStation[] = [];
    for (const config of RS_CONFIGS) {
      for (let i = 0; i < config.count; i++) {
        reservationStations.push({
          name: `${config.name}${i + 1}`,
          busy: false,
          op: null,
          Vj: null,
          Vk: null,
          Qj: null,
          Qk: null,
          A: null,
          instructionId: null,
          executionRemaining: 0,
          resultReady: false,
          result: null
        });
      }
    }

    const functionalUnits: FunctionalUnit[] = FU_CONFIGS.map(config => ({
      name: config.name,
      type: config.type,
      busy: false,
      currentInstructionId: null,
      cyclesRemaining: 0,
      latency: config.latency
    }));

    this.state = {
      cycle: 0,
      programCounter: 0,
      reservationStations,
      functionalUnits,
      reorderBuffer: [],
      registers: new Array(32).fill(0),
      registerReorder: new Array(32).fill(null),
      memory: new Map(),
      issuedInstructions: [],
      committedInstructions: [],
      cdbBroadcasts: [],
      lastCDBBroadcast: null
    };

    for (let i = 0; i < 1024; i++) {
      this.state.memory.set(i, i * 2);
    }

    this.saveState();
  }

  getState(): TomasuloState {
    return this.state;
  }

  getStates(): TomasuloState[] {
    return this.states;
  }

  getHazards(): Hazard[] {
    return this.hazards;
  }

  getTimeline(): TomasuloTimeline {
    return {
      states: this.states,
      totalCycles: this.state.cycle
    };
  }

  runFull(maxCycles = 200): TomasuloTimeline {
    while (!this.isComplete() && this.state.cycle < maxCycles) {
      this.step();
    }
    return this.getTimeline();
  }

  step(): boolean {
    if (this.isComplete()) return false;

    this.state.cycle++;
    this.state.lastCDBBroadcast = null;

    this.commitStage();
    this.writeResultStage();
    this.executeStage();
    this.issueStage();

    this.saveState();
    return !this.isComplete();
  }

  private issueStage(): void {
    if (this.state.programCounter >= this.instructions.length * 4) return;
    if (this.state.reorderBuffer.length >= this.maxROBSize) return;

    const instrIndex = this.state.programCounter / 4;
    const instr = this.instructions[instrIndex];
    if (!instr || instr.isNop) {
      this.state.programCounter += 4;
      return;
    }

    const rsType = this.getRSType(instr);
    const availableRS = this.state.reservationStations.find(
      rs => !rs.busy && this.rsMatchesType(rs, rsType)
    );

    if (!availableRS) return;

    const robId = `ROB${this.state.reorderBuffer.length + 1}`;
    const robEntry: ROBEntry = {
      id: robId,
      instructionId: instr.id,
      instruction: instr,
      state: 'ISSUE',
      destination: instr.rd !== undefined ? instr.rd : null,
      value: null,
      ready: false,
      exception: false
    };

    availableRS.busy = true;
    availableRS.op = instr.opcode;
    availableRS.instructionId = instr.id;
    availableRS.executionRemaining = this.getExecutionLatency(instr);
    availableRS.resultReady = false;
    availableRS.result = null;
    availableRS.A = instr.immediate || null;

    if (instr.rs1 !== undefined) {
      const rs1Reg = instr.rs1;
      if (this.state.registerReorder[rs1Reg]) {
        const robEntryForRs1 = this.state.reorderBuffer.find(
          r => r.id === this.state.registerReorder[rs1Reg]
        );
        if (robEntryForRs1 && robEntryForRs1.ready) {
          availableRS.Vj = robEntryForRs1.value;
          availableRS.Qj = null;
        } else {
          availableRS.Qj = this.state.registerReorder[rs1Reg];
          availableRS.Vj = null;
        }
      } else {
        availableRS.Vj = this.state.registers[rs1Reg] || 0;
        availableRS.Qj = null;
      }
    } else {
      availableRS.Vj = null;
      availableRS.Qj = null;
    }

    if (instr.rs2 !== undefined && !instr.isStore) {
      const rs2Reg = instr.rs2;
      if (this.state.registerReorder[rs2Reg]) {
        const robEntryForRs2 = this.state.reorderBuffer.find(
          r => r.id === this.state.registerReorder[rs2Reg]
        );
        if (robEntryForRs2 && robEntryForRs2.ready) {
          availableRS.Vk = robEntryForRs2.value;
          availableRS.Qk = null;
        } else {
          availableRS.Qk = this.state.registerReorder[rs2Reg];
          availableRS.Vk = null;
        }
      } else {
        availableRS.Vk = this.state.registers[rs2Reg] || 0;
        availableRS.Qk = null;
      }
    } else if (instr.isStore && instr.rs2 !== undefined) {
      const rs2Reg = instr.rs2;
      if (this.state.registerReorder[rs2Reg]) {
        const robEntryForRs2 = this.state.reorderBuffer.find(
          r => r.id === this.state.registerReorder[rs2Reg]
        );
        if (robEntryForRs2 && robEntryForRs2.ready) {
          availableRS.Vk = robEntryForRs2.value;
          availableRS.Qk = null;
        } else {
          availableRS.Qk = this.state.registerReorder[rs2Reg];
          availableRS.Vk = null;
        }
      } else {
        availableRS.Vk = this.state.registers[rs2Reg] || 0;
        availableRS.Qk = null;
      }
    } else {
      availableRS.Vk = null;
      availableRS.Qk = null;
    }

    if (instr.rd !== undefined && instr.needsWriteback) {
      this.state.registerReorder[instr.rd] = robId;
    }

    this.state.reorderBuffer.push(robEntry);
    this.state.issuedInstructions.push(instr.id);
    this.state.programCounter += 4;
  }

  private executeStage(): void {
    for (const rs of this.state.reservationStations) {
      if (!rs.busy || rs.resultReady) continue;
      if (rs.Qj !== null || rs.Qk !== null) continue;

      const fuType = this.getFUType(rs);
      const availableFU = this.state.functionalUnits.find(
        fu => fu.type === fuType && !fu.busy
      );

      if (!availableFU) continue;

      if (rs.executionRemaining === this.getExecutionLatency(rs.instructionId
        ? this.instructions.find(i => i.id === rs.instructionId)!
        : { opcode: Opcode.ADD } as Instruction)) {
        availableFU.busy = true;
        availableFU.currentInstructionId = rs.instructionId;
        availableFU.cyclesRemaining = rs.executionRemaining;
      }

      if (availableFU.busy && availableFU.currentInstructionId === rs.instructionId) {
        availableFU.cyclesRemaining--;
        rs.executionRemaining--;

        if (rs.executionRemaining <= 0) {
          rs.result = this.executeOperation(rs);
          rs.resultReady = true;
          availableFU.busy = false;
          availableFU.currentInstructionId = null;
        }
        break;
      }
    }
  }

  private writeResultStage(): void {
    const readyStations = this.state.reservationStations.filter(
      rs => rs.busy && rs.resultReady
    );

    if (readyStations.length === 0) return;

    const selectedRS = readyStations[0];
    const result = selectedRS.result!;

    const robEntry = this.state.reorderBuffer.find(
      r => r.instructionId === selectedRS.instructionId
    );

    if (robEntry) {
      robEntry.state = 'WRITE_RESULT';
      robEntry.value = result;
      robEntry.ready = true;
    }

    for (const rs of this.state.reservationStations) {
      if (rs.Qj === selectedRS.name) {
        rs.Vj = result;
        rs.Qj = null;
      }
      if (rs.Qk === selectedRS.name) {
        rs.Vk = result;
        rs.Qk = null;
      }
    }

    for (let i = 0; i < 32; i++) {
      if (this.state.registerReorder[i] === robEntry?.id) {
      }
    }

    const broadcast: CDBBroadcast = {
      source: selectedRS.name,
      value: result,
      destination: robEntry?.destination || null,
      cycle: this.state.cycle,
      instructionId: selectedRS.instructionId || ''
    };
    this.state.cdbBroadcasts.push(broadcast);
    this.state.lastCDBBroadcast = broadcast;

    selectedRS.busy = false;
    selectedRS.op = null;
    selectedRS.Vj = null;
    selectedRS.Vk = null;
    selectedRS.Qj = null;
    selectedRS.Qk = null;
    selectedRS.A = null;
    selectedRS.instructionId = null;
    selectedRS.resultReady = false;
    selectedRS.result = null;
  }

  private commitStage(): void {
    if (this.state.reorderBuffer.length === 0) return;

    const head = this.state.reorderBuffer[0];
    if (!head.ready) return;

    if (head.instruction.isStore) {
      const addrRS = this.state.reservationStations.find(
        rs => rs.instructionId === head.instructionId
      );
      const address = (addrRS?.Vj || 0) + (addrRS?.A || 0);
      this.state.memory.set(address, head.value || 0);
    } else if (head.destination !== null) {
      this.state.registers[head.destination] = head.value || 0;
      if (this.state.registerReorder[head.destination] === head.id) {
        this.state.registerReorder[head.destination] = null;
      }
    }

    head.state = 'COMMIT';
    if (!this.state.committedInstructions.includes(head.instructionId)) {
      this.state.committedInstructions.push(head.instructionId);
    }

    this.state.reorderBuffer.shift();
  }

  private getRSType(instr: Instruction): 'INT' | 'MULT' | 'LOAD' | 'STORE' | 'BRANCH' {
    if (instr.isLoad) return 'LOAD';
    if (instr.isStore) return 'STORE';
    if (instr.opcode === Opcode.MUL) return 'MULT';
    if (instr.isBranch) return 'BRANCH';
    return 'INT';
  }

  private rsMatchesType(rs: ReservationStation, type: string): boolean {
    if (type === 'LOAD') return rs.name.startsWith('Load');
    if (type === 'STORE') return rs.name.startsWith('Store');
    if (type === 'MULT') return rs.name.startsWith('Mult');
    if (type === 'INT') return rs.name.startsWith('Add');
    return rs.name.startsWith('Add');
  }

  private getFUType(rs: ReservationStation): 'INT' | 'MULT' | 'LOAD' | 'STORE' | 'BRANCH' {
    if (rs.name.startsWith('Load')) return 'LOAD';
    if (rs.name.startsWith('Store')) return 'STORE';
    if (rs.name.startsWith('Mult')) return 'MULT';
    return 'INT';
  }

  private getExecutionLatency(instr: Instruction): number {
    if (instr.opcode === Opcode.MUL) return 3;
    if (instr.isLoad) return 2;
    return 1;
  }

  private executeOperation(rs: ReservationStation): number {
    const vj = rs.Vj || 0;
    const vk = rs.Vk || 0;
    const imm = rs.A || 0;

    switch (rs.op) {
      case Opcode.ADD: return vj + vk;
      case Opcode.SUB: return vj - vk;
      case Opcode.MUL: return vj * vk;
      case Opcode.AND: return vj & vk;
      case Opcode.OR: return vj | vk;
      case Opcode.XOR: return vj ^ vk;
      case Opcode.SLL: return vj << (vk & 0x1f);
      case Opcode.SRL: return vj >>> (vk & 0x1f);
      case Opcode.ADDI: return vj + imm;
      case Opcode.ANDI: return vj & imm;
      case Opcode.ORI: return vj | imm;
      case Opcode.LW:
      case Opcode.LH:
      case Opcode.LB:
        return this.state.memory.get(vj + imm) || 0;
      case Opcode.SW:
      case Opcode.SH:
      case Opcode.SB:
        return vk;
      case Opcode.JAL: return vj + 4;
      case Opcode.JALR: return (vj + imm) & ~1;
      default: return 0;
    }
  }

  private isComplete(): boolean {
    if (this.state.committedInstructions.length >= this.instructions.filter(i => !i.isNop).length) {
      return true;
    }
    if (this.state.programCounter >= this.instructions.length * 4 &&
        this.state.reorderBuffer.length === 0) {
      return true;
    }
    return false;
  }

  private saveState(): void {
    this.states.push({
      ...this.state,
      reservationStations: this.state.reservationStations.map(rs => ({ ...rs })),
      functionalUnits: this.state.functionalUnits.map(fu => ({ ...fu })),
      reorderBuffer: this.state.reorderBuffer.map(rob => ({ ...rob })),
      registers: [...this.state.registers],
      registerReorder: [...this.state.registerReorder],
      memory: new Map(this.state.memory),
      issuedInstructions: [...this.state.issuedInstructions],
      committedInstructions: [...this.state.committedInstructions],
      cdbBroadcasts: [...this.state.cdbBroadcasts],
      lastCDBBroadcast: this.state.lastCDBBroadcast ? { ...this.state.lastCDBBroadcast } : null
    });
  }
}
