export interface CaptureEvent {
  seq: number;
  at: string;
  monoMs: number;
  type: string;
  level: 'info' | 'warn' | 'error';
  data: Record<string, any>;
}
export interface CapturePackage {
  schemaVersion: 1;
  app: { version: string; buildId: string };
  capture: {
    id: string;
    sessionId: string;
    mode: 'enhanced';
    start: string;
    end: string;
    complete: boolean;
    eligibility: 'replayable' | 'ineligible';
    reasons: string[];
    droppedEvents: number;
    limits: { durationMs: number; events: number; bytes: number };
  };
  environment: Record<string, unknown>;
  checkpoint: {
    operationCounter?: number;
    wallTime: number;
    session: Record<string, any>;
    torrents: Record<string, any>[];
    ui: Record<string, any>;
    generation: number;
    lastSessionAge: number;
    lastSnapshotAge: number;
    identities: [number, number][];
    selectedId: number | null;
    detail?: Record<string, any>;
    stale: boolean;
    refreshDueMs?: number;
  };
  events: CaptureEvent[];
  observed: Record<string, any>;
  privacy: { version: number; transforms: string[]; losses: string[] };
  integrity?: { algorithm: 'SHA-256'; digest: string };
}
