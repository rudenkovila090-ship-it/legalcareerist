// Типы готового модуля radio-fx.js (RadioFX: звук лампового радио на Web Audio API) — только то, чем пользуется сайт.
export interface RadioFXStation {
  mhz: number
  /** Файл музыки станции (играет по кругу «в эфире» и проступает из шума, когда стрелка на станции). */
  src?: string
}

export interface RadioFXOptions {
  /** Папка с clicks/, с закрывающим слешем. */
  baseUrl?: string
  stations?: RadioFXStation[]
  /** Слабые несущие: дают свист, но музыки на них нет. */
  ghosts?: number[]
  range?: [number, number]
  volume?: number
  stationVolume?: number
  idleStatic?: number
  lockWidth?: number
  tickStep?: number
  storageKey?: string
  onSignal?: (signal: number, station: number) => void
}

export type RadioDialMode = 'motor' | 'knob'
export type RadioClickKind = 'preset' | 'key' | 'seek'

declare class RadioFX {
  constructor(opts?: RadioFXOptions)
  muted: boolean
  /** Включает звук. Вызывать синхронно из клика или касания. */
  open(): Promise<void>
  /** Плавно затихает и останавливается. */
  close(): void
  /** Поставить стрелку без звука движения. */
  jump(mhz: number): void
  /** Положение стрелки на каждом кадре движения. mode: 'knob' добавляет щелчки ручки. */
  setDial(mhz: number, at?: number, mode?: RadioDialMode): void
  click(kind: RadioClickKind): void
  release(kind: RadioClickKind): void
  setInterference(level: number): void
  interferenceBurst(ms?: number): void
  getSignal(mhz?: number): number
  setVolume(volume: number): void
  setMuted(muted: boolean): boolean
  isPlaying(): boolean
}

export default RadioFX
