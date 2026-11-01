import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import type { WordSearch } from '../../data/eventStories'
import '../../pages/events/noir.css'

// Головоломка на странице газеты: слова читаются только вперёд — вправо, вниз и по диагонали вниз вправо.
// Слово выделяется протяжкой от первой буквы до последней (мышь) или двумя касаниями по крайним буквам (телефон);
// найденное обводится чёрным овалом, как маркером. Газета чёрно-белая — другого цвета нет.

interface Cell {
  r: number
  c: number
}

/** Прямая линия на сетке: от клетки (r, c) на n клеток в направлении (dr, dc). */
interface Line extends Cell {
  dr: number
  dc: number
  n: number
}

const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c

/** Линия между двумя клетками, если она идёт вправо, вниз или по диагонали вниз вправо; иначе null. */
function lineBetween(a: Cell, b: Cell): Line | null {
  const dr = b.r - a.r
  const dc = b.c - a.c
  if (dr === 0 && dc === 0) return null
  const forward = (dr === 0 && dc > 0) || (dc === 0 && dr > 0) || (dr === dc && dr > 0)
  if (!forward) return null
  return { r: a.r, c: a.c, dr: Math.sign(dr), dc: Math.sign(dc), n: Math.max(dr, dc) + 1 }
}

/** Выделение можно вести и от конца слова к началу — линия та же, читается она вперёд. */
const lineAny = (a: Cell, b: Cell) => lineBetween(a, b) ?? lineBetween(b, a)

function lettersOf(grid: string[], line: Line) {
  let s = ''
  for (let i = 0; i < line.n; i++) s += grid[line.r + line.dr * i][line.c + line.dc * i]
  return s
}

/** Где в сетке спрятано каждое слово. */
function locate(grid: string[], words: string[]) {
  const found = new Map<string, Line>()
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
  ]
  for (const w of words) {
    search: for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[0].length; c++) {
        for (const [dr, dc] of dirs) {
          const er = r + dr * (w.length - 1)
          const ec = c + dc * (w.length - 1)
          if (er >= grid.length || ec >= grid[0].length) continue
          const line = { r, c, dr, dc, n: w.length }
          if (lettersOf(grid, line) === w) {
            found.set(w, line)
            break search
          }
        }
      }
    }
  }
  return found
}

const cellKey = (r: number, c: number) => `${r}:${c}`

/** Овал вокруг линии букв (в клетках сетки: одна клетка — одна единица). */
function Capsule({ line, kind }: { line: Line; kind: 'found' | 'hint' | 'pick' }) {
  const diagonal = line.dr !== 0 && line.dc !== 0
  const length = (line.n - 1) * (diagonal ? Math.SQRT2 : 1) + 0.92
  const cx = line.c + 0.5 + (line.dc * (line.n - 1)) / 2
  const cy = line.r + 0.5 + (line.dr * (line.n - 1)) / 2
  const angle = diagonal ? 45 : line.dr !== 0 ? 90 : 0
  return <rect className="np-ws-cap" data-kind={kind} x={-length / 2} y={-0.43} width={length} height={0.86} rx={0.43} transform={`translate(${cx} ${cy}) rotate(${angle})`} />
}

