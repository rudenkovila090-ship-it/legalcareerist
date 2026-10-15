// Нуарный саундтрек карточки мероприятия: пять синхронных слоёв одной композиции и акцент «разгадка».
// Чем ниже прокручена страница, тем больше слоёв и тревоги: щётки → труба → напряжение → кульминация,
// а в самом низу звучит короткий акцент. Работает на Web Audio API, без зависимостей.
// Алгоритм и параметры — из готового скрипта case-soundtrack.js (аудио не менялось).

const STEMS = ['bed', 'brushes', 'trumpet', 'tension', 'climax'] as const
type Stem = (typeof STEMS)[number]
type Gains = Record<Stem, number>

// Диапазоны прокрутки (0 = верх, 1 = низ), в которых слой плавно набирает громкость.
const RANGES: Record<Exclude<Stem, 'bed'>, [number, number]> = {
  brushes: [0.12, 0.35], // щётки: появляется ритм
  trumpet: [0.25, 0.5], // труба: появляется тема
  tension: [0.4, 0.8], // струнный кластер, часы, пульсация
  climax: [0.7, 0.95], // акценты, удары, нарастание
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Громкость каждого слоя для позиции прокрутки p (0..1). */
function gainsFor(p: number): Gains {
  const q = clamp01(p)
  return {
    bed: 0.8 + 0.2 * smooth(0, 0.3, q),
    brushes: smooth(...RANGES.brushes, q),
    trumpet: smooth(...RANGES.trumpet, q),
    tension: smooth(...RANGES.tension, q),
    climax: smooth(...RANGES.climax, q),
  }
}

function setParam(param: AudioParam, value: number, t: number, timeConstant: number) {
  if (!timeConstant) {
    param.cancelScheduledValues(t)
    param.setValueAtTime(value, t)
  } else {
    param.setTargetAtTime(value, t, timeConstant)
  }
}

async function fetchBuffer(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.arrayBuffer()
}

function readMuted(key: string) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeMuted(key: string, muted: boolean) {
  try {
    localStorage.setItem(key, muted ? '1' : '0')
  } catch {
    // приватный режим: выбор просто не запомнится
  }
}

export interface CaseSoundtrackOptions {
  /** Папка с mp3, с закрывающим слешем. */
  baseUrl: string
  /** Общая громкость 0..1. */
  volume?: number
  /** Глубина прокрутки, на которой срабатывает «разгадка». */
  revealAt?: number
  onReveal?: () => void
  storageKey?: string
}

export class CaseSoundtrack {
  muted: boolean
  isOpen = false
  progress = 0

  private readonly sources: Record<Stem | 'reveal', string>
  private volume: number
  private readonly revealAt: number
  private readonly onReveal: (() => void) | null
  private readonly storageKey: string

  private ctx: AudioContext | null = null
  private buffers: Record<string, AudioBuffer> | null = null
  private loading: Promise<void> | null = null
  private playing = false
  private nodes: AudioBufferSourceNode[] = []
  private nextStart = 0
  private interval: number | null = null
  private stopTimer: number | null = null
  private duck = 1
  private duckTimer: number | null = null
  private revealed = false

  private stemGain = {} as Record<Stem, GainNode>
  private lp!: BiquadFilterNode
  private master!: GainNode
  private revealGain!: GainNode

  constructor(opts: CaseSoundtrackOptions) {
    const base = opts.baseUrl
    this.sources = {
      bed: `${base}bed.mp3`,
      brushes: `${base}brushes.mp3`,
      trumpet: `${base}trumpet.mp3`,
      tension: `${base}tension.mp3`,
      climax: `${base}climax.mp3`,
      reveal: `${base}reveal.mp3`,
    }
    this.volume = clamp01(opts.volume ?? 0.7)
    this.revealAt = opts.revealAt ?? 0.97
    this.onReveal = opts.onReveal ?? null
    this.storageKey = opts.storageKey ?? 'caseSoundtrackMuted'
    this.muted = readMuted(this.storageKey)

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || !this.playing) return
      if (document.hidden) void this.ctx.suspend()
      else if (this.isOpen) void this.ctx.resume()
    })
  }

  private buildGraph() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) throw new Error('Web Audio API не поддерживается')
    const ctx = (this.ctx = new AC())

    this.lp = ctx.createBiquadFilter() // «яркость»: с прокруткой фильтр открывается
    this.lp.type = 'lowpass'
    this.lp.Q.value = 0.7
    this.lp.frequency.value = 1600
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.revealGain = ctx.createGain()

    for (const name of STEMS) {
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(this.lp)
      this.stemGain[name] = g
    }
    this.lp.connect(this.master)
    this.revealGain.connect(this.master) // акцент идёт мимо фильтра
    this.master.connect(ctx.destination)
  }

  private load() {
    if (this.buffers) return Promise.resolve()
    if (this.loading) return this.loading
    const ctx = this.ctx
    if (!ctx) return Promise.resolve()
    const names = Object.keys(this.sources) as (Stem | 'reveal')[]
    this.loading = Promise.all(
      names.map(async (n) => {
        const buf = await ctx.decodeAudioData(await fetchBuffer(this.sources[n]))
        return [n, buf] as const
      }),
    ).then(
      (pairs) => {
        this.buffers = Object.fromEntries(pairs)
      },
      (err) => {
        this.loading = null
        throw err
      },
    )
    return this.loading
  }

  /** Заранее подгрузить файлы (например, когда карточка попала в зону видимости). */
  preload() {
    if (!this.ctx) this.buildGraph()
    return this.load()
  }

  private applyMaster(slow: boolean) {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, slow ? 0.6 : 0.08)
  }

  private scheduleCycle() {
    const ctx = this.ctx
    const buffers = this.buffers
    if (!ctx || !buffers) return
    const when = this.nextStart
    const cycle = STEMS.map((name) => {
      const s = ctx.createBufferSource()
      s.buffer = buffers[name]
      s.connect(this.stemGain[name])
      s.start(when) // все слои стартуют в один и тот же момент: синхронно
      return s
    })
    this.nodes = this.nodes.concat(cycle)
    cycle[0].onended = () => {
      this.nodes = this.nodes.filter((n) => !cycle.includes(n))
    }
    this.nextStart = when + buffers.bed.duration
  }

  private startPlayback() {
    if (!this.ctx) return
    this.playing = true
    this.nextStart = this.ctx.currentTime + 0.1
    this.scheduleCycle()
    // композиция длится ~94 с; за 3 с до конца ставим в расписание следующий круг
    this.interval = window.setInterval(() => {
      if (this.ctx && this.ctx.currentTime > this.nextStart - 3) this.scheduleCycle()
    }, 500)
    this.setProgress(this.progress, true)
    this.applyMaster(true)
  }

  /** Запускает музыку. Вызывать синхронно из обработчика клика или касания, иначе браузер заблокирует звук. */
  open() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
      this.stopTimer = null
    }
    this.isOpen = true
    try {
      if (!this.ctx) this.buildGraph()
    } catch (e) {
      console.warn('CaseSoundtrack:', e instanceof Error ? e.message : e)
      return Promise.resolve()
    }
    const resumed = this.ctx?.resume() // вызывается синхронно, внутри клика
    if (this.playing) {
      // закрыли и сразу открыли снова
      this.applyMaster(true)
      this.setProgress(this.progress)
      return Promise.resolve()
    }
    return Promise.resolve(resumed)
      .then(() => this.load())
      .then(() => {
        if (!this.isOpen || this.playing) return
        this.startPlayback()
      })
      .catch((err) => console.warn('CaseSoundtrack:', err))
  }

  /** p: 0 = верх страницы, 1 = низ. */
  setProgress(p: number, immediate = false) {
    this.progress = clamp01(p)
    if (!this.ctx || !this.playing) return

    const g = gainsFor(this.progress)
    const t = this.ctx.currentTime
    const k = immediate ? 0 : 0.35
    for (const name of STEMS) setParam(this.stemGain[name].gain, g[name] * this.duck, t, k)
    // 1.6 кГц (глухо, «из соседней комнаты») → 14 кГц (чётко): картина проясняется
    setParam(this.lp.frequency, 1600 * Math.pow(14000 / 1600, this.progress), t, immediate ? 0 : 0.4)

    if (this.progress >= this.revealAt && !this.revealed) this.playReveal()
    else if (this.progress < this.revealAt - 0.08) this.revealed = false
  }

  private playReveal() {
    this.revealed = true
    if (this.ctx && this.buffers?.reveal) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.buffers.reveal
      src.connect(this.revealGain)
      src.start()
      // пока звучит акцент, слои приглушаем, затем возвращаем
      this.duck = 0.35
      this.setProgress(this.progress)
      if (this.duckTimer) clearTimeout(this.duckTimer)
      this.duckTimer = window.setTimeout(() => {
        this.duck = 1
        this.setProgress(this.progress)
      }, 5500)
    }
    this.onReveal?.()
  }

  private stop() {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
    for (const n of this.nodes) {
      try {
        n.stop()
      } catch {
        // уже остановлен
      }
      try {
        n.disconnect()
      } catch {
        // уже отключён
      }
    }
    this.nodes = []
    this.playing = false
    this.revealed = false
    this.duck = 1
    if (this.duckTimer) clearTimeout(this.duckTimer)
    this.stopTimer = null
    if (this.ctx) void this.ctx.suspend()
  }

  /** Плавное затухание и остановка. */
  close() {
    if (!this.isOpen) return
    this.isOpen = false
    if (!this.ctx || !this.playing) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setTargetAtTime(0, t, 0.25)
    this.stopTimer = window.setTimeout(() => this.stop(), 1500)
  }

  isPlaying() {
    return this.playing && this.isOpen
  }

  setVolume(v: number) {
    this.volume = clamp01(v)
    if (this.playing && this.isOpen) this.applyMaster(false)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    writeMuted(this.storageKey, muted)
    if (this.playing && this.isOpen) this.applyMaster(false)
    return this.muted
  }

  toggleMuted() {
    return this.setMuted(!this.muted)
  }

  /** Привязка к прокрутке: контейнер (окно) или вся страница, если el не задан. Возвращает функцию отвязки. */
  bindScroll(el?: HTMLElement) {
    const target: HTMLElement | Window = el ?? window
    const scroller = el ?? document.scrollingElement ?? document.documentElement
    const onScroll = () => {
      const max = scroller.scrollHeight - scroller.clientHeight
      this.setProgress(max > 0 ? scroller.scrollTop / max : 0)
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => target.removeEventListener('scroll', onScroll)
  }
}
