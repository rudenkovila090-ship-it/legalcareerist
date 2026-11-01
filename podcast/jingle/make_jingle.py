#!/usr/bin/env python3
"""Джингл подкаста «Карьерный юрист», версия 4: энергично и позитивно, но по-взрослому.

Характер: уверенный, светлый, с движением вперёд. Не детский (нет колокольчиков и «мультяшных»
стаккато), не тревожный (нет сигналов и свиста), не холодный (тёплые струнные и бас).

Звук: яркий синтезаторный «щипок» (арпеджио и мелодия), басовая линия, тихая ритм-секция
(кик, хлопок, хэт), тёплая подложка и виолончель. Темп 120 уд/мин.

Открытие (5,5 с): быстрая «лестница» из четырёх нот (логотип КЮ) вверх, удар на «раз», такт в
ре мажоре, такт в соль мажоре с восходящей мелодией, и финальный яркий аккорд ре мажор.
Закрытие (5,6 с): мелодия вниз по тому же мотиву, группа ритма, затем разрешение в ре мажор и
плавное затухание.

Громкость выравнивается автоматически до -20 LUFS.

Запуск:  python3 make_jingle.py [папка_вывода]
Результат: jingle_open.wav/.mp3, jingle_close.wav/.mp3 (44.1 кГц, стерео).
"""
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
TARGET_LUFS = -20.0
MAX_PEAK_DB = -3.0
RNG = np.random.default_rng(7)  # фиксированная «человечность»: результат повторяется
BPM = 120
BEAT = 60 / BPM
STEMS = {}

_NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def n(name):
    """Частота ноты по названию, например 'F#4'."""
    m = re.match(r"([A-G]#?)(\d)", name)
    midi = _NOTE[m.group(1)] + 12 * (int(m.group(2)) + 1)
    return 440.0 * 2 ** ((midi - 69) / 12)


# Гармонии в ре мажоре: бас, ноты арпеджио (снизу вверх), ноты подложки, нота виолончели
CHORDS = {
    "D": dict(bass="D2", arp=["D4", "F#4", "A4", "E5"], pad=["D3", "A3", "F#4"], cello="D3"),
    "A": dict(bass="A2", arp=["E4", "A4", "C#5", "E5"], pad=["A3", "C#4", "E4"], cello="A3"),
    "Bm": dict(bass="B2", arp=["D4", "F#4", "B4", "D5"], pad=["B3", "D4", "F#4"], cello="B3"),
    "G": dict(bass="G2", arp=["D4", "G4", "B4", "D5"], pad=["B3", "D4", "G4"], cello="G3"),
}
ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3]


def rc(x):
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def pan_gain(sig, pan):
    out = sig.copy()
    out[:, 0] *= np.sqrt((1 - pan) / 2) * np.sqrt(2)
    out[:, 1] *= np.sqrt((1 + pan) / 2) * np.sqrt(2)
    return out


# ---------------------------------------------------------------- инструменты

def pluck(freq, dur, amp, pan=0.0):
    """Яркий синтезаторный «щипок»: верхние гармоники гаснут быстрее нижних, как у фильтра."""
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros((len(t), 2))
    for cents, p in ((-4, -0.3), (4, 0.3)):
        f = freq * 2 ** (cents / 1200)
        y = np.zeros(len(t))
        for k in range(1, 9):
            if f * k > 9000:
                break
            y += (1.0 / k) * np.sin(2 * np.pi * f * k * t + 0.7 * k) * np.exp(-t * (2.2 + 1.4 * k))
        out[:, 0] += y * np.sqrt((1 - p) / 2)
        out[:, 1] += y * np.sqrt((1 + p) / 2)
    env = rc(t / 0.008) * rc((dur - t) / 0.06)
    return pan_gain(amp * env[:, None] * out / 2.0, pan)


def bass(freq, dur, amp):
    t = np.arange(int(SR * dur)) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(2 * np.pi * 2 * freq * t) + 0.2 * np.sin(2 * np.pi * 3 * freq * t)
    env = rc(t / 0.012) * np.exp(-t * 3.5) * rc((dur - t) / 0.05)
    return (amp * env * y)[:, None] * np.ones((1, 2))


def kick(amp):
    t = np.arange(int(SR * 0.38)) / SR
    f = 48 + 110 * np.exp(-t * 38)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) * rc(t / 0.002)
    return (amp * y)[:, None] * np.ones((1, 2))


def band_noise(n_samples, lo, hi):
    x = RNG.standard_normal(n_samples)
    f = np.fft.rfftfreq(n_samples, 1 / SR)
    mask = np.clip((f - lo) / (0.2 * lo + 1), 0, 1) * np.clip((hi - f) / (0.2 * hi + 1), 0, 1)
    y = np.fft.irfft(np.fft.rfft(x) * mask, n_samples)
    return y / (y.std() + 1e-9)