export default function Wordsearch({ puzzle }: { puzzle: WordSearch }) {
  const { grid, words, hint, motto } = puzzle
  const rows = grid.length
  const cols = grid[0].length
  const places = useMemo(() => locate(grid, words), [grid, words])
  const [found, setFound] = useState<string[]>([])
  const [anchor, setAnchor] = useState<Cell | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [reveal, setReveal] = useState(false)
  // Идёт ли протяжка и была ли начальная клетка уже выбрана (повторное касание по ней снимает выбор).
  const [drag, setDrag] = useState<{ start: Cell; was: boolean } | null>(null)

  const foundCells = useMemo(() => {
    const set = new Set<string>()
    for (const w of found) {
      const l = places.get(w)
      if (!l) continue
      for (let i = 0; i < l.n; i++) set.add(cellKey(l.r + l.dr * i, l.c + l.dc * i))
    }
    return set
  }, [found, places])

  const cellAt = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-r]')
    return el ? { r: Number(el.dataset.r), c: Number(el.dataset.c) } : null
  }

  const clearPick = () => {
    setAnchor(null)
    setHover(null)
    setDrag(null)
  }

  const commit = (a: Cell, b: Cell) => {
    const line = lineAny(a, b)
    if (!line) return
    const word = lettersOf(grid, line)
    if (words.includes(word) && !found.includes(word)) setFound((f) => [...f, word])
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const cell = cellAt(e.clientX, e.clientY)
    if (!cell) return
    if (anchor && !same(anchor, cell)) {
      // Вторая точка при выборе касаниями.
      commit(anchor, cell)
      clearPick()
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ start: cell, was: anchor !== null })
    setAnchor(cell)
    setHover(cell)
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!anchor) return
    const cell = cellAt(e.clientX, e.clientY)
    if (cell && (!hover || !same(cell, hover))) setHover(cell)
  }

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const cell = cellAt(e.clientX, e.clientY) ?? hover
    if (cell && !same(cell, drag.start)) {
      commit(drag.start, cell)
      clearPick()
    } else {
      setDrag(null)
      // Касание по уже выбранной букве — отмена выбора.
      if (drag.was) clearPick()
    }
  }

  const pick = anchor && hover && !same(anchor, hover) ? lineAny(anchor, hover) : null
  const done = found.length === words.length
  const restart = () => {
    setFound([])
    setReveal(false)
    clearPick()
  }

  return (
    <div className="np-grid np-ws" onClick={(e) => e.stopPropagation()}>
      <div className="np-main">
        {/* Сетка читается глазами и рукой; для экранных читалок есть список слов и кнопка «Показать ответы». */}
        <div
          className="np-ws-grid"
          aria-hidden="true"
          style={{ '--cols': cols, '--rows': rows } as CSSProperties}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={clearPick}
        >
          {grid.flatMap((row, r) =>
            [...row].map((ch, c) => (
              <span key={cellKey(r, c)} className="np-ws-cell" data-r={r} data-c={c} data-found={foundCells.has(cellKey(r, c)) ? '' : undefined} data-pick={anchor && same(anchor, { r, c }) ? '' : undefined}>
                {ch}
              </span>
            )),
          )}
          <svg className="np-ws-svg" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none">
            {reveal && words.filter((w) => !found.includes(w)).map((w) => places.get(w) && <Capsule key={w} line={places.get(w)!} kind="hint" />)}
            {found.map((w) => places.get(w) && <Capsule key={w} line={places.get(w)!} kind="found" />)}
            {pick && <Capsule line={pick} kind="pick" />}
          </svg>
        </div>
        <div className="np-ws-bar">
          <p className="np-ws-count" role="status">
            Найдено: {found.length} из {words.length}
          </p>
          <div className="np-ws-actions">
            <button type="button" className="np-btn" aria-pressed={reveal} onClick={() => setReveal((v) => !v)}>
              {reveal ? 'Скрыть ответы' : 'Показать ответы'}
            </button>
            <button type="button" className="np-btn" onClick={restart}>
              Заново
            </button>
          </div>
        </div>
        {hint && <p className="np-ws-hint">{hint}</p>}
      </div>

      <aside className="np-side">
        <h5 className="np-ws-h">Найдите слова</h5>
        <ul className="np-words" aria-label="Слова, которые нужно найти">
          {words.map((w) => (
            <li key={w} data-found={found.includes(w) ? '' : undefined}>
              {w}
            </li>
          ))}
        </ul>
        {done && <p className="np-ws-done">Дело раскрыто</p>}
      </aside>

      {motto && <p className="np-ws-motto">{motto}</p>}
    </div>
  )
}
