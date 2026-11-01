#!/usr/bin/env python3
"""Сведение интро подкаста: голос ведущего + подложка джингла.

Что делает:
  1. Голос: убирает гул (фильтр низких), подавляет фоновый шум, слегка выравнивает динамику,
     находит начало и конец речи автоматически, обрезает лишнюю тишину.
  2. Поднимает голос до целевой громкости (с ограничителем пиков, без клиппинга).
  3. Кладёт под голос подложку: джингл звучит один, голос входит после «лестницы», музыка
     плавно приглушается и уходит на второй план.
  4. Выравнивает итог до -16 LUFS (стандарт подкастов), пик не выше -1.5 дБ.

Запуск:
  python3 mix_intro.py голос.m4a папка_вывода [подложка.wav]
Результат: intro_mix.mp3/.wav (голос + музыка) и intro_voice_only.mp3 (только голос, для сравнения).
"""
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
VOICE_LUFS = -17.0      # голос перед сведением
FINAL_LUFS = -16.0      # итог
MAX_TP_DB = -1.5
VOICE_ENTRY = 2.3       # секунда итогового файла, где начинается запись голоса (с короткой «тишиной» перед речью)
PREROLL = 0.25          # сколько оставить комнатной тишины перед первым словом
TAIL = 0.5              # сколько оставить после последнего слова
DUCK_DB = -10.0         # на сколько приглушаем музыку под голосом (меньше по модулю = музыка заметнее)
DUCK_START, DUCK_END = 2.2, 3.4


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg error: {r.stderr[-800:]}")
    return r


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


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def envelope_db(x, win=0.05):
    n = int(SR * win)
    k = len(x) // n
    return 20 * np.log10(np.sqrt((x[: k * n].reshape(k, n) ** 2).mean(axis=1)) + 1e-9), win


def speech_span(x):
    """Начало и конец речи по огибающей: порог на 14 дБ выше уровня шума комнаты."""
    db, win = envelope_db(x)
    noise = np.percentile(db, 10)
    idx = np.where(db > noise + 14)[0]
    return idx[0] * win, (idx[-1] + 1) * win, noise


def snr_db(x):
    db, _ = envelope_db(x)
    noise = np.percentile(db, 10)
    speech = np.median(db[db > noise + 14])
    return speech - noise


def rc(x):
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def to_mp3(wav, mp3):
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "192k", str(mp3)])


def main():
    voice_in = Path(sys.argv[1])
    out = Path(sys.argv[2])
    bed_path = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).parent.parent / "jingle" / "jingle_bed.wav"
    out.mkdir(parents=True, exist_ok=True)

    # 1. Чистка голоса
    raw = out / "_voice_raw.wav"
    clean = out / "_voice_clean.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(voice_in), "-ac", "1", "-ar", str(SR), str(raw)])
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af",
         "highpass=f=80,afftdn=nr=12:nf=-66:tn=1,"
         "acompressor=threshold=-38dB:ratio=3:attack=10:release=150:makeup=1",
         "-ar", str(SR), str(clean)])
    xr, xc = read_wav(raw)[:, 0], read_wav(clean)[:, 0]
    s0, s1, noise = speech_span(xr)
    a, b = max(0.0, s0 - PREROLL), min(len(xc) / SR, s1 + TAIL)
    v = xc[int(a * SR): int(b * SR)]
    fi, fo = int(0.1 * SR), int(0.4 * SR)
    v[:fi] *= rc(np.linspace(0, 1, fi))
    v[-fo:] *= 1 - rc(np.linspace(0, 1, fo))
    trimmed = out / "_voice_trim.wav"
    write_wav(trimmed, v[:, None])

    # 2. Громкость голоса
    lufs, _ = measure(trimmed)
    gain = VOICE_LUFS - lufs
    leveled = out / "_voice_leveled.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(trimmed), "-af",
         f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=3:release=60:level=0", "-ar", str(SR), str(leveled)])
    voice = read_wav(leveled)[:, 0]

    # 3. Подложка
    bed48 = out / "_bed48.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(bed_path), "-ar", str(SR), "-ac", "2", str(bed48)])
    bed = read_wav(bed48)
    total = int((VOICE_ENTRY + len(voice) / SR) * SR)
    t = np.arange(total) / SR
    duck = 10 ** (DUCK_DB / 20)
    gain_curve = 1 - (1 - duck) * rc((t - DUCK_START) / (DUCK_END - DUCK_START))
    music = np.zeros((total, 2))
    n = min(len(bed), total)
    music[:n] = bed[:n]
    music *= gain_curve[:, None]
    mix = music.copy()
    i = int(VOICE_ENTRY * SR)
    mix[i: i + len(voice)] += voice[:, None]
    voice_only = np.zeros((total, 2))
    voice_only[i: i + len(voice)] = voice[:, None]

    # 4. Итоговая громкость
    for name, sig in (("intro_mix", mix), ("intro_voice_only", voice_only)):
        w = out / f"{name}.wav"
        write_wav(w, sig / max(1.0, np.max(np.abs(sig))) * 0.8)
        i_, _ = measure(w)
        g = 10 ** ((FINAL_LUFS - i_) / 20)
        final = out / f"{name}_final.wav"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(w), "-af",
             f"volume={20 * np.log10(g):.2f}dB,alimiter=limit={10 ** (MAX_TP_DB / 20):.3f}:attack=3:release=60:level=0",
             "-ar", str(SR), str(final)])
        final.replace(w)
        to_mp3(w, out / f"{name}.mp3")
        li, tp = measure(w)
        print(f"{name}: {len(sig) / SR:.1f} с, {li:.1f} LUFS, истинный пик {tp:.1f} дБ")

    print(f"речь: {s0:.2f}-{s1:.2f} с в исходнике; шум до чистки {noise:.0f} дБ")
    print(f"отношение речь/шум: до {snr_db(xr):.0f} дБ, после чистки {snr_db(xc):.0f} дБ")
    for f in ("_voice_raw", "_voice_clean", "_voice_trim", "_voice_leveled", "_bed48"):
        (out / f"{f}.wav").unlink(missing_ok=True)


if __name__ == "__main__":
    main()
