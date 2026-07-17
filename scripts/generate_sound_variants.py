#!/usr/bin/env python3
"""
Two ALTERNATE task-completion stingers for A/B testing against the brass
"ta-da" (completion-dundie.wav). All original/synthesized, no sampled audio.

  variant 2 -> completion-arcade.wav      (bright "achievement unlocked" arpeggio)
  variant 3 -> completion-vibraphone.wav  (warm, mellow vibraphone flourish)

Output dir is taken from argv[1] (defaults to current dir). 44.1kHz/16-bit mono.
Pure standard library.
"""
import math
import os
import random
import sys
import wave
from array import array

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


def new_buf(dur=1.6):
    return [0.0] * int(SR * dur)


def add(buf, t0, samples):
    i0 = int(t0 * SR)
    for i, s in enumerate(samples):
        j = i0 + i
        if 0 <= j < len(buf):
            buf[j] += s


def pluck(freq, dur, amp, tau=0.18, attack=0.004, bright=0.5):
    """Synth pluck: fundamental + a bit of 2nd/3rd harmonic, exp decay."""
    n = int(dur * SR)
    out = []
    a = int(attack * SR)
    for i in range(n):
        t = i / SR
        e = math.exp(-t / tau)
        if i < a:
            e *= i / a
        v = math.sin(2 * math.pi * freq * t)
        v += bright * 0.5 * math.sin(2 * math.pi * freq * 2 * t)
        v += bright * 0.25 * math.sin(2 * math.pi * freq * 3 * t)
        out.append(amp * e * v)
    return out


def vibes(freq, dur, amp, tau=0.55, attack=0.008, trem=5.0):
    """Warm vibraphone-ish tone: sine + soft 4th harmonic, gentle tremolo."""
    n = int(dur * SR)
    a = int(attack * SR)
    out = []
    for i in range(n):
        t = i / SR
        e = math.exp(-t / tau)
        if i < a:
            e *= i / a
        tr = 1.0 + 0.12 * math.sin(2 * math.pi * trem * t)
        v = math.sin(2 * math.pi * freq * t) + 0.18 * math.sin(2 * math.pi * freq * 4 * t)
        out.append(amp * e * tr * v)
    return out


def reflections(buf, taps):
    dry = list(buf)
    for delay_ms, gain in taps:
        d = int(delay_ms / 1000 * SR)
        for i in range(len(dry) - d):
            if dry[i]:
                buf[i + d] += gain * dry[i]


def finalize(buf, path, fade_ms=8.0, gate_db=-50, peak_db=-1.0):
    peak = max(abs(x) for x in buf) or 1.0
    scale = (10 ** (peak_db / 20)) / peak
    buf = [x * scale for x in buf]
    thr = 10 ** (gate_db / 20)
    start = next((i for i, x in enumerate(buf) if abs(x) > thr), 0)
    end = next((i for i in range(len(buf) - 1, -1, -1) if abs(buf[i]) > thr), len(buf) - 1)
    buf = buf[start:end + 1]
    fo = int(fade_ms / 1000 * SR)
    for i in range(min(fo, len(buf))):
        buf[len(buf) - 1 - i] *= i / fo
    pcm = array('h', (max(-32768, min(32767, int(x * 32767))) for x in buf))
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'wrote {path}  ({len(buf)/SR:.3f}s, {len(pcm)*2} bytes)')


N = {
    'G4': 392.00, 'A4': 440.00, 'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'G5': 783.99,
    'A5': 880.00, 'B5': 987.77, 'C6': 1046.50, 'E6': 1318.51, 'G6': 1567.98, 'C7': 2093.00,
}

# ── Variant 2: bright "achievement unlocked" — fast rising plucks + final stab ─
random.seed(7)
b = new_buf()
seq = [('C5', 0.00), ('E5', 0.06), ('G5', 0.12), ('C6', 0.18)]
for note, t in seq:
    add(b, t, pluck(N[note], 0.5, 0.5, tau=0.16, bright=0.7))
# final bright two-note "win" flourish
add(b, 0.30, pluck(N['E6'], 0.6, 0.42, tau=0.28, bright=0.8))
add(b, 0.30, pluck(N['G6'], 0.6, 0.34, tau=0.28, bright=0.8))
add(b, 0.30, pluck(N['C7'], 0.6, 0.22, tau=0.30, bright=0.6))  # sparkle top
reflections(b, [(13, 0.20), (23, 0.13), (37, 0.08)])
finalize(b, os.path.join(OUT, 'completion-arcade.wav'))

# ── Variant 3: warm vibraphone flourish — mellow, subtle, good for repeats ─────
b = new_buf()
lick = [('G4', 0.00), ('C5', 0.07), ('E5', 0.14)]
for note, t in lick:
    add(b, t, vibes(N[note], 0.9, 0.45, tau=0.45))
# land on a warm Cadd9 chord
for note in ('C5', 'E5', 'G5', 'D5'):
    add(b, 0.22, vibes(N[note], 1.0, 0.24, tau=0.6))
# soft high shimmer
add(b, 0.24, vibes(N['C6'], 0.8, 0.12, tau=0.5))
add(b, 0.30, vibes(N['E6'], 0.8, 0.08, tau=0.5))
reflections(b, [(17, 0.22), (29, 0.15), (43, 0.09)])
finalize(b, os.path.join(OUT, 'completion-vibraphone.wav'))
