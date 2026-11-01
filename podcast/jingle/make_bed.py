#!/usr/bin/env python3
"""Подложка под интро: джингл продолжается и играет, пока ведущий говорит.

Структура:
  - Вступление: то же, что в открытии джингла: быстрая «лестница» вверх и удар на «раз».
  - Продолжение: ритмичная группа по кругу гармоний ре – ля – си минор – соль (светло и энергично):
    бас, тихие кик/хлопок/хэт, арпеджио «щипком», тёплые струнные. Ритм и барабаны приглушены
    сильнее, чем в самом джингле, чтобы не спорить с голосом.
  - Финал: к моменту, когда ведущий заканчивает говорить (resolve_at), приходит яркий аккорд
    ре мажор и затухает. Темп чуть подстраивается под длину речи, чтобы финал попал точно.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import make_jingle as mj  # noqa: E402
from make_jingle import BEAT, SR, finish, groove_bar, mixdown, new_bufs, pad, place, reverb, stab, stairs  # noqa: E402

PROGRESSION = ["D", "A", "Bm", "G"]


def make_bed(resolve_at, tail=3.2, fade_out=2.4, drum_gain=0.65, arp_gain=0.9):
    """resolve_at: секунда, на которой должен прийти финальный аккорд (конец речи)."""
    dur = resolve_at + tail
    B = new_bufs(int(SR * dur))
    t0 = BEAT                                      # «раз» на 0,5 с, как в открытии
    nbars = max(1, round((resolve_at - t0) / (4 * BEAT)))
    bar = (resolve_at - t0) / nbars                # такт подгоняется под длину речи
    place(B["pad"], pad(mj.n("D3"), t0 + 0.3, 0.04, attack=0.4, release=0.1), 0.0)
    stairs(B, t0, ["D4", "F#4", "A4", "D5"], BEAT / 4, [0.22, 0.24, 0.26, 0.28])
    stab(B, t0, bar - 0.1)                         # удар на «раз»
    for k in range(nbars):
        groove_bar(B, t0 + k * bar, bar, PROGRESSION[k % len(PROGRESSION)], drum_gain=drum_gain, arp_gain=arp_gain)
    stab(B, resolve_at, tail, with_drums=True)     # яркий финальный аккорд к концу речи
    return finish(reverb(mixdown(B, "bed")), fade_in=0.01, fade_out=fade_out)


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    resolve = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
    x = make_bed(resolve)
    mj.write_wav(out / "_bed_test.wav", x / np.max(np.abs(x)) * 0.5)
    print(f"подложка {len(x) / SR:.1f} с, финал на {resolve:.1f} с -> {out / '_bed_test.wav'}")
