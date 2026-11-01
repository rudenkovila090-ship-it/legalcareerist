#!/usr/bin/env python3
"""Улучшение голоса: меньше «бубнящих» басов и меньше эха комнаты.

Что внутри:
  * band_profile  - сколько энергии в разных частотных полосах (индекс «бубнёжа»).
  * tail_time     - как быстро звук затухает после слов (чем дольше, тем больше комнатного эха).
  * dereverb      - подавление «хвоста» реверберации спектральным методом (Lebart): для каждого
                    момента оценивается, сколько осталось от предыдущего звука, и это вычитается.
  * tame_lows     - динамическое сжатие нижней полосы (до ~200 Гц): когда бас «выпирает»
                    (эффект близости микрофона, резонанс комнаты), его уровень прижимается.
Все функции работают с моно-массивом float при 48 кГц.
"""
import numpy as np

SR = 48000


def rc(x):
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def _frames_db(x, win=0.01):
    k = int(SR * win)
    m = len(x) // k
    return 20 * np.log10(np.sqrt((x[: m * k].reshape(m, k) ** 2).mean(axis=1)) + 1e-9), win


def band_profile(x):
    """Энергия по полосам в дБ относительно полосы 1-4 кГц, только по кадрам с речью."""
    db, _ = _frames_db(x, 0.05)
    noise = np.percentile(db, 10)
    n_fft, hop = 4096, 2048
    spec, cnt = 0.0, 0
    w = np.hanning(n_fft)
    for i in range(0, len(x) - n_fft, hop):
        j = min(int(i / (0.05 * SR)), len(db) - 1)
        if db[j] > noise + 14:
            spec = spec + np.abs(np.fft.rfft(x[i:i + n_fft] * w)) ** 2
            cnt += 1
    f = np.fft.rfftfreq(n_fft, 1 / SR)
    bands = {"60-120": (60, 120), "120-250": (120, 250), "250-500": (250, 500), "0.5-1k": (500, 1000),
             "1-4k": (1000, 4000), "4-8k": (4000, 8000)}
    e = {k: 10 * np.log10(spec[(f >= lo) & (f < hi)].sum() + 1e-12) for k, (lo, hi) in bands.items()}
    ref = e["1-4k"]
    prof = {k: round(v - ref, 1) for k, v in e.items()}
    prof["бубнёж (80-250 Гц)"] = round(10 * np.log10(spec[(f >= 80) & (f < 250)].sum() + 1e-12) - ref, 1)
    return prof


def tail_time(x, drop_db=12.0):
    """Медианное время (мс), за которое уровень падает на drop_db после громких фрагментов речи.
    Чем больше значение, тем сильнее хвост реверберации. Для сравнения «до/после», а не абсолют."""
    db, win = _frames_db(x, 0.005)
    db = np.convolve(db, np.ones(3) / 3, mode="same")
    noise = np.percentile(db, 10)
    loud = db > noise + 30
    times = []
    i = 0
    while i < len(db) - 2:
        if loud[i] and not loud[i + 1]:
            lvl = db[max(0, i - 4):i + 1].max()
            k = i + 1
            while k < len(db) and db[k] > lvl - drop_db and k - i < 100:
                k += 1
            if k < len(db) and db[k] <= lvl - drop_db:
                times.append((k - i) * win * 1000)
        i += 1
    return (float(np.median(times)) if times else float("nan")), len(times)


def _stft(x, n_fft=1536, hop=384):
    w = np.sqrt(np.hanning(n_fft))
    xp = np.pad(x, (n_fft, n_fft))
    frames = np.lib.stride_tricks.sliding_window_view(xp, n_fft)[::hop]
    return np.fft.rfft(frames * w, axis=1), w, hop, n_fft, len(xp)


