#!/usr/bin/env python3
"""
Generate AIM's original task-completion stinger — a short, playful
corporate-awards "ta-da!" (brass stab + soft crowd cheer + sparkle + light
room reflections). Fully original/synthesized; no sampled or copyrighted audio.

Output: web/src/assets/completion-dundie.wav  (44.1 kHz, 16-bit PCM, mono)

Pure standard library (math, random, wave, array) — no third-party deps.
Deterministic (fixed random seed) so re-running reproduces the same file.
"""
import math
import os
import random
import wave
from array import array

SR = 44100
random.seed(1989)  # deterministic; year the Dundies would approve of

buf = [0.0] * int(SR * 1.6)  # scratch length; trimmed at the end


def add(t0, samples):
    i0 = int(t0 * SR)
    for i, s in enumerate(samples):
        j = i0 + i
        if 0 <= j < len(buf):
            buf[j] += s


def adsr(n, a, d, s_level, r):
    """Sample-count envelope with linear attack/decay/release. Crisp (short r)."""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    env = [0.0] * n
    for i in range(n):
        if i < a:
            env[i] = i / max(1, a)
        elif i < a + d:
            env[i] = 1.0 - (1.0 - s_level) * (i - a) / max(1, d)
        elif i < n - r:
            env[i] = s_level
        else:
            env[i] = s_level * max(0.0, (n - i) / max(1, r))
    return env


def brass(freq, dur, amp, a=0.006, d=0.06, s=0.82, r=0.05, harmonics=9, detune=0.004):
    """Bright brass-ish tone: stacked harmonics + a slightly detuned layer."""
    n = int(dur * SR)
    env = adsr(n, a, d, s, r)
    norm = sum(1.0 / k for k in range(1, harmonics + 1))
    out = [0.0] * n
    for layer, det in ((1.0, 1.0), (0.5, 1.0 + detune)):
        f = freq * det
        for i in range(n):
            t = i / SR
            acc = 0.0
            for k in range(1, harmonics + 1):
                acc += (1.0 / k) * math.sin(2 * math.pi * f * k * t)
            out[i] += layer * (acc / norm)
    return [amp * env[i] * out[i] for i in range(n)]


def chord(freqs, t0, dur, amp, **kw):
    per = amp / len(freqs)
    for f in freqs:
        add(t0, brass(f, dur, per, **kw))


def bell(freq, t0, dur, amp, tau=0.10):
    """Sparkle: sine + octave with exponential decay."""
    n = int(dur * SR)
    s = []
    for i in range(n):
        t = i / SR
        e = math.exp(-t / tau)
        s.append(amp * e * (math.sin(2 * math.pi * freq * t) + 0.4 * math.sin(2 * math.pi * freq * 2 * t)))
    add(t0, s)


def cheer(t0, dur, amp):
    """Soft, short crowd 'cheer' — swelling band-limited noise (one-pole LP + HP)."""
    n = int(dur * SR)
    env = adsr(n, 0.09, 0.10, 0.7, 0.22)
    lp = 0.0
    prev = 0.0
    hp = 0.0
    out = []
    for i in range(n):
        white = random.uniform(-1, 1)
        lp = lp + 0.18 * (white - lp)          # low-pass -> softer
        hp = 0.92 * (hp + lp - prev)           # gentle high-pass -> less rumble
        prev = lp
        out.append(amp * env[i] * hp)
    add(t0, out)


# ── Arrangement: quick pickup (V) → bright resolve (I add9), then sparkle ──────
NOTES = {
    'G3': 196.00, 'B3': 246.94, 'D4': 293.66,
    'C4': 261.63, 'E4': 329.63, 'G4': 392.00, 'C5': 523.25, 'D5': 587.33,
    'C6': 1046.50, 'E6': 1318.51, 'G6': 1567.98, 'C7': 2093.00,
}

# soft cheer underneath the whole thing
cheer(0.00, 1.05, 0.10)
# pickup "ta"
chord([NOTES['G3'], NOTES['B3'], NOTES['D4']], 0.00, 0.16, 0.30, d=0.04, s=0.6, r=0.04)
# resolve "daaa!" — C major add9, bright and celebratory
chord([NOTES['C4'], NOTES['E4'], NOTES['G4'], NOTES['C5'], NOTES['D5']], 0.17, 0.62, 0.42, d=0.10, s=0.7, r=0.09)
# sparkle glint arpeggio on the resolve
for k, note in enumerate(['C6', 'E6', 'G6', 'C7']):
    bell(NOTES[note], 0.19 + k * 0.045, 0.5, 0.11, tau=0.12)

# ── Light room reflections (early reflections only -> "room" without long tail) ─
dry = list(buf)
for delay_ms, gain in ((11, 0.26), (19, 0.19), (29, 0.13), (41, 0.09)):
    d = int(delay_ms / 1000 * SR)
    for i in range(len(dry) - d):
        if dry[i]:
            buf[i + d] += gain * dry[i]

# ── Normalize to -1 dBFS, trim silence, write 16-bit PCM ──────────────────────
peak = max(abs(x) for x in buf) or 1.0
target = 10 ** (-1.0 / 20)  # -1 dBFS
scale = target / peak
buf = [x * scale for x in buf]

thresh = 10 ** (-50 / 20)  # ~ -50 dBFS silence gate
start = next((i for i, x in enumerate(buf) if abs(x) > thresh), 0)
end = next((i for i in range(len(buf) - 1, -1, -1) if abs(buf[i]) > thresh), len(buf) - 1)
buf = buf[start:end + 1]
# short fade-out over the last 8 ms for a click-free crisp ending
fo = int(0.008 * SR)
for i in range(fo):
    buf[len(buf) - 1 - i] *= i / fo

pcm = array('h', (max(-32768, min(32767, int(x * 32767))) for x in buf))

here = os.path.dirname(os.path.abspath(__file__))
out_path = os.path.join(here, '..', 'web', 'src', 'assets', 'completion-dundie.wav')
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

dur = len(buf) / SR
print(f'wrote {out_path}  ({dur:.3f}s, {len(pcm) * 2} bytes)')
