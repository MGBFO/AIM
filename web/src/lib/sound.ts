/* ============================================================================
   Task-completion sound. Plays AIM's original "awards-show" stinger
   (web/src/assets/completion-dundie.wav) when a task is marked Completed.
   Decoded once and cached for instant, low-latency playback; routed through a
   GainNode so it respects the user's volume. Honors the per-user Completion
   Sound on/off + Volume settings (stored in user prefs). Never triggered by
   page loads, failed saves, or other users' realtime updates — only by the
   explicit "Complete" action.
   ========================================================================== */
import completionUrl from '../assets/completion-dundie.wav';
import { getUserPref } from './userPrefs';

type ACtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let decoding: Promise<AudioBuffer | null> | null = null;

function audioCtx(): AudioContext | null {
  const AC: ACtor | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext || (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function getBuffer(ac: AudioContext): Promise<AudioBuffer | null> {
  if (buffer) return Promise.resolve(buffer);
  if (!decoding) {
    decoding = fetch(completionUrl)
      .then((r) => r.arrayBuffer())
      .then((a) => ac.decodeAudioData(a))
      .then((b) => { buffer = b; return b; })
      .catch(() => null);
  }
  return decoding;
}

/** Whether the completion sound is enabled (default on). */
export function soundEnabled(): boolean {
  return getUserPref<boolean>('sound.enabled') !== false;
}
/** Completion sound volume, 0..1 (default 0.7). */
export function soundVolume(): number {
  const v = getUserPref<number>('sound.volume');
  return typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0.7;
}

/** Decode ahead of time so the first completion is snappy. Safe to call early. */
export function primeCompletionSound(): void {
  const ac = audioCtx();
  if (ac) void getBuffer(ac);
}

/** Play the completion stinger. No-op if disabled or audio is unavailable. */
export function playCompletion(): void {
  if (!soundEnabled()) return;
  try {
    const ac = audioCtx();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();
    void getBuffer(ac).then((buf) => {
      if (!buf) return;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const gain = ac.createGain();
      gain.gain.value = soundVolume();
      src.connect(gain);
      gain.connect(ac.destination);
      src.start();
    });
  } catch {
    /* audio is a nicety — never let it break the action */
  }
}
