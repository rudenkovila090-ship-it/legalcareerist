#!/usr/bin/env python3
"""Джингл подкаста «Карьерный юрист», версия 2: горы, холод, свежесть.

Звук: плавные ноты без щипка (медленная атака), открытые квинты (ре–ля–ми–си), порыв
«ветра» из фильтрованного шума, ледяной блеск на верхних нотах и далёкое эхо, как в долине.

Открытие: ветер поднимается, четыре ноты идут вверх «лестницей» (логотип КЮ) и раскрываются
светлым открытым аккордом.
Закрытие: те же ноты идут вниз, ветер стихает, звук разрешается в чистую квинту ре–ля и тает.

Громкость выравнивается автоматически до -20 LUFS (тише речи в подкасте, не перебивает её).

Запуск:  python3 make_jingle.py [папка_вывода]
Результат: jingle_open.wav/.mp3, jingle_close.wav/.mp3 (до 5 секунд, 44.1 кГц, стерео).
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

# Тональность ре мажор, открытые квинты
D2, D3, A3 = 73.42, 146.83, 220.00
D4, E4, A4 = 293.66, 329.63, 440.00
E5, B5, D6, A6, D7 = 659.25, 987.77, 1174.66, 1760.00, 2349.32


def rc(x):
    """Плавная кривая 0..1 (приподнятый косинус), без резких углов."""
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def note(freq, dur, amp, attack=0.18, release=0.8,
         detune=(-5, 0, 5), pans=(-0.45, 0.0, 0.45), partials=((1, 1.0), (2, 0.22), (3, 0.07))):
    """Мягкий протяжный тон: три слегка расстроенных голоса, медленная атака и затухание."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    env = rc(t / attack) * rc((dur - t) / release)
    out = np.zeros((n, 2))
    for cents, pan in zip(detune, pans):
        f = freq * 2 ** (cents / 1200)
        y = sum(a * np.sin(2 * np.pi * f * m * t + cents) for m, a in partials)
        out[:, 0] += y * np.sqrt((1 - pan) / 2)
        out[:, 1] += y * np.sqrt((1 + pan) / 2)
    return amp * env[:, None] * out / len(detune)


def shimmer(freq, dur, amp, attack=0.5, release=1.6, rate=4.7):
    """Ледяной блеск: тихий высокий тон с лёгким дрожанием, разным в левом и правом канале."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    env = rc(t / attack) * rc((dur - t) / release)
    y = np.sin(2 * np.pi * freq * t)
    left = y * (1 + 0.45 * np.sin(2 * np.pi * rate * t))
    right = y * (1 + 0.45 * np.sin(2 * np.pi * rate * t + np.pi))
    return amp * env[:, None] * np.stack([left, right], axis=1)


def pad(freq, dur, amp, attack, release):
    n = int(SR * dur)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    env = rc(t / attack) * rc((dur - t) / release)
    return (amp * env * y)[:, None] * np.ones((1, 2))


def wind(dur, f_start, f_end, t_peak, amp, seed, q=0.3):
    """Порыв ветра: белый шум через полосовой фильтр с плавающей частотой."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    fc = f_start * (f_end / f_start) ** np.clip(t / dur, 0, 1)
    f = 2 * np.sin(np.pi * np.minimum(fc, 4500) / SR)
    env = np.where(t < t_peak, rc(t / t_peak), rc((dur - t) / (dur - t_peak)))
    rng = np.random.default_rng(seed)
    out = np.zeros((n, 2))
    for ch in range(2):
        x = rng.standard_normal(n)
        low = band = 0.0
        y = np.empty(n)
        for i in range(n):
            low += f[i] * band
            high = x[i] - low - q * band
            band += f[i] * high
            y[i] = band
        out[:, ch] = y / (y.std() + 1e-9) * env * amp
    return out


def place(buf, sig, start):
    i = int(start * SR)
    n = min(len(sig), buf.shape[0] - i)
    buf[i:i + n] += sig[:n]


