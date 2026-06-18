import { Instruction, Opcode } from './instruction.model';

export interface ReservationStation {
  name: string;
  busy: boolean;
  op: Opcode | null;
  Vj: number | null;
  Vk: number | null;
  Qj: string | null;
  Qk: string | null;
  A: number | null;
  instructionId: string | null;
  executionRemaining: number;
  resultReady: boolean;
  result: number | null;
}

export interface FunctionalUnit {
  name: string;
  type: 'INT' | 'MULT' | 'LOAD' | 'STORE' | 'BRANCH';
  busy: boolean;
  currentInstructionId: string | null;
  cyclesRemaining: number;
  latency: number;
}

export interface ROBEntry {
  id: string;
  instructionId: string;
  instruction: Instruction;
  state: 'ISSUE' | 'EXECUTE' | 'WRITE_RESULT' | 'COMMIT';
  destination: number | null;
  value: number | null;
  ready: boolean;
  exception: boolean;
}

export interface CDBBroadcast {
  source: string;
  value: number;
  destination: number | null;
  cycle: number;
  instructionId: string;
}

export interface TomasuloState {
  cycle: number;
  programCounter: number;
  reservationStations: ReservationStation[];
  functionalUnits: FunctionalUnit[];
  reorderBuffer: ROBEntry[];
  registers: number[];
  registerReorder: (string | null)[];
  memory: Map<number, number>;
  issuedInstructions: string[];
  committedInstructions: string[];
  cdbBroadcasts: CDBBroadcast[];
  lastCDBBroadcast: CDBBroadcast | null;
}

export interface TomasuloTimeline {
  states: TomasuloState[];
  totalCycles: number;
}