def clap(amp):
    n_samples = int(SR * 0.18)
    t = np.arange(n_samples) / SR
    env = sum(np.where(t >= b, np.exp(-(t - b) * 220), 0.0) for b in (0.0, 0.011, 0.022)) + 0.6 * np.exp(-t * 32)
    y = band_noise(n_samples, 900, 3800) * env * rc(t / 0.001)
    return (amp * y / 2.0)[:, None] * np.ones((1, 2))


def hat(amp):
    n_samples = int(SR * 0.06)
    t = np.arange(n_samples) / SR
    y = band_noise(n_samples, 6500, 18000) * np.exp(-t * 110)
    return (amp * y / 2.0)[:, None] * np.ones((1, 2))


def pad(freq, dur, amp, attack, release):
    t = np.arange(int(SR * dur)) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * 2 * freq * t) + 0.2 * np.sin(2 * np.pi * 3 * freq * t)
    env = rc(t / attack) * rc((dur - t) / release)
    return (amp * env * y)[:, None] * np.ones((1, 2))


def cello(freq, dur, amp, attack=0.2, release=0.8):
    """Тёплые струнные: обертона, лёгкое вибрато, два слегка расстроенных голоса."""
    t = np.arange(int(SR * dur)) / SR
    vib = 1 + 0.004 * rc((t - 0.3) / 0.6) * np.sin(2 * np.pi * 5.2 * t)
    out = np.zeros((len(t), 2))
    for cents, p in ((-6, -0.35), (6, 0.35)):
        phase = 2 * np.pi * np.cumsum(freq * 2 ** (cents / 1200) * vib) / SR
        y = sum(k ** -1.2 * np.sin(k * phase) for k in range(1, 8)) / 1.9
        out[:, 0] += y * np.sqrt((1 - p) / 2)
        out[:, 1] += y * np.sqrt((1 + p) / 2)
    env = rc(t / attack) * rc((dur - t) / release)
    return 1.8 * amp * env[:, None] * out / 2


# ---------------------------------------------------------------- секвенсор

def new_bufs(n_samples):
    return {k: np.zeros((n_samples, 2)) for k in ("lead", "drums", "bass", "pad")}


def place(buf, sig, start, jitter=0.0):
    s = max(0.0, start + (RNG.uniform(-jitter, jitter) if jitter else 0.0))
    i = int(s * SR)
    k = min(len(sig), buf.shape[0] - i)
    if k > 0:
        buf[i:i + k] += sig[:k]


def groove_bar(B, t, bar, chord, drum_gain=1.0, arp_gain=1.0):
    """Один такт ритмичной группы: кик, хлопок, хэт, бас, арпеджио «щипком», подложка и виолончель."""
    beat = bar / 4
    eighth = beat / 2
    c = CHORDS[chord]
    for b in (0, 2):
        place(B["drums"], kick(0.55 * drum_gain), t + b * beat)
    for b in (1, 3):
        place(B["drums"], clap(0.20 * drum_gain), t + b * beat)
    for j in range(8):
        place(B["drums"], hat((0.10 if j % 2 else 0.07) * drum_gain), t + j * eighth)
    for j, octave in [(0, 1), (2, 1), (3, 2), (4, 1), (6, 1), (7, 2)]:
        place(B["bass"], bass(n(c["bass"]) * octave, eighth * 0.9, 0.24), t + j * eighth)
    arp = [n(x) for x in c["arp"]]
    for j, idx in enumerate(ARP_PATTERN):
        amp = 0.20 * arp_gain * (1.0 if j % 2 == 0 else 0.75)
        place(B["lead"], pluck(arp[idx], eighth * 1.6, amp, pan=0.3 * np.sin(np.pi * j / 4)), t + j * eighth, jitter=0.006)
    for x in c["pad"]:
        place(B["pad"], pad(n(x), bar + 0.3, 0.045, attack=0.08, release=0.4), t)
    place(B["pad"], cello(n(c["cello"]), bar + 0.3, 0.07, attack=0.1, release=0.4), t)


def stairs(B, t_end, notes, step, amps, up=True):
    """Быстрая «лестница» перед ударом: ноты шагами в step секунд, последняя заканчивается на t_end."""
    for i, (name, a) in enumerate(zip(notes, amps)):
        place(B["lead"], pluck(n(name), 0.5, a, pan=(-0.25 + 0.5 * i / (len(notes) - 1)) * (1 if up else -1)),
              t_end - (len(notes) - i) * step)


def stab(B, t, rem, with_drums=True):
    """Яркий финальный аккорд ре мажор: щипки, бас, кик, длинная подложка и виолончель."""
    for name, a in [("D4", 0.20), ("F#4", 0.18), ("A4", 0.18), ("E5", 0.14), ("D5", 0.14)]:
        place(B["lead"], pluck(n(name), min(rem, 1.4), a), t, jitter=0.004)
    place(B["bass"], bass(n("D2"), min(rem, 0.8), 0.34), t)
    if with_drums:
        place(B["drums"], kick(0.6), t)
    for name, a in [("D3", 0.055), ("A3", 0.045), ("F#4", 0.035)]:
        place(B["pad"], pad(n(name), rem, a, attack=0.05, release=min(1.8, rem - 0.05)), t)
    place(B["pad"], cello(n("D3"), rem, 0.09, attack=0.1, release=min(1.8, rem - 0.05)), t)


