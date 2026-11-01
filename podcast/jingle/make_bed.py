#!/usr/bin/env python3
"""Подложка под интро: джингл продолжается и играет, пока ведущий говорит.

Структура:
  - Вступление: тот же мотив «лестницы» (ре мажор), что и в открытии джингла.
  - Продолжение: мягкий арпеджио фортепиано по кругу гармоний соль – ре – си минор – ля
    (светлое, движущееся вперёд, не усыпляющее), тёплые струнные на басу, тихая подложка.
    Музыка постепенно «набирает» энергию в первые секунды.
  - Финал: к моменту, когда ведущий заканчивает говорить (resolve_at), гармония приходит в ре мажор
    и затухает. Темп подстраивается под длину речи, чтобы финал попал точно.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import make_jingle as mj  # noqa: E402
from make_jingle import (A3, A4, B3, B4, D2, D3, D4, D5, E5, FS4, G2, SR, cello, finish, pad,  # noqa: E402
                         piano, place, reverb)

E4, G4 = 329.63, 392.00
CS4, CS5 = 277.18, 554.37
A2, B2 = 110.00, 123.47

# (бас, нота струнных, тона арпеджио от низкого к высокому, тона подложки)
CHORDS = {
    "G": (G2, 196.00, [D4, FS4, B4, D5], [D3, B3, FS4]),
    "D": (D2, D3, [A3, D4, FS4, A4], [A3, D4, FS4]),
    "Bm": (B2, B3, [B3, D4, FS4, B4], [D4, FS4, B4]),
    "A": (A2, A3, [CS4, E4, A4, CS5], [E4, A4, CS5]),
}
PROGRESSION = ["G", "D", "Bm", "A"]
PATTERN = [0, 1, 2, 3, 2, 1, 2, 3]  # восемь восьмых на такт


def make_bed(resolve_at, tail=3.2, fade_out=2.4, intro_end=2.4):
    """resolve_at: секунда, на которой гармония должна прийти в тонику (конец речи)."""
    dur = resolve_at + tail
    n = int(SR * dur)
    pn, ce, pd = (np.zeros((n, 2)) for _ in range(3))

    # Вступление: «лестница» вверх и тёплое «ре»
    for f, s, a, p in [(D4, 0.30, 0.24, -0.25), (FS4, 0.75, 0.24, -0.08), (A4, 1.20, 0.25, 0.08), (D5, 1.65, 0.26, 0.25)]:
        place(pn, piano(f, 2.2, a, release=0.6, pan=p), s, jitter=0.012)
    place(pn, piano(E5, 1.8, 0.22, release=0.6), 2.20, jitter=0.012)
    for f, a in [(D2, 0.10), (D3, 0.10), (A3, 0.08), (D4, 0.06), (FS4, 0.05)]:
        place(pd, pad(f, 2.9, a, attack=0.6, release=0.8), 0.0)
    place(ce, cello(D3, 2.9, 0.16, attack=0.4, release=0.8), 0.0)

    # Продолжение: такты арпеджио; длина такта подгоняется, чтобы финал попал в resolve_at
    t0 = intro_end
    nbars = max(1, round((resolve_at - t0) / 2.4))
    bar = (resolve_at - t0) / nbars
    step = bar / 8
    for k in range(nbars):
        t = t0 + k * bar
        bass, cello_note, arp, harm = CHORDS[PROGRESSION[k % len(PROGRESSION)]]
        crescendo = 0.78 + 0.22 * min(1.0, (t - t0) / 8.0)
        place(pd, pad(bass, bar + 0.4, 0.09, attack=0.2, release=0.5), t)
        for f in harm:
            place(pd, pad(f, bar + 0.4, 0.06, attack=0.3, release=0.5), t)
        place(ce, cello(cello_note, bar + 0.5, 0.15, attack=0.15, release=0.6), t)
        for j, idx in enumerate(PATTERN):
            amp = 0.12 * crescendo * (1.0 if j % 2 == 0 else 0.72)
            pan = 0.3 * np.sin(2 * np.pi * (k * 8 + j) / 16)
            place(pn, piano(arp[idx], 1.0, amp, attack=0.04, release=0.45, pan=pan), t + j * step, jitter=0.008)

    # Финал: возвращение домой в ре мажор
    rem = dur - resolve_at
    for f, a in [(D2, 0.11), (D3, 0.10), (A3, 0.08), (FS4, 0.06)]:
        place(pd, pad(f, rem, a, attack=0.4, release=min(2.2, rem - 0.1)), resolve_at)
    place(ce, cello(D3, rem, 0.18, attack=0.4, release=min(2.2, rem - 0.1)), resolve_at)
    for f, a, d in [(D4, 0.26, 0.0), (A4, 0.10, 0.12), (FS4, 0.08, 0.24), (D5, 0.10, 0.40)]:
        place(pn, piano(f, rem - d, a, release=2.0), resolve_at + d, jitter=0.01)

    mix = reverb(pn + ce + pd, wet=0.12)
    return finish(mix, fade_in=0.05, fade_out=fade_out)


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    resolve = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
    x = make_bed(resolve)
    mj.write_wav(out / "_bed_test.wav", x / np.max(np.abs(x)) * 0.5)
    print(f"подложка {len(x) / SR:.1f} с, финал на {resolve:.1f} с -> {out / '_bed_test.wav'}")
