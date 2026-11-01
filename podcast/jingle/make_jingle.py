#!/usr/bin/env python3
"""Джингл подкаста «Карьерный юрист», версия 3: тёплый, человечный, с движением вперёд.

Эмоции (из документов бренда): поддержка («путь не в одиночку»), спокойная надёжность
(«старший товарищ»), движение вперёд («Путь юриста»), лёгкая свежесть без холода.

Звук: мягкое «фортепиано с войлоком» (мелодия-лестница из четырёх ступеней, как логотип КЮ),
тёплые струнные с лёгким вибрато (виолончель) и мягкая подложка. Без ветра, без эха, лишь
крошечная комнатная реверберация. Живость: небольшие неточности по времени и громкости.

Открытие: ре мажор → соль мажор (maj7). Лестница вверх, гармония уходит «вперёд» и остаётся
светлой и открытой. Приглашение.
Закрытие: соль мажор (maj7) → ре мажор. Лестница вниз, гармония возвращается «домой» и тает.

Громкость выравнивается автоматически до -20 LUFS.

Запуск:  python3 make_jingle.py [папка_вывода]
Результат: jingle_open.wav/.mp3, jingle_close.wav/.mp3 (5-6 секунд, 44.1 кГц, стерео).
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
RNG = np.random.default_rng(42)  # фиксированная «человечность»: результат повторяется

# Ноты (Гц)
D2, G2 = 73.42, 98.00
D3, G3, A3, B3 = 146.83, 196.00, 220.00, 246.94
D4, FS4, A4 = 293.66, 369.99, 440.00
D5, E5, FS5 = 587.33, 659.25, 739.99
B4 = 493.88
STEMS = {}


def rc(x):
    """Плавная кривая 0..1 (приподнятый косинус)."""
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def pan_gain(sig, pan):
    out = sig.copy()
    out[:, 0] *= np.sqrt((1 - pan) / 2) * np.sqrt(2)
    out[:, 1] *= np.sqrt((1 + pan) / 2) * np.sqrt(2)
    return out


def piano(freq, dur, amp, attack=0.06, release=0.5, pan=0.0):
    """Мягкое «фортепиано с войлоком»: тёплый тон, естественное затухание, без звонкой атаки."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    partials = [(1, 1.00, 0.7), (2, 0.28, 1.6), (3, 0.09, 2.8), (4, 0.03, 4.2)]
    out = np.zeros((n, 2))
    for cents, p in ((-3, -0.25), (3, 0.25)):
        f = freq * 2 ** (cents / 1200)
        y = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * s) for m, a, s in partials)
        out[:, 0] += y * np.sqrt((1 - p) / 2)
        out[:, 1] += y * np.sqrt((1 + p) / 2)
    env = rc(t / attack) * rc((dur - t) / release)
    return pan_gain(amp * env[:, None] * out / 2, pan)


def cello(freq, dur, amp, attack=0.35, release=1.2):
    """Тёплые струнные: богатые обертона, лёгкое вибрато, два слегка расстроенных голоса."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * rc((t - 0.3) / 0.6) * np.sin(2 * np.pi * 5.2 * t)
    out = np.zeros((n, 2))
    for cents, p in ((-6, -0.35), (6, 0.35)):
        phase = 2 * np.pi * np.cumsum(freq * 2 ** (cents / 1200) * vib) / SR
        y = sum(k ** -1.2 * np.sin(k * phase) for k in range(1, 8)) / 1.9
        out[:, 0] += y * np.sqrt((1 - p) / 2)
        out[:, 1] += y * np.sqrt((1 + p) / 2)
    env = rc(t / attack) * rc((dur - t) / release)
    return 1.8 * amp * env[:, None] * out / 2  # струнные дают тепло, но не перекрывают мелодию


def pad(freq, dur, amp, attack, release):
    """Мягкая подложка из синусов, нарастает и тает медленно."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    env = rc(t / attack) * rc((dur - t) / release)
    return (0.3 * amp * env * y)[:, None] * np.ones((1, 2))  # подложка тихая, на заднем плане


def place(buf, sig, start, jitter=0.0):
    """Кладёт звук в буфер; jitter добавляет живую неточность по времени (секунды)."""
    s = max(0.0, start + (RNG.uniform(-jitter, jitter) if jitter else 0.0))
    i = int(s * SR)
    n = min(len(sig), buf.shape[0] - i)
    buf[i:i + n] += sig[:n]


def reverb(x, wet=0.12, length=0.9, decay=4.0, seed=11):
    """Очень лёгкая «комнатная» реверберация, чтобы звук не был сухим. Не эхо."""
    rng = np.random.default_rng(seed)
    n = int(SR * length)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * decay)
        ir[0] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        size = len(x) + n
        out[:, ch] = np.fft.irfft(np.fft.rfft(x[:, ch], size) * np.fft.rfft(ir, size), size)[: len(x)]
    return (1 - wet) * x + wet * out


