import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { EventAct, RadioStation } from '../../data/eventStories'
import { prefersReducedMotion } from '../../lib/motion'
import { getRadioPanel, prefetchRadioAudio, type RadioPanel } from '../../lib/radioFx'
import { ShotOnView } from './ShotFx'
import '../../pages/events/noir.css'

// «Сюжет вечера» как автомагнитола: три волны — акты расследования, остальные — ночной эфир города.
// Настраиваться можно ручкой, кнопками поиска, клавишами-пресетами и стрелками клавиатуры; между волнами стрелка идёт по шкале, а экран «шипит».

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const MIN = 87.5
const MAX = 108.5
const pct = (f: number) => ((f - MIN) / (MAX - MIN)) * 100

interface Station {
  id: string
  kind: 'act' | 'extra'
  freq: number
  /** Подпись на клавише. */
  key: string
  name: string
  /** Только для актов. */
  title?: string
  paragraphs?: string[]
  sealed?: string
  /** Только для дополнительных волн. */
  description?: string
  silent?: boolean
}

function buildStations(acts: EventAct[], extras: RadioStation[]): Station[] {
  const list: Station[] = [
    ...acts.map((a, i): Station => ({ id: `act-${i}`, kind: 'act', freq: a.freq, key: ROMAN[i] ?? String(i + 1), name: `Акт ${ROMAN[i] ?? i + 1}`, title: a.title, paragraphs: a.paragraphs, sealed: a.sealed })),
    ...extras.map((e): Station => ({ id: e.id, kind: 'extra', freq: e.freq, key: e.short, name: e.name, description: e.description, silent: e.silent })),
  ]
  return list.sort((a, b) => a.freq - b.freq)
}

/**
 * Плавно «едет» к нужной частоте: цифры на шкале пролистываются, стрелка идёт по ней и чуть перескакивает цель.
 * На каждом кадре сообщает положение стрелки звуку радио (шум, свист и музыка считаются по нему), так что слышно ровно то, что видно.
 */
