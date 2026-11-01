#!/usr/bin/env python3
"""Джингл подкаста «Карьерный юрист», версия 5: серьёзно, собранно, не медленно.

Для сферы карьеры и юриспруденции: уверенно, по-взрослому, с весом. Не детская заставка.

Палитра: рубленые виолончели (спиккато) в низком регистре как «двигатель» ритма, глубокий
барабан (литавры/тайко), тёплые струнные, медные в аккордах (приглушённо), фортепиано только в
среднем и низком регистре. Без звонких верхов, без хлопков и хэтов.
Гармония: ре минор, шаги си-бемоль – до и светлое разрешение в ре мажор (серьёзно, но с надеждой).
Темп 120 уд/мин.

Открытие (5,5 с): быстрая «лестница» вверх из четырёх нот (логотип КЮ) и нарастание, удар на
«раз», ре минор, подъём си-бемоль – до и мелодия ре – ми – фа-диез, яркий ре мажор на финале.
Закрытие (5,6 с): те же шаги вниз, финальный ре мажор и три ноты «лестницы» вниз на затухании.

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
    """Частота ноты по названию, например 'F#4' (бемоль пишем диезом: Bb = A#)."""
    m = re.match(r"([A-G]#?)(\d)", name)
    midi = _NOTE[m.group(1)] + 12 * (int(m.group(2)) + 1)
    return 440.0 * 2 ** ((midi - 69) / 12)


# Гармонии: нота ритмичного «двигателя», ноты подложки, ноты фортепианных акцентов
CHORDS = {
    "Dm": dict(root="D3", pad=["D3", "A3", "D4", "F4"], stab=["A3", "D4", "F4"]),
    "Bb": dict(root="A#2", pad=["A#2", "F3", "A#3", "D4"], stab=["F3", "A#3", "D4"]),
    "C": dict(root="C3", pad=["C3", "G3", "C4", "E4"], stab=["G3", "C4", "E4"]),
    "A": dict(root="A2", pad=["A2", "E3", "A3", "C#4"], stab=["E3", "A3", "C#4"]),
    "D": dict(root="D3", pad=["D3", "A3", "D4", "F#4"], stab=["A3", "D4", "F#4"]),
}
ENGINE_ACCENT = [1.0, 0.55, 0.75, 0.55, 0.9, 0.55, 0.75, 0.55]


def rc(x):
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def pan_gain(sig, pan):
    out = sig.copy()
    out[:, 0] *= np.sqrt((1 - pan) / 2) * np.sqrt(2)
    out[:, 1] *= np.sqrt((1 + pan) / 2) * np.sqrt(2)
    return out


# ---------------------------------------------------------------- инструменты

def spic(freq, dur, amp, pan=0.0):
    """Рубленые виолончели (спиккато): короткая нота, верхние гармоники гаснут быстрее нижних."""
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros((len(t), 2))
    for cents, p in ((-5, -0.3), (5, 0.3)):
        f = freq * 2 ** (cents / 1200)
        y = np.zeros(len(t))
        for k in range(1, 11):
            if f * k > 6000:
                break
            y += k ** -1.1 * np.sin(2 * np.pi * f * k * t + 0.9 * k) * np.exp(-t * (7 + 1.8 * k))
        out[:, 0] += y * np.sqrt((1 - p) / 2)
        out[:, 1] += y * np.sqrt((1 + p) / 2)
    env = rc(t / 0.010) * rc((dur - t) / 0.04)
    return pan_gain(amp * env[:, None] * out / 2.2, pan)


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


def brass(freq, dur, amp, attack=0.05, release=0.35):
    """Приглушённые медные: верхние гармоники «раскрываются» чуть позже основного тона."""
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros((len(t), 2))
    for cents, p in ((-3, -0.25), (3, 0.25)):
        f = freq * 2 ** (cents / 1200)
        y = np.zeros(len(t))
        for k in range(1, 13):
            if f * k > 4500:
                break
            y += k ** -1.0 * np.sin(2 * np.pi * f * k * t + 0.5 * k) * (0.45 + 0.55 * rc((t - 0.012 * k) / (0.05 + 0.015 * k)))
        out[:, 0] += y * np.sqrt((1 - p) / 2)
        out[:, 1] += y * np.sqrt((1 + p) / 2)
    env = rc(t / attack) * rc((dur - t) / release) * (0.75 + 0.25 * np.exp(-t * 3))
    return amp * env[:, None] * out / 3.0


def piano(freq, dur, amp, attack=0.03, release=0.5, pan=0.0):
    """Мягкое «фортепиано с войлоком»: тёплый тон, естественное затухание, без звонкой атаки."""
    t = np.arange(int(SR * dur)) / SR
    partials = [(1, 1.00, 0.7), (2, 0.28, 1.6), (3, 0.09, 2.8), (4, 0.03, 4.2)]
    out = np.zeros((len(t), 2))
    for cents, p in ((-3, -0.25), (3, 0.25)):
        f = freq * 2 ** (cents / 1200)
        y = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * s) for m, a, s in partials)
        out[:, 0] += y * np.sqrt((1 - p) / 2)
        out[:, 1] += y * np.sqrt((1 + p) / 2)
    env = rc(t / attack) * rc((dur - t) / release)
    return pan_gain(amp * env[:, None] * out / 2, pan)


