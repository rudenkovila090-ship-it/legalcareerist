#!/usr/bin/env python3
"""Сведение интро подкаста: голос ведущего + музыка, которая играет всё время, пока он говорит.

Что делает:
  1. Голос: убирает гул, подавляет шум (уровень шума оценивается по самой записи), добавляет
     немного «присутствия», выравнивает динамику и громкость (с ограничителем пиков).
  2. Автоматически находит начало и конец речи, обрезает лишнюю тишину.
  3. Строит подложку (make_bed): джингл продолжается лёгким движением и приходит к финальному
     аккорду ровно к концу речи. Длина подложки подгоняется под запись.
  4. Музыка под голосом держится на фиксированной разнице от голоса (по умолчанию 14 дБ ниже),
     после последнего слова плавно «расцветает» и тает.
  5. Итог выравнивается до -16 LUFS (стандарт подкастов), пик не выше -1.5 дБ.

Запуск:
  python3 -I mix_intro.py голос.m4a папка_вывода
Результат: intro_mix.mp3/.wav (голос + музыка) и intro_voice_only.mp3 (только голос, для сравнения).
"""
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "jingle"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_jingle as mj  # noqa: E402
import voice_enhance as ve  # noqa: E402
from make_bed import make_bed, pocket  # noqa: E402

SR = 48000
VOICE_LUFS = -17.0       # голос перед сведением
FINAL_LUFS = -16.0       # итог
BED_LUFS = -20.0         # подложка до приглушения
MAX_TP_DB = -1.5
VOICE_ENTRY = 2.3        # секунда итогового файла, где начинается запись голоса
PREROLL = 0.25           # комнатная тишина перед первым словом
TAIL = 0.5               # пауза после последнего слова
MUSIC_BELOW_VOICE_DB = 14.0   # насколько музыка тише голоса, пока он говорит (меньше = музыка заметнее)
DUCK_START, DUCK_END = 2.2, 3.4


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg error: {r.stderr[-800:]}")


def measure(path):
    r = subprocess.run(["ffmpeg", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    s = r.stderr.split("Summary:")[-1]
    return (float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1)),
            float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", s).group(1)))


def read_wav(path):
    with wave.open(str(path)) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
        return x.reshape(-1, w.getnchannels())


def write_wav(path, x, sr=SR):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def envelope_db(x, win=0.05):
    n = int(SR * win)
    k = len(x) // n
    return 20 * np.log10(np.sqrt((x[: k * n].reshape(k, n) ** 2).mean(axis=1)) + 1e-9), win


def speech_span(x):
    """Начало и конец речи: порог на 14 дБ выше уровня шума (10-й процентиль огибающей)."""
    db, win = envelope_db(x)
    noise = np.percentile(db, 10)
    idx = np.where(db > noise + 14)[0]
    return idx[0] * win, (idx[-1] + 1) * win, noise


def speech_rms_db(x):
    db, _ = envelope_db(x)
    noise = np.percentile(db, 10)
    act = db[db > noise + 14]
    return 10 * np.log10(np.mean(10 ** (act / 10)))


def snr_db(x):
    db, _ = envelope_db(x)
    noise = np.percentile(db, 10)
    return np.median(db[db > noise + 14]) - noise


def rc(x):
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def level_voice(src, dst, target):
    """Поднимает громкость до цели через мягкую компрессию и ограничитель пиков."""
    lufs, _ = measure(src)
    g1 = target + 2.0 - lufs
    tmp = Path(str(dst) + ".tmp.wav")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af",
         f"volume={g1:.2f}dB,acompressor=threshold=-24dB:ratio=2.5:attack=12:release=160:makeup=1,"
         f"alimiter=limit=0.84:attack=3:release=60:level=0", "-ar", str(SR), str(tmp)])
    l2, _ = measure(tmp)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-af",
         f"volume={target - l2:.2f}dB,alimiter=limit=0.84:attack=3:release=60:level=0", "-ar", str(SR), str(dst)])
    tmp.unlink(missing_ok=True)


