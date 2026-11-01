import type { PointerEvent } from 'react'
import RadioFX, { type RadioClickKind, type RadioDialMode } from './radio-fx.js'
import { eventMusic } from './eventMusic'

// Звук радио «Сюжета вечера»: щелчки клавиш, шум и свист между станциями, музыка на станциях актов.
// Один экземпляр на страницу; общий выключатель звука с фоновой музыкой вечера («Музыка вечера» в углу страницы).
const BASE = `${import.meta.env.BASE_URL}audio/radio/`
const CLICKS = ['preset_down_1', 'preset_down_2', 'preset_up_1', 'key_down_1', 'key_down_2', 'key_down_3', 'key_up_1', 'seek_down_1', 'seek_up_1', 'knob_tick_1', 'knob_tick_2', 'knob_tick_3']
const STATIONS = ['st1', 'st2', 'st3']

interface RadioSetup {
  /** Частоты актов: на них играет музыка станции. */
  acts: number[]
  /** Частоты остальных волн: слабые несущие, на них слышен только свист и шум. */
  carriers: number[]
  range: [number, number]
}

let instance: RadioPanel | null = null

export function getRadioPanel({ acts, carriers, range }: RadioSetup) {
  if (instance) return instance
  const fx = new RadioFX({
    baseUrl: BASE,
    // Станций с музыкой три (как файлов); заготовки st1–st3 — временные, вместо них можно положить звук актов.
    stations: acts.slice(0, STATIONS.length).map((mhz, i) => ({ mhz, src: `${BASE}stations/${STATIONS[i]}.wav` })),
    ghosts: carriers,
    range,
    volume: 0.4,
    // Выбор «звук выключен» общий с фоновой музыкой: тот же ключ в браузере.
    storageKey: 'caseSoundtrackMuted',
  })
  const music = eventMusic()
  fx.setMuted(music.muted)
  music.subscribe(() => fx.setMuted(music.muted))
  instance = new RadioPanel(fx)
  return instance
}

let prefetched = false

/** Заранее кладёт звуки радио в кэш браузера (без воспроизведения), чтобы первый щелчок прозвучал без задержки. */
export function prefetchRadioAudio() {
  if (prefetched) return
  prefetched = true
  const urls = [...CLICKS.map((n) => `${BASE}clicks/${n}.wav`), ...STATIONS.map((n) => `${BASE}stations/${n}.wav`)]
  for (const url of urls) void fetch(url).catch(() => undefined)
}

const RELEASE_MS: Record<RadioClickKind, number> = { preset: 110, key: 90, seek: 120 }

/** Звук нажатия клавиши и её отпускания. Первое нажатие включает радио — щелчок прозвучит, как только оно запустится. */
export function radioPress(fx: RadioFX, kind: RadioClickKind) {
  const play = () => {
    fx.click(kind)
    window.setTimeout(() => fx.release(kind), RELEASE_MS[kind])
  }
  if (fx.isPlaying()) {
    play()
    return
  }
  void fx.open().then(() => {
    if (fx.isPlaying()) play()
  })
}

/** Пульт радио на странице: звук (fx) и признаки, по которым компонент решает, что и когда включать. */
export class RadioPanel {
  /** Радио уже включали нажатием — значит, можно снова включать, когда оно вернулось на экран. */
  touched = false
  /** Чем сейчас ведут стрелку: мотором (кнопки) или ручкой (с щелчками). */
  mode: RadioDialMode = 'motor'
  private fired = false
  readonly fx: RadioFX

  constructor(fx: RadioFX) {
    this.fx = fx
  }

  /** Нажатие на орган радио: включает звук и (если задан kind) щёлкает клавишей. */
  press(mode: RadioDialMode, kind?: RadioClickKind) {
    this.touched = true
    this.mode = mode
    if (kind) radioPress(this.fx, kind)
    else void this.fx.open()
  }

  /** Радио вернулось на экран: если им уже пользовались, звук возвращается. */
  resume() {
    if (this.touched) void this.fx.open()
  }

  /**
   * Звук нужен в момент нажатия, а не отпускания: мышь реагирует на pointerdown, касание (чтобы не щёлкало при прокрутке страницы)
   * и клавиатура — на click.
   */
  bind(action: () => void) {
    return {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType === 'touch' || e.button !== 0) return
        this.fired = true
        action()
      },
      onPointerLeave: () => {
        this.fired = false
      },
      onClick: () => {
        if (this.fired) {
          this.fired = false
          return
        }
        action()
      },
    }
  }
}