def finish(x, fade_in=0.05, fade_out=1.5):
    n = len(x)
    fi, fo = int(SR * fade_in), int(SR * fade_out)
    env = np.ones(n)
    env[:fi] = rc(np.linspace(0, 1, fi))
    env[n - fo:] = 1 - rc(np.linspace(0, 1, fo))
    return x * env[:, None]


def rms_db(x):
    return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)


def make_open(dur=5.4, fade_out=1.5):
    n = int(SR * dur)
    pn, ce, pd = (np.zeros((n, 2)) for _ in range(3))
    # Гармония: ре мажор (дом), затем соль мажор maj7 (светлый шаг вперёд)
    for f, a in [(D2, 0.10), (D3, 0.10), (A3, 0.08), (D4, 0.06), (FS4, 0.05)]:
        place(pd, pad(f, 2.5, a, attack=0.6, release=0.8), 0.0)
    for f, a in [(G2, 0.10), (D3, 0.08), (B3, 0.07), (FS4, 0.06)]:
        place(pd, pad(f, dur - 1.9, a, attack=0.7, release=2.0), 1.9)
    # Тёплая струнная линия: ре → си (мягкий подъём «рука на плече»)
    place(ce, cello(D3, 2.4, 0.16, attack=0.4, release=0.8), 0.0)
    place(ce, cello(B3, dur - 2.0, 0.17, attack=0.5, release=1.8), 2.0)
    # Мелодия: «лестница» вверх из четырёх ступеней, затем светлое «раскрытие»
    for f, s, a, p in [(D4, 0.30, 0.24, -0.25), (FS4, 0.75, 0.24, -0.08), (A4, 1.20, 0.25, 0.08), (D5, 1.65, 0.26, 0.25)]:
        place(pn, piano(f, 2.2, a, release=0.6, pan=p), s, jitter=0.012)
    place(pn, piano(E5, 1.8, 0.22, release=0.6), 2.20, jitter=0.012)
    place(pn, piano(FS5, dur - 2.85, 0.20, release=1.6), 2.85, jitter=0.012)
    STEMS["open"] = {"фортепиано": rms_db(pn), "струнные": rms_db(ce), "подложка": rms_db(pd)}
    return finish(reverb(pn + ce + pd), fade_out=fade_out)


def make_close(dur=5.7):
    n = int(SR * dur)
    pn, ce, pd = (np.zeros((n, 2)) for _ in range(3))
    # Гармония: соль maj7 → возвращение домой, в ре мажор
    for f, a in [(G2, 0.10), (D3, 0.08), (B3, 0.07), (FS4, 0.06)]:
        place(pd, pad(f, 2.6, a, attack=0.3, release=1.0), 0.0)
    for f, a in [(D2, 0.11), (D3, 0.10), (A3, 0.08), (FS4, 0.06)]:
        place(pd, pad(f, dur - 1.75, a, attack=0.5, release=2.4), 1.75)
    # Струнная линия вниз: си → ре (выдох)
    place(ce, cello(B3, 2.0, 0.16, attack=0.3, release=0.9), 0.0)
    place(ce, cello(D3, dur - 1.75, 0.18, attack=0.5, release=2.4), 1.75)
    # Мелодия: «лестница» вниз, чуть замедляясь, последняя нота остаётся
    for f, s, a, d, p in [(D5, 0.00, 0.22, 1.2, 0.25), (A4, 0.55, 0.22, 1.2, 0.08),
                          (FS4, 1.15, 0.23, 1.2, -0.08), (D4, 1.80, 0.26, dur - 1.8, -0.25)]:
        place(pn, piano(f, d, a, release=2.2 if d > 2 else 0.6, pan=p), s, jitter=0.012)
    place(pn, piano(A4, 2.5, 0.08, release=1.5), 2.35, jitter=0.01)
    place(pn, piano(FS4, 2.4, 0.06, release=1.5), 2.50, jitter=0.01)
    STEMS["close"] = {"фортепиано": rms_db(pn), "струнные": rms_db(ce), "подложка": rms_db(pd)}
    return finish(reverb(pn + ce + pd), fade_out=1.8)


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
    mp3 = OUT / f"{name}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame",
                    "-b:a", "192k", str(mp3)], check=True)
    i, tp = measure(wav)
    print(f"{name}: {len(y) / SR:.2f} с, {i:.1f} LUFS, истинный пик {tp:.1f} дБ")


if __name__ == "__main__":
    save("jingle_open", make_open())
    save("jingle_close", make_close())
    # Подложка под голос строится под длину записи: см. make_bed.py и ../intro/mix_intro.py