def main():
    voice_in, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    # 1. Чистка голоса
    raw, clean = out / "_voice_raw.wav", out / "_voice_clean.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(voice_in), "-ac", "1", "-ar", str(SR), str(raw)])
    xr = read_wav(raw)[:, 0]
    s0, s1, noise = speech_span(xr)
    nf = int(np.clip(round(noise - 2), -80, -30))
    xe, info = ve.enhance(xr)                      # меньше эха комнаты и «бубнящих» басов
    enh = out / "_voice_enh.wav"
    write_wav(enh, xe[:, None])
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(enh), "-af",
         f"highpass=f=80,afftdn=nr=10:nf={nf}:tn=1,"
         "equalizer=f=300:width_type=q:width=1:g=-1.5,equalizer=f=3500:width_type=q:width=1:g=2",
         "-ar", str(SR), str(clean)])
    xc = read_wav(clean)[:, 0]
    a, b = max(0.0, s0 - PREROLL), min(len(xc) / SR, s1 + TAIL)
    v = xc[int(a * SR): int(b * SR)].copy()
    fi, fo = int(0.1 * SR), int(0.4 * SR)
    v[:fi] *= rc(np.linspace(0, 1, fi))
    v[-fo:] *= 1 - rc(np.linspace(0, 1, fo))
    trimmed, leveled = out / "_voice_trim.wav", out / "_voice_leveled.wav"
    write_wav(trimmed, v[:, None])
    level_voice(trimmed, leveled, VOICE_LUFS)
    voice = read_wav(leveled)[:, 0]

    # 2. Подложка под длину речи
    word_end = VOICE_ENTRY + (s1 - a)          # конец последнего слова в итоговом файле
    resolve_at = word_end - 0.2
    bed = make_bed(resolve_at)
    bed44 = out / "_bed44.wav"
    mj.write_wav(bed44, bed / np.max(np.abs(bed)) * 0.5)
    lb, _ = measure(bed44)
    mj.write_wav(bed44, bed / np.max(np.abs(bed)) * 0.5 * 10 ** ((BED_LUFS - lb) / 20))
    bed48 = out / "_bed48.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(bed44), "-ar", str(SR), "-ac", "2", str(bed48)])
    bed = read_wav(bed48)

    total = len(bed)
    t = np.arange(total) / SR
    i0 = int(VOICE_ENTRY * SR)

    # 3. Приглушение музыки под голосом: фиксированная разница от голоса
    # «Карман» для голоса: под речью убираем у музыки глубокие низы и часть области 150-500 Гц
    w_p = rc((t - DUCK_START) / (DUCK_END - DUCK_START)) * (1 - rc((t - (word_end - 0.1)) / 0.8))
    bed = bed * (1 - w_p[:, None]) + pocket(bed, SR) * w_p[:, None]
    mid = bed[int((VOICE_ENTRY + 1) * SR): int((word_end - 1) * SR)]
    bed_rms = 10 * np.log10(np.mean(mid ** 2) + 1e-12)
    duck_db = float(np.clip(speech_rms_db(voice) - MUSIC_BELOW_VOICE_DB - bed_rms, -20.0, -3.0))
    down = rc((t - DUCK_START) / (DUCK_END - DUCK_START))
    up = rc((t - (word_end - 0.1)) / 0.8)
    curve = 10 ** (duck_db * down * (1 - up) / 20)
    music = bed * curve[:, None]
    voice_track = np.zeros((total, 2))
    n = min(len(voice), total - i0)
    voice_track[i0: i0 + n] = voice[:n, None]
    mix = music + voice_track

    # 4. Итоговая громкость
    for name, sig in (("intro_mix", mix), ("intro_voice_only", voice_track)):
        w = out / f"{name}.wav"
        write_wav(w, sig / max(1.0, np.max(np.abs(sig))) * 0.8)
        i_, _ = measure(w)
        final = out / f"{name}_final.wav"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(w), "-af",
             f"volume={FINAL_LUFS - i_:.2f}dB,alimiter=limit={10 ** (MAX_TP_DB / 20):.3f}:attack=3:release=60:level=0",
             "-ar", str(SR), str(final)])
        final.replace(w)
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(w), "-codec:a", "libmp3lame", "-b:a", "192k",
             str(out / f"{name}.mp3")])
        li, tp = measure(w)
        print(f"{name}: {total / SR:.1f} с, {li:.1f} LUFS, истинный пик {tp:.1f} дБ")

    # Отчёт
    print(f"речь в исходнике {s0:.1f}-{s1:.1f} с; шум ≈{noise:.0f} дБ (параметр шумоподавления nf={nf})")
    print(f"отношение речь/шум: до {snr_db(xr):.0f} дБ, после чистки {snr_db(xc):.0f} дБ")
    tb, _ = ve.tail_time(xr)
    ta, _ = ve.tail_time(xc)
    pb, pa = ve.band_profile(xr), ve.band_profile(xc)
    key = "бубнёж (80-250 Гц)"
    print(f"эхо комнаты (хвост звука после слов): {tb:.0f} мс до, {ta:.0f} мс после (RT60 для подавления ≈{info['rt60']:.2f} с)")
    print(f"«бубнёж» 80-250 Гц относительно речевой середины: {pb[key]:+.1f} дБ до, {pa[key]:+.1f} дБ после")
    print(f"полосы после: { {k: float(v) for k, v in pa.items()} }")
    print(f"последнее слово заканчивается на {word_end:.1f} с, финальный аккорд подложки на {resolve_at:.1f} с")
    print(f"музыка приглушена на {-duck_db:.1f} дБ относительно своей громкости (≈{MUSIC_BELOW_VOICE_DB:.0f} дБ ниже голоса)")
    print("музыка относительно голоса по ходу интро:")
    w = int(5 * SR)
    for k in range(0, total - w + 1, w):
        mv = np.sqrt(np.mean(voice_track[k:k + w] ** 2) + 1e-12)
        mm = np.sqrt(np.mean(music[k:k + w] ** 2) + 1e-12)
        print(f"  {k / SR:4.0f}-{(k + w) / SR:4.0f} с: музыка {20 * np.log10(mm / mv):+.0f} дБ от голоса"
              if mv > 1e-3 else f"  {k / SR:4.0f}-{(k + w) / SR:4.0f} с: только музыка")
    for f in ("_voice_raw", "_voice_enh", "_voice_clean", "_voice_trim", "_voice_leveled", "_bed44", "_bed48"):
        (out / f"{f}.wav").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
