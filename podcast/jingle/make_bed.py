#!/usr/bin/env python3
"""Подложка под интро: джингл продолжается и играет, пока ведущий говорит.

Структура:
  - Вступление: то же, что в открытии джингла: нарастание «лестницей» и удар на «раз» (ре минор).
  - Продолжение: ритм рублеными виолончелями и барабаном по кругу гармоний ре минор – си-бемоль –
    до – ля (серьёзно, с движением вперёд), тихие акценты фортепиано и струнные.
  - Финал: к моменту, когда ведущий заканчивает говорить (resolve_at), приходит ре мажор и
    затухает. Темп чуть подстраивается под длину речи, чтобы финал попал точно.
  - pocket(): освобождает место голосу (срез глубоких низов и мягкое уменьшение 150-500 Гц).
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import make_jingle as mj  # noqa: E402
from make_jingle import BEAT, SR, finish, groove, hit, mixdown, new_bufs, place, reverb, rise  # noqa: E402

PROGRESSION = ["Dm", "Bb", "C", "A"]


def make_bed(resolve_at, tail=3.2, fade_out=2.4, drum_gain=0.7, groove_gain=0.9):
    """resolve_at: секунда, на которой должен прийти финальный ре мажор (конец речи)."""
    dur = resolve_at + tail
    B = new_bufs(int(SR * dur))
    t0 = BEAT                                      # «раз» на 0,5 с, как в открытии
    nbars = max(1, round((resolve_at - t0) / (4 * BEAT)))
    bar = (resolve_at - t0) / nbars                # такт подгоняется под длину речи
    rise(B, t0, BEAT)
    hit(B, t0, bar, major=False)                   # удар: ре минор
    for k in range(nbars):
        groove(B, t0 + k * bar, 4, bar / 4, PROGRESSION[k % len(PROGRESSION)], dg=drum_gain, ag=groove_gain)
    hit(B, resolve_at, tail, major=True)           # ре мажор к концу речи
    return finish(reverb(mixdown(B, "bed")), fade_in=0.01, fade_out=fade_out)


def pocket(x, sr, depth_db=-6.0):
    """Освобождает место голосу: срез ниже ~100 Гц и мягкое уменьшение области 150-500 Гц."""
    f = np.fft.rfftfreq(len(x), 1 / sr)
    hp = mj.rc((f - 70) / 60)
    bell = mj.rc((f - 130) / 90) * (1 - mj.rc((f - 450) / 250))
    g = hp * (1 + (10 ** (depth_db / 20) - 1) * bell)
    return np.fft.irfft(np.fft.rfft(x, axis=0) * g[:, None], len(x), axis=0)


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    resolve = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
    x = make_bed(resolve)
    mj.write_wav(out / "_bed_test.wav", x / np.max(np.abs(x)) * 0.5)
    print(f"подложка {len(x) / SR:.1f} с, финал на {resolve:.1f} с -> {out / '_bed_test.wav'}")