function useDialFreq(target: number, reduced: boolean, panel: RadioPanel) {
  const [freq, setFreq] = useState(target)
  const cur = useRef(target)
  const { fx } = panel
  useEffect(() => {
    if (reduced) {
      cur.current = target
      fx.jump(target)
      return
    }
    const from = cur.current
    if (from === target) return
    const dur = Math.min(1500, 520 + Math.abs(target - from) * 95)
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      // easeOutBack: стрелка проскакивает чуть дальше и возвращается — как у настоящего приёмника
      const c1 = 1.1
      const c3 = c1 + 1
      const e = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
      const v = from + (target - from) * e
      cur.current = v
      setFreq(v)
      fx.setDial(v, undefined, panel.mode)
      if (t < 1) raf = requestAnimationFrame(step)
      else {
        cur.current = target
        setFreq(target)
        fx.setDial(target, undefined, panel.mode)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced, fx, panel])
  return reduced ? target : freq
}

const TICKS = Array.from({ length: 42 }, (_, i) => 88 + i * 0.5)

export default function RadioStory({ acts, extras }: { acts: EventAct[]; extras: RadioStation[] }) {
  const stations = useMemo(() => buildStations(acts, extras), [acts, extras])
  const [idx, setIdx] = useState(() => Math.max(0, stations.findIndex((s) => s.kind === 'act')))
  const reduced = prefersReducedMotion()
  const st = stations[idx]
  // Звук радио: музыка играет на волнах актов, на остальных слышны шум и свист; щёлкают клавиши, кнопки поиска и ручка.
  const panel = useMemo(() => getRadioPanel({ acts: acts.map((a) => a.freq), carriers: extras.filter((e) => !e.silent).map((e) => e.freq), range: [MIN, MAX] }), [acts, extras])
  const { fx } = panel
  const freq = useDialFreq(st.freq, reduced, panel)
  const tuning = !reduced && Math.abs(freq - st.freq) > 0.04
  const n = stations.length
  const rootRef = useRef<HTMLDivElement>(null)
  const startIdx = useRef(idx)

  useEffect(() => {
    fx.jump(stations[startIdx.current].freq)
  }, [fx, stations])

  // Радио включается первым нажатием на его органы (браузер не даёт звук раньше) и играет, пока оно на экране.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const near = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) prefetchRadioAudio()
    }, { rootMargin: '700px 0px' })
    const view = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) panel.resume()
      else fx.close()
    }, { threshold: 0.1 })
    near.observe(el)
    view.observe(el)
    return () => {
      near.disconnect()
      view.disconnect()
      fx.close()
    }
  }, [fx, panel])

  const tune = (i: number) => {
    const next = ((i % n) + n) % n
    setIdx(next)
    // Волна «Помехи»: несколько секунд сплошных помех, потом шум стихает.
    if (stations[next].silent) fx.interferenceBurst(4000)
  }

  /** Переключение с щелчком клавиши (kind) или без него — когда крутят ручку. Любое нажатие включает радио. */
  const go = (i: number, mode: 'motor' | 'knob', kind?: 'preset' | 'key' | 'seek') => {
    panel.press(mode, kind)
    tune(i)
  }

  const bind = (action: () => void) => panel.bind(action)

  const onKnobKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      go(idx + 1, 'knob')
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      go(idx - 1, 'knob')
    }
  }

  const actKeys = stations.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'act')
  const extraKeys = stations.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'extra')
  const rot = -140 + (idx / Math.max(1, n - 1)) * 280
  // Уровень сигнала: у актов — полный, у ночных волн слабее, у шестой — почти нет.
  const level = st.silent ? 1 : st.kind === 'act' ? 5 : 4

  return (
    <div className="rd" ref={rootRef} data-silent={st.silent ? '' : undefined} data-tuning={tuning ? '' : undefined}>
      <div className="rd-face">
        <i className="rd-led" aria-hidden="true" />

        <div className="rd-seek">
          <button type="button" className="rd-seek-btn" {...bind(() => go(idx - 1, 'motor', 'seek'))} aria-label="Предыдущая волна">
            ◄◄
          </button>
          <button type="button" className="rd-seek-btn" {...bind(() => go(idx + 1, 'motor', 'seek'))} aria-label="Следующая волна">
            ►►
          </button>
          <span className="rd-cap">Поиск</span>
        </div>

        <div className="rd-display">
          <div className="rd-strip">
            <div className="rd-scale" aria-hidden="true">
              {TICKS.map((f) => (
                <i key={f} className={Number.isInteger(f) ? (f % 4 === 0 ? 'rd-t rd-t-4' : 'rd-t rd-t-1') : 'rd-t'} style={{ left: `${pct(f)}%` }} />
              ))}
              {[88, 92, 96, 100, 104, 108].map((f) => (
                <b key={f} className="rd-num" style={{ left: `${pct(f)}%` }}>
                  {f}
                </b>
              ))}
              {stations.map((s, i) => (
                <i key={s.id} className="rd-mark" data-act={s.kind === 'act' ? '' : undefined} data-on={i === idx ? '' : undefined} style={{ left: `${pct(s.freq)}%` }} />
              ))}
              <i className="rd-needle" style={{ left: `${pct(freq)}%` }} />
            </div>
            <div className="rd-readout">
              <span className="rd-fm">FM1</span>
              <span className="rd-freq">{freq.toFixed(1)}</span>
              <span className="rd-mhz">МГц</span>
              <span className="rd-sig" data-level={level} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="rd-name">{tuning ? '· · ·' : st.name}</span>
            </div>
            <div className="rd-glass" aria-hidden="true" />
          </div>

          {/* Все эфиры лежат в одной ячейке, видна только выбранная: высота экрана равна самому длинному тексту и не прыгает при переключении. */}
          <div className="rd-screen" role="region" aria-label="Эфир" aria-live="polite">
            <div className="rd-noise" data-on={tuning ? '' : undefined} aria-hidden="true" />
            {stations.map((s, i) => {
              const active = i === idx
              return (
                <div key={s.id} className="rd-air" data-active={active ? '' : undefined} data-tuning={active && tuning ? '' : undefined} aria-hidden={!active}>
                  {s.kind === 'act' ? (
                    <>
                      <p className="rd-eyebrow">
                        {s.name} · {s.freq.toFixed(1)} FM
                      </p>
                      <h3 className="font-noir rd-title">{s.title}</h3>
                      <div className="rd-copy">
                        {s.paragraphs?.map((p) => (
                          <p key={p}>{p}</p>
                        ))}
                      </div>
                      {s.sealed && (
                        <div className="relative mt-3 inline-block">
                          <div className="noir-sealed rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]">{s.sealed}</div>
                          {active && !tuning && <ShotOnView x="78%" y="50%" size={0.5} />}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="rd-eyebrow">Ночной эфир · {s.freq.toFixed(1)} FM</p>
                      <h3 className="font-noir rd-title">{s.name}</h3>
                      <p className="rd-eyebrow rd-eyebrow-2">{s.silent ? 'Нет сигнала' : 'В эфире'}</p>
                      <div className="rd-copy">
                        <p>{s.description}</p>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rd-tune">
          <button type="button" className="rd-knob" style={{ '--rot': `${rot}deg` } as CSSProperties} {...bind(() => go(idx + 1, 'knob'))} onKeyDown={onKnobKey} aria-label={`Ручка настройки. Сейчас: ${st.name}, ${st.freq.toFixed(1)} мегагерц. Нажмите, чтобы переключить на следующую волну`} />
          <span className="rd-cap">Настройка</span>
        </div>

        <div className="rd-keys">
          <div className="rd-acts">
            {actKeys.map(({ s, i }) => (
              <button key={s.id} type="button" className="rd-key rd-key-act" aria-pressed={i === idx} aria-label={`${s.name}: ${s.title}, ${s.freq.toFixed(1)} мегагерц`} {...bind(() => go(i, 'motor', 'preset'))}>
                <span className="rd-key-n">{s.key}</span>
                <span className="rd-key-l">{s.freq.toFixed(1)}</span>
              </button>
            ))}
          </div>
          <div className="rd-extra">
            {extraKeys.map(({ s, i }, k) => (
              <button key={s.id} type="button" className="rd-key" aria-pressed={i === idx} aria-label={`${s.name}, ${s.freq.toFixed(1)} мегагерц`} {...bind(() => go(i, 'motor', 'key'))}>
                <span className="rd-key-n">{k + 1}</span>
                <span className="rd-key-l">{s.key}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
