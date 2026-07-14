/* ============================================================================
   Tiny Web Audio helper. Synthesizes sounds on the fly (no bundled audio
   assets, works offline). Currently: a short bell rung when an analyst marks
   a task complete.
   ========================================================================== */

type ACtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  const AC: ACtor | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext || (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Ring a short, pleasant bell. Safe to call from a click handler (user gesture). */
export function playBell(): void {
  try {
    const ac = audioCtx();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();
    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    // Fundamental plus a couple of higher partials, each decaying exponentially
    // — reads as a bell/chime rather than a flat beep.
    const partials = [
      { f: 880, g: 0.5 },
      { f: 1320, g: 0.24 },
      { f: 1760, g: 0.14 },
    ];
    for (const { f, g } of partials) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(g, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 1.25);
    }
  } catch {
    /* audio is a nicety — never let it break the action */
  }
}
