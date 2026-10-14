import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { EventAct, RadioStation } from '../../data/eventStories'
import { prefersReducedMotion } from '../../lib/motion'
import { ShotOnView } from './ShotFx'
import '../../pages/events/noir.css'

// «Сюжет вечера» как ламповый приёмник: три волны — акты расследования, остальные — ночной эфир города.
// Настраиваться можно ручкой, стрелками или клавишами-пресетами; между волнами стрелка идёт по шкале, а экран «шипит».

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

/** Плавно «едет» к нужной частоте: цифры на шкале пролистываются, стрелка идёт по ней и чуть перескакивает цель. */
function useDialFreq(target: number, reduced: boolean) {
  const [freq, setFreq] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    if (reduced) {
      cur.current = target
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
      if (t < 1) raf = requestAnimationFrame(step)
      else {
        cur.current = target
        setFreq(target)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])
  return reduced ? target : freq
}

const TICKS = Array.from({ length: 42 }, (_, i) => 88 + i * 0.5)

export default function RadioStory({ acts, extras }: { acts: EventAct[]; extras: RadioStation[] }) {
  const stations = useMemo(() => buildStations(acts, extras), [acts, extras])
  const [idx, setIdx] = useState(() => Math.max(0, stations.findIndex((s) => s.kind === 'act')))
  const reduced = prefersReducedMotion()
  const st = stations[idx]
  const freq = useDialFreq(st.freq, reduced)
  const tuning = !reduced && Math.abs(freq - st.freq) > 0.04
  const n = stations.length

  const tune = (i: number) => setIdx(((i % n) + n) % n)
  const onKnobKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      tune(idx + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      tune(idx - 1)
    }
  }

  const actKeys = stations.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'act')
  const extraKeys = stations.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'extra')
  const rot = -140 + (idx / Math.max(1, n - 1)) * 280

  return (
    <div className="rd" data-silent={st.silent ? '' : undefined} data-tuning={tuning ? '' : undefined}>
      {/* Лампы и антенна — как на референсах: тёплый свет в тёмной комнате. */}
      <div className="rd-tubes" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="rd-antenna" aria-hidden="true" />

      <div className="rd-body">
        <div className="rd-top">
          <div className="rd-vu" aria-hidden="true">
            <svg viewBox="0 0 120 74" className="rd-vu-face">
              <path d="M12 58 A52 52 0 0 1 108 58" fill="none" stroke="#2b1a0c" strokeWidth="1.2" />
              {Array.from({ length: 11 }, (_, i) => {
                const a = (-50 + i * 10) * (Math.PI / 180)
                const x1 = 60 + Math.sin(a) * 47
                const y1 = 62 - Math.cos(a) * 47
                const x2 = 60 + Math.sin(a) * (i % 5 === 0 ? 37 : 41)
                const y2 = 62 - Math.cos(a) * (i % 5 === 0 ? 37 : 41)
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i >= 8 ? '#9a1d14' : '#2b1a0c'} strokeWidth={i % 5 === 0 ? 1.6 : 1} />
              })}
              <path d="M86 24 A52 52 0 0 1 108 58" fill="none" stroke="#9a1d14" strokeWidth="3" opacity="0.55" />
              <text x="60" y="44" textAnchor="middle" className="rd-vu-text">
                СИГНАЛ
              </text>
              <line x1="60" y1="62" x2="60" y2="16" className="rd-vu-needle" />
              <circle cx="60" cy="62" r="4.2" fill="#1b1410" />
            </svg>
          </div>

          <div className="rd-dial-frame">
            <div className="rd-dial">
              <div className="rd-scale">
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
                <span className="rd-fm">FM</span>
                <span className="rd-freq">{freq.toFixed(1)}</span>
                <span className="rd-mhz">МГц</span>
                <span className="rd-name">{tuning ? '· · ·' : st.name}</span>
              </div>
              <div className="rd-glass" />
            </div>
          </div>
        </div>

        <div className="rd-mid">
          <div className="rd-speaker" aria-hidden="true">
            <span className="rd-onair">В эфире</span>
          </div>

          <div className="rd-screen" role="region" aria-label="Эфир" aria-live="polite">
            <div className="rd-noise" data-on={tuning ? '' : undefined} aria-hidden="true" />
            <div key={st.id} className="rd-air" data-tuning={tuning ? '' : undefined}>
              {st.kind === 'act' ? (
                <>
                  <p className="rd-eyebrow">
                    {st.name} · {st.freq.toFixed(1)} FM
                  </p>
                  <h3 className="font-noir rd-title">{st.title}</h3>
                  <div className="rd-copy">
                    {st.paragraphs?.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                  {st.sealed && !tuning && (
                    <div className="relative mt-4 inline-block">
                      <div className="noir-sealed rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]">{st.sealed}</div>
                      <ShotOnView x="78%" y="50%" size={0.55} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="rd-eyebrow">Ночной эфир · {st.freq.toFixed(1)} FM</p>
                  <h3 className="font-noir rd-title">{st.name}</h3>
                  <p className="rd-eyebrow rd-eyebrow-2">{st.silent ? 'Нет сигнала' : 'В эфире'}</p>
                  <div className="rd-copy">
                    <p>{st.description}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rd-ctl">
            <div className="rd-tune">
              <button type="button" className="rd-arrow" onClick={() => tune(idx - 1)} aria-label="Предыдущая волна">
                ◄
              </button>
              <button type="button" className="rd-knob" style={{ '--rot': `${rot}deg` } as CSSProperties} onClick={() => tune(idx + 1)} onKeyDown={onKnobKey} aria-label={`Ручка настройки. Сейчас: ${st.name}, ${st.freq.toFixed(1)} мегагерц. Нажмите, чтобы переключить на следующую волну`} />
              <button type="button" className="rd-arrow" onClick={() => tune(idx + 1)} aria-label="Следующая волна">
                ►
              </button>
            </div>
            <div className="rd-minis" aria-hidden="true">
              <i style={{ '--rot': '-35deg' } as CSSProperties} />
              <i style={{ '--rot': '50deg' } as CSSProperties} />
            </div>
          </div>
        </div>

        <div className="rd-keys">
          <div className="rd-group">
            <span className="rd-cap">Акты</span>
            <div className="rd-row rd-row-acts">
              {actKeys.map(({ s, i }) => (
                <button key={s.id} type="button" className="rd-key rd-key-act" aria-pressed={i === idx} aria-label={`${s.name}: ${s.title}, ${s.freq.toFixed(1)} мегагерц`} onClick={() => tune(i)}>
                  <span className="rd-key-n">{s.key}</span>
                  <span className="rd-key-l">{s.freq.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rd-group">
            <span className="rd-cap">Ночной эфир</span>
            <div className="rd-row rd-row-extra">
              {extraKeys.map(({ s, i }, k) => (
                <button key={s.id} type="button" className="rd-key" aria-pressed={i === idx} aria-label={`${s.name}, ${s.freq.toFixed(1)} мегагерц`} onClick={() => tune(i)}>
                  <span className="rd-key-n">{k + 1}</span>
                  <span className="rd-key-l">{s.key}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