def echo(x, delay=0.43, gains=(0.34, 0.16, 0.07), cutoff=2200):
    """Далёкое эхо долины: повторы приглушаются по верхам."""
    wet = np.zeros_like(x)
    for k, g in enumerate(gains, start=1):
        d = int(SR * delay * k)
        if d < len(x):
            wet[d:] += g * x[: len(x) - d]
    spec = np.fft.rfft(wet, axis=0)
    freqs = np.fft.rfftfreq(len(wet), 1 / SR)
    spec *= (1 / (1 + (freqs / cutoff) ** 2))[:, None]
    return np.fft.irfft(spec, len(wet), axis=0)


def reverb(x, wet=0.3, length=2.2, decay=2.6, seed=11):
    """Просторная реверберация (свёртка с затухающим шумом)."""
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


def finish(x, fade_in=0.08, fade_out=1.2):
    n = len(x)
    fi, fo = int(SR * fade_in), int(SR * fade_out)
    env = np.ones(n)
    env[:fi] = rc(np.linspace(0, 1, fi))
    env[n - fo:] = 1 - rc(np.linspace(0, 1, fo))
    return x * env[:, None]


def make_open(dur=4.6):
    n = int(SR * dur)
    bed, mel = np.zeros((n, 2)), np.zeros((n, 2))
    # Порыв ветра поднимается вверх и достигает гребня
    place(bed, wind(2.7, 350, 3800, t_peak=2.0, amp=0.12, seed=3), 0.0)
    # Открытая квинтовая подложка и мягкий бас
    for f, a in [(D3, 0.10), (A3, 0.08), (E4, 0.05)]:
        place(bed, pad(f, dur, a, attack=1.3, release=1.7), 0.0)
    place(bed, pad(D2, dur - 1.7, 0.09, attack=0.45, release=1.8), 1.7)
    # «Лестница» вверх: плавные ноты внахлёст
    for f, s, a in [(D4, 0.35, 0.20), (A4, 0.72, 0.20), (E5, 1.09, 0.19), (B5, 1.46, 0.18)]:
        place(mel, note(f, 1.5, a, attack=0.16, release=0.8), s)
    # Раскрытие: светлый открытый аккорд и ледяной блеск
    bloom = dur - 1.95
    for f, a in [(A4, 0.12), (E5, 0.11), (B5, 0.10), (D6, 0.08)]:
        place(mel, note(f, bloom, a, attack=0.32, release=1.6), 1.95)
    place(mel, shimmer(D7, bloom, 0.022), 1.95)
    place(mel, shimmer(A6, bloom, 0.018, rate=5.3), 1.95)
    mix = bed + mel + echo(mel)
    return finish(reverb(mix, wet=0.3, length=2.2), fade_out=1.2)


def make_close(dur=4.8):
    n = int(SR * dur)
    bed, mel = np.zeros((n, 2)), np.zeros((n, 2))
    # Ветер стихает, спускаясь вниз по частоте
    place(bed, wind(2.4, 3800, 350, t_peak=0.5, amp=0.09, seed=5), 0.0)
    # «Лестница» вниз, последняя нота остаётся звучать
    for f, s, a, d, r in [(B5, 0.00, 0.19, 1.5, 0.9), (E5, 0.42, 0.19, 1.5, 0.9),
                          (A4, 0.84, 0.20, 1.5, 0.9), (D4, 1.28, 0.22, dur - 1.28, 2.2)]:
        place(mel, note(f, d, a, attack=0.14, release=r), s)
    # Разрешение: чистая квинта ре–ля, ледяной блеск тоники, всё тает
    rest = dur - 1.1
    for f, a in [(D3, 0.12), (A3, 0.09)]:
        place(bed, pad(f, rest, a, attack=0.5, release=2.3), 1.1)
    place(bed, pad(D2, rest, 0.08, attack=0.5, release=2.3), 1.1)
    place(mel, shimmer(D6, dur - 1.2, 0.02, attack=0.4, release=2.0, rate=4.2), 1.2)
    mix = bed + mel + echo(mel)
    return finish(reverb(mix, wet=0.34, length=2.4), fade_out=1.4)


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
    gain_db = TARGET_LUFS - lufs
    y = x / np.max(np.abs(x)) * 0.5 * 10 ** (gain_db / 20)
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