def band_noise(n_samples, lo, hi):
    x = RNG.standard_normal(n_samples)
    f = np.fft.rfftfreq(n_samples, 1 / SR)
    mask = np.clip((f - lo) / (0.2 * lo + 1), 0, 1) * np.clip((hi - f) / (0.2 * hi + 1), 0, 1)
    y = np.fft.irfft(np.fft.rfft(x) * mask, n_samples)
    return y / (y.std() + 1e-9)


def taiko(amp):
    """Глубокий барабан: короткий удар с падением высоты и тёмным «стуком»."""
    t = np.arange(int(SR * 0.7)) / SR
    f = 48 + 70 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    thump = band_noise(len(t), 200, 900) * np.exp(-t * 40) * 0.25
    return (amp * (body + thump) * rc(t / 0.003))[:, None] * np.ones((1, 2))


def snap(amp):
    """Сухой короткий щелчок на слабые доли, очень тихий."""
    t = np.arange(int(SR * 0.05)) / SR
    y = band_noise(len(t), 1800, 6000) * np.exp(-t * 90)
    return (amp * y / 2.0)[:, None] * np.ones((1, 2))


def pad(freq, dur, amp, attack, release):
    t = np.arange(int(SR * dur)) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * 2 * freq * t) + 0.2 * np.sin(2 * np.pi * 3 * freq * t)
    env = rc(t / attack) * rc((dur - t) / release)
    return (amp * env * y)[:, None] * np.ones((1, 2))


# ---------------------------------------------------------------- секвенсор

def new_bufs(n_samples):
    return {k: np.zeros((n_samples, 2)) for k in ("lead", "drums", "bass", "pad")}


def place(buf, sig, start, jitter=0.0):
    s = max(0.0, start + (RNG.uniform(-jitter, jitter) if jitter else 0.0))
    i = int(s * SR)
    k = min(len(sig), buf.shape[0] - i)
    if k > 0:
        buf[i:i + k] += sig[:k]


def groove(B, t, beats, beat, chord, dg=1.0, ag=1.0):
    """Фрагмент ритма на beats долей: рубленые виолончели восьмыми, барабан, тихие щелчки,
    синкопированные акценты фортепиано и подложка струнных."""
    eighth = beat / 2
    c = CHORDS[chord]
    for j in range(int(beats * 2)):
        place(B["bass"], spic(n(c["root"]), eighth * 0.85, 0.40 * ag * ENGINE_ACCENT[j % 8]), t + j * eighth, jitter=0.004)
    place(B["drums"], taiko(0.30 * dg), t)
    if beats >= 4:
        place(B["drums"], taiko(0.16 * dg), t + 2 * beat)
    for b in (1, 3):
        if b < beats:
            place(B["drums"], snap(0.10 * dg), t + b * beat)
    for j in ([0, 3, 6] if beats >= 4 else [0, 3]):
        for name in c["stab"]:
            place(B["lead"], piano(n(name), beat * 1.2, 0.10 * ag, attack=0.02), t + j * eighth, jitter=0.004)
    for name in c["pad"]:
        place(B["pad"], cello(n(name), beats * beat + 0.3, 0.05, attack=0.15, release=0.4), t)


