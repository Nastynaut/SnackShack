#!/usr/bin/env python3
"""Snack Shack sound effects: original, synthesized from scratch (no samples).

Deterministic: fixed RNG seed + bit-exact ffmpeg flags, so re-running yields the
same audio. Requires: Python 3, numpy, ffmpeg (with libmp3lame; libvorbis for --kit).

  python3 make_sounds.py                 -> assets/sounds/add.mp3, assets/sounds/checkout.mp3
  python3 make_sounds.py OUTDIR --kit    -> OUTDIR/sfx-{add-ding,checkout-cha-ching,remove-pop,tap}.{mp3,ogg}

All sounds peak-normalized to -3 dBFS (no clipping), mono 44.1 kHz.
License: created for the Snack Shack project; we own them (CC0-style, no attribution needed).
"""
import os, subprocess, sys, tempfile, wave
import numpy as np

SR = 44100
PEAK = 10 ** (-3 / 20)  # -3 dBFS
rng = np.random.RandomState(20261019)


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def bell(freq, dur, tau, partials=((1, 1.0), (2, 0.35), (3, 0.12), (4.2, 0.05)), attack=0.004):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for mult, amp in partials:
        # higher partials die away faster -> soft, rounded tone
        out += amp * np.sin(2 * np.pi * freq * mult * t) * np.exp(-t / (tau / mult ** 0.7))
    env = np.clip(t / attack, 0, 1)
    return out * env


def bandpass_noise(dur, lo, hi):
    n = int(SR * dur)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(spec, n)


def place(buf, sig, at):
    i = int(at * SR)
    buf[i:i + len(sig)] += sig[: len(buf) - i]
    return buf


def finish(x, fade_out=0.02):
    x = x - np.mean(x)
    n = int(fade_out * SR)
    x[-n:] *= np.linspace(1, 0, n)
    x[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return x / np.max(np.abs(x)) * PEAK


def sfx_add_ding():
    # gentle E6 bell with a soft B6 overtone
    x = bell(1318.51, 0.6, 0.20) + 0.25 * bell(1975.53, 0.6, 0.12, partials=((1, 1.0),))
    return finish(x)


def sfx_checkout_cha_ching():
    buf = np.zeros(int(SR * 1.1))
    # "cha": two short filtered-noise swishes (drawer / coins)
    for at, d in ((0.0, 0.06), (0.075, 0.05)):
        t = t_axis(d)
        place(buf, 0.35 * bandpass_noise(d, 2500, 8000) * np.exp(-t / 0.018), at)
    # "ching": bright major chord bell G6-C7-E7 with a slow shimmer
    t0 = 0.14
    chord = sum(a * bell(f, 0.95, 0.32) for f, a in ((1567.98, 1.0), (2093.0, 0.8), (2637.02, 0.6)))
    tt = t_axis(0.95)
    chord *= 1 + 0.08 * np.sin(2 * np.pi * 7 * tt)
    place(buf, 0.6 * chord, t0)
    # tiny coin sparkles
    for at, f in ((0.16, 4186.0), (0.22, 3520.0), (0.29, 4698.6), (0.36, 3951.1)):
        place(buf, 0.12 * bell(f, 0.12, 0.03, partials=((1, 1.0),)), at)
    return finish(buf)


def sfx_remove_pop():
    # soft downward "bloop" 560 -> 180 Hz
    d = 0.14
    t = t_axis(d)
    f = 180 + 380 * np.exp(-t / 0.03)
    phase = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(phase) * np.exp(-t / 0.04) * np.clip(t / 0.002, 0, 1)
    return finish(x, 0.01)


def sfx_tap():
    # short soft wooden-ish tick
    x = bell(880.0, 0.07, 0.014, partials=((1, 1.0), (2.01, 0.3), (3.7, 0.08)), attack=0.001)
    return finish(x, 0.005)


def write_wav(path, x):
    pcm = np.round(x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def encode(wav, out):
    codec = ["-c:a", "libmp3lame", "-b:a", "96k"] if out.endswith(".mp3") else ["-c:a", "libvorbis", "-q:a", "3"]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", str(SR), *codec,
                    "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", out], check=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    kit = "--kit" in sys.argv
    outdir = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "sounds")
    os.makedirs(outdir, exist_ok=True)
    if kit:
        jobs = {"sfx-add-ding": sfx_add_ding, "sfx-checkout-cha-ching": sfx_checkout_cha_ching,
                "sfx-remove-pop": sfx_remove_pop, "sfx-tap": sfx_tap}
        exts = (".mp3", ".ogg")
    else:
        jobs = {"add": sfx_add_ding, "checkout": sfx_checkout_cha_ching}
        exts = (".mp3",)
    with tempfile.TemporaryDirectory() as tmp:
        for name, fn in jobs.items():
            x = fn()
            assert np.max(np.abs(x)) < 1.0
            wav = os.path.join(tmp, name + ".wav")
            write_wav(wav, x)
            for ext in exts:
                dst = os.path.join(outdir, name + ext)
                encode(wav, dst)
                print(f"{dst}  {os.path.getsize(dst)} bytes  {len(x)/SR:.2f}s")


if __name__ == "__main__":
    main()