# ---------------------------------------------------------------- постобработка

def reverb(x, wet=0.10, length=0.7, decay=5.0, seed=11):
    """Очень лёгкая «комнатная» реверберация, чтобы звук не был сухим. Не эхо."""
    rng = np.random.default_rng(seed)
    k = int(SR * length)
    t = np.arange(k) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(k) * np.exp(-t * decay)
        ir[0] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        size = len(x) + k
        out[:, ch] = np.fft.irfft(np.fft.rfft(x[:, ch], size) * np.fft.rfft(ir, size), size)[: len(x)]
    return (1 - wet) * x + wet * out


def finish(x, fade_in=0.01, fade_out=1.0):
    k = len(x)
    fi, fo = int(SR * fade_in), int(SR * fade_out)
    env = np.ones(k)
    env[:fi] = rc(np.linspace(0, 1, fi))
    env[k - fo:] = 1 - rc(np.linspace(0, 1, fo))
    return x * env[:, None]


def rms_db(x):
    return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)


def mixdown(B, name):
    STEMS[name] = {k: round(float(rms_db(v)), 1) for k, v in B.items()}
    return sum(B.values())


# ---------------------------------------------------------------- джинглы

def make_open(dur=5.5, fade_out=1.0):
    B = new_bufs(int(SR * dur))
    bar, t0 = 4 * BEAT, BEAT                      # такт 2,0 с, «раз» на 0,5 с
    place(B["pad"], pad(n("D3"), t0 + 0.3, 0.04, attack=0.4, release=0.1), 0.0)
    stairs(B, t0, ["D4", "F#4", "A4", "D5"], BEAT / 4, [0.22, 0.24, 0.26, 0.28])
    stab(B, t0, bar - 0.1)                         # удар на «раз»
    groove_bar(B, t0, bar, "D")
    t1 = t0 + bar                                  # такт соль мажор с восходящей мелодией
    groove_bar(B, t1, bar, "G")
    for name, k, a in [("D5", 0, 0.24), ("F#5", 1, 0.24), ("E5", 2, 0.24), ("A5", 3, 0.26)]:
        place(B["lead"], pluck(n(name), BEAT * 0.95, a, pan=0.15), t1 + k * BEAT, jitter=0.004)
    stab(B, t1 + bar, dur - (t1 + bar), with_drums=True)   # яркий финальный аккорд
    return finish(reverb(mixdown(B, "open")), fade_out=fade_out)


def make_close(dur=5.6, fade_out=1.8):
    B = new_bufs(int(SR * dur))
    bar = 4 * BEAT
    place(B["pad"], pad(n("G3"), 0.6, 0.05, attack=0.05, release=0.3), 0.0)
    groove_bar(B, 0.0, bar, "G", drum_gain=0.9)
    for name, k, a in [("A5", 0, 0.22), ("F#5", 1, 0.22), ("E5", 2, 0.22), ("D5", 3, 0.24)]:
        place(B["lead"], pluck(n(name), BEAT * 0.95, a, pan=-0.15), k * BEAT, jitter=0.004)
    stab(B, bar, dur - bar)                        # разрешение в ре мажор
    # мягкое «растекание» аккорда после удара
    for name, d, a in [("D4", 0.0, 0.10), ("F#4", 0.12, 0.09), ("A4", 0.24, 0.09), ("D5", 0.36, 0.10)]:
        place(B["lead"], pluck(n(name), 1.2, a, pan=-0.1), bar + 0.5 + d)
    return finish(reverb(mixdown(B, "close"), wet=0.13, length=0.9), fade_out=fade_out)


# ---------------------------------------------------------------- файлы

def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def measure(path):
    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    s = r.stderr.split("Summary:")[-1]
    return (float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1)),
            float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", s).group(1)))


def save(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / f"{name}.wav"
    write_wav(wav, x / np.max(np.abs(x)) * 0.5)
    lufs, _ = measure(wav)
    y = x / np.max(np.abs(x)) * 0.5 * 10 ** ((TARGET_LUFS - lufs) / 20)
    peak_db = 20 * np.log10(np.max(np.abs(y)))
    if peak_db > MAX_PEAK_DB:
        y *= 10 ** ((MAX_PEAK_DB - peak_db) / 20)
    write_wav(wav, y)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame",
                    "-b:a", "192k", str(OUT / f"{name}.mp3")], check=True)
    i, tp = measure(wav)
    print(f"{name}: {len(y) / SR:.2f} с, {i:.1f} LUFS, истинный пик {tp:.1f} дБ")


if __name__ == "__main__":
    save("jingle_open", make_open())
    save("jingle_close", make_close())
    print("баланс дорожек (RMS, дБ):", STEMS)
