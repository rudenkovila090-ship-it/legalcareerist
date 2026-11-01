#!/usr/bin/env python3
"""Монтаж эпизода подкаста: интро + очищенная речь без лишних пауз + закрывающий джингл.

Что делает с речью:
  1. Подавляет эхо комнаты и «бубнящие» басы (voice_enhance), убирает гул и шум, добавляет присутствие.
  2. Сокращает длинные паузы (дольше PAUSE_MIN) до короткой естественной паузы PAUSE_KEEP;
     стыки с плавным перекрытием (без щелчков). Тишина в начале и в конце тоже подрезается.
  3. Ускоряет речь без смены высоты голоса, если задана скорость (по умолчанию ×1.0, без ускорения).
  4. Выравнивает громкость до -16 LUFS (с ограничителем пиков).
Сборка: интро (готовый файл со своим голосом и музыкой) -> эпизод (накладывается на хвост интро на
OVERLAP секунд) -> закрывающий джингл после последнего слова. Итог выравнивается до -16 LUFS.

Запуск:
  python3 -I edit_episode.py голос.m4a интро.wav jingle_close.wav папка_вывода [скорость] [normal|strong|max]
Результат: episode_final.mp3/.wav, episode_voice_only.wav (для проверки), episode_timeline.txt.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "intro"))
import mix_intro as mi  # noqa: E402
import voice_enhance as ve  # noqa: E402

SR = 48000
PAUSE_MIN = 0.35        # паузы длиннее этого считаются «длинными»
PAUSE_KEEP = 0.18       # сколько оставить от длинной паузы
XFADE = 0.015           # перекрытие на стыках, с
LEAD, TRAIL = 0.15, 0.40
THR_DB = 12.0           # речь = на столько дБ выше уровня шума
EP_LUFS = -16.0
OVERLAP = 1.0           # секунд эпизод накладывается на хвост интро
OUTRO_GAP = 0.35        # пауза между последним словом и закрывающим джинглом
OUTRO_LUFS = -17.0
FINAL_LUFS, MAX_TP_DB = -16.0, -1.5

# Профили чистки голоса: сила подавления эха (gamma/gmin), сжатия басов (low_*), мягкость выравнивания (comp_ratio)
# и фильтры. «normal» - как в интро; «strong» и «max» - заметно сильнее против эха и басов.
_EQ_PRES = "equalizer=f=3500:width_type=q:width=1:g=2"
PROFILES = {
    "normal": dict(gamma=0.8, gmin=0.30, low_ratio=2.2, low_thr=65, comp_ratio=2.5,
                   eq="highpass=f=80,afftdn=nr=10:nf=NF:tn=1,equalizer=f=300:width_type=q:width=1:g=-1.5," + _EQ_PRES),
    "strong": dict(gamma=1.2, gmin=0.22, low_ratio=3.0, low_thr=50, comp_ratio=2.0,
                   eq="highpass=f=90,afftdn=nr=12:nf=NF:tn=1,equalizer=f=130:width_type=q:width=0.8:g=-1.5,"
                      "equalizer=f=250:width_type=q:width=1:g=-2.5," + _EQ_PRES),
    "max": dict(gamma=1.6, gmin=0.15, low_ratio=4.0, low_thr=40, comp_ratio=1.8,
                eq="highpass=f=95,afftdn=nr=14:nf=NF:tn=1,equalizer=f=130:width_type=q:width=0.8:g=-2.5,"
                   "equalizer=f=250:width_type=q:width=1:g=-3.5,equalizer=f=3500:width_type=q:width=1:g=2.5"),
}


def frame_db(x, win=0.01):
    k = int(SR * win)
    m = len(x) // k
    return 20 * np.log10(np.sqrt((x[: m * k].reshape(m, k) ** 2).mean(axis=1)) + 1e-9), k


def find_pauses(x, min_pause=PAUSE_MIN):
    """Относительный порог: речь = выше уровня шума (10-й процентиль) на THR_DB."""
    db, k = frame_db(x)
    noise = np.percentile(db, 10)
    act = db > noise + THR_DB
    runs, i, m = [], 0, len(act)
    while i < m:
        if not act[i]:
            j = i
            while j < m and not act[j]:
                j += 1
            if (j - i) * k / SR >= min_pause and i > 0 and j < m:
                runs.append((i, j))
            i = j
        else:
            i += 1
    first, last = int(np.argmax(act)), int(m - 1 - np.argmax(act[::-1]))
    return runs, first, last, k, noise


def remove_pauses(x):
    runs, first, last, k, _ = find_pauses(x)
    cuts = []
    lead_end = max(0, first * k - int(LEAD * SR))
    if lead_end > 0:
        cuts.append((0, lead_end))
    for a, b in runs:
        s, e = a * k + int(PAUSE_KEEP / 2 * SR), b * k - int(PAUSE_KEEP / 2 * SR)
        if e - s > 2 * int(XFADE * SR):
            cuts.append((s, e))
    tail_start = min(len(x), (last + 1) * k + int(TRAIL * SR))
    if tail_start < len(x):
        cuts.append((tail_start, len(x)))
    cuts.sort()
    segs, cur = [], 0
    for a, b in cuts:
        if a > cur:
            segs.append((cur, a))
        cur = max(cur, b)
    if cur < len(x):
        segs.append((cur, len(x)))
    xf = int(XFADE * SR)
    fade = np.linspace(0, 1, xf)
    out = x[segs[0][0]:segs[0][1]].copy()
    seams = []
    for a, b in segs[1:]:
        seg = x[a:b]
        if len(seg) <= xf or len(out) <= xf:
            continue
        out[-xf:] = out[-xf:] * (1 - fade) + seg[:xf] * fade
        seams.append(len(out) - xf // 2)
        out = np.concatenate([out, seg[xf:]])
    removed = (len(x) - len(out)) / SR
    return out, dict(n_runs=len(runs), pause_total=sum((b - a) * k for a, b in runs) / SR,
                     removed=removed, seams=seams)


def to_stereo(x):
    return np.stack([x, x], axis=1)


def add_at(buf, sig, start_s):
    i = int(start_s * SR)
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n]


def main():
    voice_in, intro_p, jingle_p, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
    speed = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
    P = PROFILES[sys.argv[6] if len(sys.argv) > 6 else "normal"]
    out.mkdir(parents=True, exist_ok=True)

    # 1. Чистка речи
    raw, enh, clean = out / "_raw.wav", out / "_enh.wav", out / "_clean.wav"
    mi.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(voice_in), "-ac", "1", "-ar", str(SR), str(raw)])
    xr = mi.read_wav(raw)[:, 0]
    s0, s1, noise = mi.speech_span(xr)
    nf = int(np.clip(round(noise - 2), -80, -30))
    xe, info = ve.enhance(xr, gamma=P["gamma"], gmin=P["gmin"], low_ratio=P["low_ratio"], low_thr=P["low_thr"])
    mi.write_wav(enh, xe[:, None])
    mi.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(enh), "-af", P["eq"].replace("NF", str(nf)),
            "-ar", str(SR), str(clean)])
    xc = mi.read_wav(clean)[:, 0]

    # 2. Паузы
    xp, st = remove_pauses(xc)
    pp = out / "_nopause.wav"
    mi.write_wav(pp, xp[:, None])

    # 3. Ускорение без смены высоты
    fast = out / "_fast.wav"
    if speed != 1.0:
        mi.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(pp), "-af", f"atempo={speed}", "-ar", str(SR), str(fast)])
        xf_ = mi.read_wav(fast)[:, 0].copy()
    else:
        xf_ = xp.copy()                                   # обычная скорость: без растяжения времени
    fi, fo = int(0.03 * SR), int(0.4 * SR)
    xf_[:fi] *= np.linspace(0, 1, fi)
    xf_[-fo:] *= np.linspace(1, 0, fo)
    tr = out / "_trim.wav"
    mi.write_wav(tr, xf_[:, None])

    # 4. Громкость тела эпизода
    lev = out / "episode_voice_only.wav"
    mi.level_voice(tr, lev, EP_LUFS, ratio=P["comp_ratio"])
    voice = mi.read_wav(lev)[:, 0]

    # 5. Сборка: интро -> эпизод -> закрывающий джингл
    intro = mi.read_wav(intro_p)
    jc_src = out / "_jc48.wav"
    mi.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(jingle_p), "-ar", str(SR), "-ac", "2", str(jc_src)])
    jc = mi.read_wav(jc_src)
    jl, _ = mi.measure(jc_src)
    jc = jc * 10 ** ((OUTRO_LUFS - jl) / 20)
    t_ep = len(intro) / SR - OVERLAP
    t_end_voice = t_ep + len(voice) / SR - 0.4        # последнее слово (до затухания)
    t_out = t_end_voice + OUTRO_GAP
    total = int((t_out + len(jc) / SR) * SR)
    mix = np.zeros((total, 2))
    add_at(mix, intro, 0.0)
    add_at(mix, to_stereo(voice), t_ep)
    add_at(mix, jc, t_out)
    w = out / "episode_final.wav"
    mi.write_wav(w, mix / max(1.0, np.max(np.abs(mix))) * 0.8)
    i_, _ = mi.measure(w)
    fin = out / "_final.wav"
    mi.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(w), "-af",
            f"volume={FINAL_LUFS - i_:.2f}dB,alimiter=limit={10 ** (MAX_TP_DB / 20):.3f}:attack=3:release=60:level=0",
            "-ar", str(SR), str(fin)])
    fin.replace(w)
    mi.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(w), "-codec:a", "libmp3lame", "-b:a", "192k",
            str(out / "episode_final.mp3")])
    li, tp = mi.measure(w)
    fx = mi.read_wav(w)

    # Отчёт
    def mmss(s):
        return f"{int(s // 60)}:{s % 60:04.1f}"
    (out / "episode_timeline.txt").write_text(
        f"0:00.0  интро (ваш голос ×1.25 + музыка)\n{mmss(t_ep)}  эпизод (×{speed}, без лишних пауз)\n"
        f"{mmss(t_out)}  закрывающий джингл\n{mmss(total / SR)}  конец\n", encoding="utf-8")
    print(f"исходная запись: {len(xr) / SR:.1f} с; речь {s0:.1f}-{s1:.1f} с; шум ≈{noise:.0f} дБ (nf={nf})")
    print(f"длинных пауз (>{PAUSE_MIN} с): {st['n_runs']} шт, всего {st['pause_total']:.1f} с; "
          f"убрано всего {st['removed']:.1f} с (включая тишину по краям); осталось по {PAUSE_KEEP} с на паузу")
    runs_after = find_pauses(xp, 0.30)[0]
    print(f"после сокращения: пауз дольше 0,30 с: {len(runs_after)} шт; длина {len(xp) / SR:.1f} с")
    print(f"после ускорения ×{speed}: {len(xf_) / SR:.1f} с")
    print(f"эхо комнаты (хвост после слов): {ve.tail_time(xr)[0]:.0f} мс до, {ve.tail_time(xc)[0]:.0f} мс после")
    pb, pa = ve.band_profile(xr), ve.band_profile(xc)
    key = "бубнёж (80-250 Гц)"
    print(f"«бубнёж» 80-250 Гц: {pb[key]:+.1f} дБ до, {pa[key]:+.1f} дБ после")
    pf = ve.band_profile(voice)
    print(f"в готовом голосе (после выравнивания громкости): «бубнёж» {pf[key]:+.1f} дБ, хвост эха {ve.tail_time(voice)[0]:.0f} мс")
    print(f"итог: {total / SR:.1f} с ({mmss(total / SR)}), {li:.1f} LUFS, истинный пик {tp:.1f} дБ, "
          f"клиппинг {int((abs(fx) > 0.999).sum())} отсч., NaN: {bool(np.isnan(fx).any())}")
    # проверка стыков: максимальный скачок соседних отсчётов у стыков против обычной речи
    d = np.abs(np.diff(xp))
    sm = [d[max(0, s - 144):s + 144].max() for s in st["seams"]]
    print(f"стыков: {len(sm)}; максимальный скачок у стыка {max(sm) if sm else 0:.4f} против 99-го перцентиля речи {np.percentile(d, 99):.4f}")
    for f in ("_raw", "_enh", "_clean", "_nopause", "_fast", "_trim", "_jc48"):
        (out / f"{f}.wav").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