def _istft(X, w, hop, n_fft, length, n_out):
    frames = np.fft.irfft(X, n=n_fft, axis=1) * w
    y = np.zeros(length)
    norm = np.zeros(length)
    for i, fr in enumerate(frames):
        y[i * hop:i * hop + n_fft] += fr
        norm[i * hop:i * hop + n_fft] += w ** 2
    y /= np.maximum(norm, 1e-8)
    return y[n_fft:n_fft + n_out]


def dereverb(x, rt60=0.45, gamma=0.8, gmin=0.30, delay_s=0.05):
    """Подавление позднего «хвоста» реверберации. gmin - предел ослабления (0.30 = -10 дБ).
    Мягкие значения: сильнее подавление даёт «водянистый» голос."""
    X, w, hop, n_fft, length = _stft(x)
    P = np.abs(X) ** 2
    kern = np.ones(5) / 5
    Ps = np.apply_along_axis(lambda r: np.convolve(r, kern, mode="same"), 1, P)
    nd = max(1, int(round(delay_s * SR / hop)))
    decay = 10 ** (-6.0 * (nd * hop / SR) / rt60)
    lam = np.zeros_like(P)
    lam[nd:] = decay * Ps[:-nd]
    G = np.maximum(1.0 - gamma * lam / (P + 1e-12), gmin)
    Gs = G.copy()
    for t in range(1, len(G)):                      # лёгкое сглаживание по времени против «водянистости»
        Gs[t] = 0.5 * Gs[t - 1] + 0.5 * G[t]
    Gs = np.apply_along_axis(lambda r: np.convolve(r, np.ones(3) / 3, mode="same"), 1, Gs)
    return _istft(X * Gs, w, hop, n_fft, length, len(x)), float(np.mean(20 * np.log10(Gs)))


def tame_lows(x, f_lo=150.0, f_hi=260.0, ratio=2.2, attack=0.02, release=0.15, thr_percentile=65):
    """Сжатие нижней полосы: когда бас громче своего обычного уровня, прижимаем его."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    low = np.fft.irfft(X * (1 - rc((f - f_lo) / (f_hi - f_lo))), len(x))
    high = x - low
    k = int(SR * 0.01)
    m = len(low) // k
    env = 20 * np.log10(np.sqrt((low[: m * k].reshape(m, k) ** 2).mean(axis=1)) + 1e-9)
    noise = np.percentile(env, 10)
    thr = np.percentile(env[env > noise + 12], thr_percentile)
    red = np.where(env > thr, (env - thr) * (1 - 1 / ratio), 0.0)
    sm = np.zeros_like(red)
    a_att, a_rel = np.exp(-0.01 / attack), np.exp(-0.01 / release)
    for i in range(1, len(red)):                    # атака быстрая, возврат плавный
        coef = a_att if red[i] > sm[i - 1] else a_rel
        sm[i] = coef * sm[i - 1] + (1 - coef) * red[i]
    gain = 10 ** (-sm / 20)
    g = np.interp(np.arange(len(low)), (np.arange(m) + 0.5) * k, gain)
    return high + low * g, float(sm.max()), float(sm[env > thr].mean() if (env > thr).any() else 0.0)


def enhance(x, rt60=None, gamma=0.8, gmin=0.30, low_ratio=2.2, low_thr=65, delay_s=0.05):
    """Подавление эха комнаты и сжатие «выпирающих» басов. Возвращает массив и справку.
    Сила: gamma/gmin (эхо), low_ratio/low_thr (басы; ниже порог = сильнее сжатие)."""
    t_before, n_off = tail_time(x)
    if rt60 is None:
        rt60 = float(np.clip(5 * t_before / 1000, 0.35, 0.8)) if not np.isnan(t_before) else 0.45
    y, mean_g = dereverb(x, rt60=rt60, gamma=gamma, gmin=gmin, delay_s=delay_s)
    y, max_red, mean_red = tame_lows(y, ratio=low_ratio, thr_percentile=low_thr)
    return y, dict(rt60=rt60, mean_gain_db=mean_g, bass_max_reduction=max_red, bass_mean_reduction=mean_red,
                   tail_before=t_before, offsets=n_off)