def rise(B, t_end, beat):
    """Нарастание перед ударом: «лестница» из четырёх нот рублеными виолончелями, дробь барабана, подъём струнных."""
    step = beat / 4
    for i, name in enumerate(["D3", "F3", "A3", "D4"]):
        place(B["bass"], spic(n(name), 0.16, 0.20 + 0.05 * i), t_end - (4 - i) * step)
    for dt, a in [(beat, 0.09), (beat / 2, 0.13), (beat / 4, 0.19)]:
        place(B["drums"], taiko(a), t_end - dt)
    for name in ["D3", "A3", "D4"]:
        place(B["pad"], cello(n(name), beat + 0.3, 0.06, attack=beat * 0.9, release=0.1), t_end - beat)


def hit(B, t, rem, major=True, soft=False):
    """Удар на «раз» (ре минор) или финальный аккорд (ре мажор): барабан, медные, струнные, низкое фортепиано."""
    k = 0.75 if soft else 1.0
    third = "F#4" if major else "F4"
    place(B["drums"], taiko((0.42 if major else 0.40) * k), t)
    for name in ["D3", "A3", "D4", third]:
        place(B["pad"], brass(n(name), min(rem, 1.3), 0.11 * k), t)
    for name in ["D3", "A3", "D4", third]:
        place(B["pad"], cello(n(name), rem, 0.06 * k, attack=0.08, release=min(1.8, rem - 0.05)), t)
    for name, a in [("D2", 0.16), ("D3", 0.16)]:
        place(B["bass"], piano(n(name), rem, a * k, release=min(1.8, rem - 0.05)), t)


# ---------------------------------------------------------------- постобработка

def reverb(x, wet=0.12, length=0.9, decay=4.5, seed=11):
    """Лёгкая «комнатная» реверберация, чтобы звук не был сухим. Не эхо."""
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
    t0 = BEAT                                         # «раз» на 0,5 с
    rise(B, t0, BEAT)
    hit(B, t0, 4 * BEAT, major=False)                 # удар: ре минор
    groove(B, t0, 4, BEAT, "Dm")
    groove(B, t0 + 4 * BEAT, 2, BEAT, "Bb")           # си-бемоль
    groove(B, t0 + 6 * BEAT, 2, BEAT, "C")            # до
    for name, k, d, a in [("F4", 2, 0.45, 0.26), ("A4", 3, 0.45, 0.26), ("D5", 4, 0.95, 0.28), ("E5", 6, 0.95, 0.28)]:
        place(B["lead"], piano(n(name), d, a, attack=0.02, release=0.3, pan=0.1), t0 + k * BEAT, jitter=0.004)
    t_end = t0 + 8 * BEAT                             # финал 4,5 с: ре мажор
    hit(B, t_end, dur - t_end, major=True)
    place(B["lead"], piano(n("F#5"), dur - t_end, 0.20, attack=0.02, release=1.0), t_end)
    return finish(reverb(mixdown(B, "open")), fade_out=fade_out)


def make_close(dur=5.6, fade_out=1.8):
    B = new_bufs(int(SR * dur))
    groove(B, 0.0, 2, BEAT, "Bb", dg=0.9)
    groove(B, 2 * BEAT, 2, BEAT, "C", dg=0.9)
    for name, k, a in [("D5", 0, 0.26), ("C5", 2, 0.26)]:
        place(B["lead"], piano(n(name), 0.95, a, attack=0.02, release=0.3, pan=-0.1), k * BEAT, jitter=0.004)
    t_end = 4 * BEAT                                  # финал 2,0 с: ре мажор
    hit(B, t_end, dur - t_end, major=True, soft=True)
    for name, d, a in [("A4", 0.5, 0.21), ("F#4", 1.0, 0.19), ("D4", 1.5, 0.19)]:
        place(B["lead"], piano(n(name), 1.6, a, attack=0.03, release=1.0, pan=-0.1), t_end + d)
    return finish(reverb(mixdown(B, "close"), wet=0.14, length=1.0), fade_out=fade_out)


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
