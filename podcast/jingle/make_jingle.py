#!/usr/bin/env python3
"""Джингл подкаста «Карьерный юрист»: открытие (приглашение) и закрытие (плавное завершение).

Идея: четыре ноты «лестницы» (логотип КЮ). В начале выпуска лестница идёт вверх и раскрывается
светлым аккордом с добавленной нонoй (вопрос/приглашение). В конце лестница идёт вниз и
разрешается в тонику с долгим затуханием (точка).

Запуск:  python3 make_jingle.py [папка_вывода]
Результат: jingle_open.wav/.mp3, jingle_close.wav/.mp3 (до 5 секунд, 44.1 кГц, стерео).
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent

# Тональность: ре мажор (тёплая, не «рекламная»)
D3, A3 = 146.83, 220.00
D4, FS4, A4 = 293.66, 369.99, 440.00
D5, E5, FS5, A5 = 587.33, 659.25, 739.99, 880.00


def tone(freq, dur, amp=1.0, decay=0.9, bright=1.0):
    """Мягкий щипково-колокольный звук: основной тон + обертоны с разным затуханием."""
    t = np.arange(int(SR * dur)) / SR
    partials = [(1.0, 1.00, 1.0), (2.0, 0.40 * bright, 1.6), (3.01, 0.16 * bright, 2.4), (4.02, 0.06 * bright, 3.2)]
    y = np.zeros_like(t)
    for mult, a, speed in partials:
        y += a * np.sin(2 * np.pi * freq * mult * t) * np.exp(-t * speed / decay)
    attack = np.minimum(1.0, t / 0.006)
    return amp * y * attack


def pad(freq, dur, amp, attack, release):
    """Тихая подложка с медленным нарастанием."""
    t = np.arange(int(SR * dur)) / SR
    y = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
    env = np.minimum(1.0, t / attack) * np.minimum(1.0, (dur - t) / release)
    return amp * y * env


def place(buf, sig, start, pan=0.0):
    """Кладёт моно-сигнал в стерео-буфер с панорамой от -1 (лево) до +1 (право)."""
    i = int(start * SR)
    n = min(len(sig), buf.shape[0] - i)
    left = np.sqrt((1 - pan) / 2)
    right = np.sqrt((1 + pan) / 2)
    buf[i:i + n, 0] += sig[:n] * left
    buf[i:i + n, 1] += sig[:n] * right


def reverb(x, wet=0.22, length=1.4, seed=7):
    """Лёгкая синтетическая реверберация (свёртка с затухающим шумом)."""
    rng = np.random.default_rng(seed)
    n = int(SR * length)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 3.2)
        ir[0] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        size = len(x) + n
        spec = np.fft.rfft(x[:, ch], size) * np.fft.rfft(ir, size)
        out[:, ch] = np.fft.irfft(spec, size)[: len(x)]
    return (1 - wet) * x + wet * out


def finish(x, fade_in=0.005, fade_out=0.9, peak=0.84):
    n = len(x)
    fi = int(SR * fade_in)
    fo = int(SR * fade_out)
    env = np.ones(n)
    env[:fi] = np.linspace(0, 1, fi)
    env[n - fo:] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, fo)))
    x = x * env[:, None]
    return x / np.max(np.abs(x)) * peak


def make_open(dur=4.8):
    buf = np.zeros((int(SR * dur), 2))
    # «Лестница» вверх: четыре ноты, неспешно, с движением слева направо
    steps = [(D4, 0.00, -0.35), (FS4, 0.30, -0.12), (A4, 0.60, 0.12), (D5, 0.90, 0.35)]
    for f, s, p in steps:
        place(buf, tone(f, 1.6, amp=0.55, decay=0.8), s, p)
    # Раскрытие: светлый аккорд D5 + F#5 + A5 + E5 (add9): открытое, «приглашающее» звучание
    for f, a in [(D5, 0.30), (FS5, 0.26), (A5, 0.22), (E5, 0.16)]:
        place(buf, tone(f, dur - 1.35, amp=a, decay=2.2, bright=0.8), 1.35, 0.0)
    place(buf, tone(D3, dur - 1.35, amp=0.30, decay=2.4, bright=0.5), 1.35, 0.0)
    place(buf, pad(D3, dur, 0.05, attack=1.4, release=1.5), 0.0, 0.0)
    return finish(reverb(buf), fade_out=0.8)


def make_close(dur=4.9):
    buf = np.zeros((int(SR * dur), 2))
    # «Лестница» вниз, чуть замедляясь (ritardando), движение справа налево
    steps = [(D5, 0.00, 0.35), (A4, 0.30, 0.12), (FS4, 0.62, -0.12), (D4, 0.98, -0.35)]
    for f, s, p in steps:
        place(buf, tone(f, 1.8, amp=0.50, decay=0.9), s, p)
    # Разрешение: тоника D3 + A3 + D4, без добавленных тонов, долгое затухание
    for f, a in [(D3, 0.36), (A3, 0.24), (D4, 0.22)]:
        place(buf, tone(f, dur - 1.55, amp=a, decay=2.6, bright=0.45), 1.55, 0.0)
    place(buf, pad(D3, dur, 0.04, attack=1.0, release=2.0), 0.0, 0.0)
    return finish(reverb(buf, wet=0.26, length=1.6), fade_out=1.3)


def save(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / f"{name}.wav"
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    mp3 = OUT / f"{name}.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3)],
        check=True,
    )
    print(f"{name}: {len(x) / SR:.2f} c, пик {np.max(np.abs(x)):.2f}")


if __name__ == "__main__":
    save("jingle_open", make_open())
    save("jingle_close", make_close())
