import { createContext, useContext } from 'react';
import type { AimState, Task } from '../lib/domain';

export interface AimApi {
  state: AimState;
  ready: boolean;
  /** Mutate state like the legacy app; changes are persisted + pushed to undo. */
  patch: (mutator: (s: AimState) => void) => void;
  addTask: (p: Partial<Task>, opts?: { import?: boolean }) => Task | null;
  updateTask: (id: string, changes: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  completeTask: (id: string) => void;
  /** Record a New Call (from a "New Calls" task's completion popup) and complete the task. */
  recordNewCall: (taskId: string, call: { date: string | null; name: string }) => void;
  /** Record a standalone New Call not tied to a task (Dashboard New Calls tray). */
  addNewCall: (call: { date: string | null; name: string; analysts: string[] }) => void;
  undo: () => void;
  redo: () => void;
}

export const AimContext = createContext<AimApi | null>(null);

export function useAim(): AimApi {
  const ctx = useContext(AimContext);
  if (!ctx) throw new Error('useAim must be used within <AimProvider>');
  return ctx;
}
