import type { Page } from '@playwright/test';
export interface ReplayTiming {
  wallTime: number;
  duration: number;
  barriers: { at: number; seq: number; operationId?: number }[];
}
export function runReplay(page: Page, timing: ReplayTiming): Promise<any>;
