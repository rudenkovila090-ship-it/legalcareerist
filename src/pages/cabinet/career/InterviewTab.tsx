import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import KbMarkdown from '../../../components/KbMarkdown'
import { fetchInterviewBlock, fetchInterviewBlocks, markQuestionDone, peekInterviewBlock, peekInterviewBlocks, type InterviewBlock, type InterviewBlockData } from '../../../lib/careerCabinet'
import { pluralRu } from '../../../lib/plural'
import { icon } from '../sections'
import { EmptyNote, Progress, Surface, TabSkeleton } from '../kit'
import { btnAccent, btnGhost, btnPrimary, field, focusRing } from '../kitStyles'
import type { CareerHandle } from './useCareer'

// Подготовка к интервью в виде чата «вопрос — ответ». Вопросы и ответы лежат файлами на сервере (server/content/career/interview):
// файл = блок вопросов. Интервьюер задаёт вопрос, человек может набрать свой ответ (он никуда не сохраняется), затем показывается
// разбор от «Карьерного юриста» — вопрос считается разобранным. Дальше следующий вопрос; к любому вопросу блока можно перейти по номеру.

type Turn =
  | { id: number; kind: 'question'; index: number; text: string }
  | { id: number; kind: 'mine'; text: string }
  | { id: number; kind: 'expert'; text: string }

let turnSeq = 0
const turn = <T extends Omit<Turn, 'id'>>(t: T) => ({ ...t, id: ++turnSeq }) as Turn

function Bubble({ t }: { t: Turn }) {
  if (t.kind === 'mine') {
    return (
      <li className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[13px] leading-relaxed text-white sm:max-w-[78%]">
          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-white/55">Вы</div>
          <p className="whitespace-pre-wrap break-words">{t.text}</p>
        </div>
      </li>
    )
  }
  if (t.kind === 'expert') {
    return (
      <li className="flex justify-start">
        <div className="max-w-full rounded-2xl rounded-bl-md bg-amber-100 px-3.5 py-3 text-[13px] leading-relaxed text-ink sm:max-w-[88%]">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-300 text-ink [&>svg]:h-2.5 [&>svg]:w-2.5">{icon.check}</span>Разбор · Карьерный юрист
          </div>
          <div className="[&_*]:!text-[13px] [&_p]:!my-1.5"><KbMarkdown source={t.text} /></div>
        </div>
      </li>
    )
  }
  return (
    <li className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-ink/[0.07] px-3.5 py-2.5 text-ink sm:max-w-[82%]">
        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">Интервьюер · вопрос {t.index + 1}</div>
        <p className="text-sm font-semibold leading-snug">{t.text}</p>
      </div>
    </li>
  )
}

export default function InterviewTab({ career }: { career: CareerHandle }) {
  const [blocks, setBlocks] = useState<InterviewBlock[] | null>(() => peekInterviewBlocks()?.blocks ?? null)
  const [failed, setFailed] = useState(false)
  const [blockId, setBlockId] = useState('')

  useEffect(() => {
    let live = true
    fetchInterviewBlocks().then((r) => {
      if (!live) return
      if (r.ok) setBlocks(r.data.blocks)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  if (failed && !blocks) return <Surface><p className="text-[13px] text-ink/60">Не получилось загрузить вопросы. Обновите страницу через минуту.</p></Surface>
  if (!blocks) return <TabSkeleton rows={2} />
  if (!blocks.length) return <EmptyNote icon={icon.mic} title="Банк вопросов скоро появится">Здесь будут вопросы к интервью с разбором ответов: тренируйтесь в формате чата.</EmptyNote>

  const current = blocks.find((b) => b.id === blockId) ?? blocks[0]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <nav aria-label="Блоки вопросов" className="flex gap-2 overflow-x-auto pb-0.5 lg:flex-col lg:overflow-visible">
        {blocks.map((b) => {
          const on = b.id === current.id
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => setBlockId(b.id)}
              className={`min-w-[12.5rem] rounded-2xl p-3 text-left transition-colors lg:min-w-0 ${on ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-white/70'} shadow-[0_1px_2px_rgba(40,57,83,0.06)] ${focusRing}`}
            >
              <span className="block text-[13px] font-bold leading-snug">{b.title}</span>
              <span className={`mt-0.5 block text-[11px] ${on ? 'text-white/65' : 'text-ink/50'}`}>{b.done} из {b.count} {pluralRu(b.count, ['вопроса', 'вопросов', 'вопросов'])}</span>
              <span className="mt-2 block"><Progress value={b.done} max={b.count} tone={on ? 'amber' : 'ink'} label={`Разобрано в блоке «${b.title}»`} /></span>
            </button>
          )
        })}
      </nav>
      <ChatPanel key={current.id} block={current} onProgress={(done) => {
        setBlocks((prev) => prev?.map((b) => (b.id === current.id ? { ...b, done } : b)) ?? prev)
        const total = blocks.reduce((n, b) => n + (b.id === current.id ? done : b.done), 0)
        career.patch({ interview: { total: career.state.interview.total, done: total } })
      }} />
    </div>
  )
}

function ChatPanel({ block, onProgress }: { block: InterviewBlock; onProgress: (done: number) => void }) {
  const [data, setData] = useState<InterviewBlockData | null>(() => peekInterviewBlock(block.id) ?? null)
  const [failed, setFailed] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<'ask' | 'revealed' | 'finished'>('ask')
  const [draft, setDraft] = useState('')
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLUListElement>(null)
  const started = useRef(false)

  const begin = useCallback((d: InterviewBlockData) => {
    const done = new Set(d.questions.filter((q) => q.done).map((q) => q.id))
    const first = Math.max(0, d.questions.findIndex((q) => !done.has(q.id)))
    setDoneIds(done)
    setIndex(first)
    setStage('ask')
    setTurns([turn({ kind: 'question', index: first, text: d.questions[first].q })])
  }, [])

  useEffect(() => {
    let live = true
    fetchInterviewBlock(block.id).then((r) => {
      if (!live) return
      if (r.ok) {
        setData(r.data)
        if (!started.current) {
          started.current = true
          begin(r.data)
        }
      } else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [block.id, begin])
  // данные уже запомнены с прошлого раза: чат стартует сразу, свежие отметки подтянутся следом
  useEffect(() => {
    if (data && !started.current) {
      started.current = true
      begin(data)
    }
  }, [data, begin])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [turns.length, stage])

  if (failed && !data) return <Surface><p className="text-[13px] text-ink/60">Не получилось загрузить блок. Обновите страницу через минуту.</p></Surface>
  if (!data) return <TabSkeleton rows={2} />

  const questions = data.questions
  const q = questions[index]
  const doneCount = questions.filter((x) => doneIds.has(x.id)).length

  function reveal(e?: FormEvent) {
    e?.preventDefault()
    const mine = draft.trim()
    const added: Turn[] = []
    if (mine) added.push(turn({ kind: 'mine', text: mine }))
    added.push(turn({ kind: 'expert', text: q.a }))
    setTurns((t) => [...t, ...added])
    setDraft('')
    setStage('revealed')
    if (!doneIds.has(q.id)) {
      const next = new Set(doneIds).add(q.id)
      setDoneIds(next)
      onProgress(questions.filter((x) => next.has(x.id)).length)
      void markQuestionDone(q.id, true)
    }
  }

  function ask(i: number) {
    setIndex(i)
    setStage('ask')
    setDraft('')
    setTurns((t) => [...t, turn({ kind: 'question', index: i, text: questions[i].q })])
  }

  function next() {
    const nextUndone = questions.findIndex((x, i) => i > index && !doneIds.has(x.id))
    if (nextUndone >= 0) ask(nextUndone)
    else if (index + 1 < questions.length) ask(index + 1)
    else setStage('finished')
  }

  function restart() {
    setTurns([])
    setStage('ask')
    ask(0)
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(40,57,83,0.06)]" aria-label={`Чат: ${block.title}`}>
      <header className="border-b border-ink/10 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">{block.title}</h2>
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold text-white">{doneCount} из {questions.length}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Вопросы блока">
          {questions.map((x, i) => {
            const isDone = doneIds.has(x.id)
            const isCurrent = i === index && stage !== 'finished'
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => ask(i)}
                aria-label={`Вопрос ${i + 1}${isDone ? ', разобран' : ''}: ${x.q}`}
                aria-current={isCurrent ? 'true' : undefined}
                className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold transition-colors ${isCurrent ? 'bg-amber-300 text-ink ring-2 ring-amber-300/40' : isDone ? 'bg-ink text-white' : 'bg-ink/[0.07] text-ink/60 hover:bg-ink/15'} ${focusRing}`}
              >
                {isDone && !isCurrent ? '✓' : i + 1}
              </button>
            )
          })}
        </div>
      </header>

      <ul ref={listRef} className="max-h-[26rem] min-h-[14rem] space-y-2.5 overflow-y-auto bg-ink/[0.025] px-3.5 py-3" aria-live="polite">
        {data.lead && turns.length <= 1 && <li className="text-center text-[11px] text-ink/50">{data.lead}</li>}
        {turns.map((t) => <Bubble key={t.id} t={t} />)}
        {stage === 'finished' && (
          <li className="flex justify-center">
            <div className="rounded-2xl bg-ink px-4 py-3 text-center text-white">
              <div className="text-sm font-bold">Блок пройден</div>
              <p className="mt-0.5 text-xs text-white/70">Вы разобрали {doneCount} из {questions.length}. Вернуться к любому вопросу можно по номеру сверху.</p>
            </div>
          </li>
        )}
      </ul>

      <footer className="border-t border-ink/10 p-3">
        {stage === 'ask' && (
          <form onSubmit={reveal} className="space-y-2">
            <label htmlFor="iv-draft" className="block text-xs font-semibold text-ink/70">Ваш ответ <span className="font-normal text-ink/40">по желанию: ответьте вслух или напишите, он никуда не сохраняется</span></label>
            <textarea id="iv-draft" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 2000))} rows={3} placeholder="Попробуйте ответить своими словами, а потом сверьтесь с разбором" className={field} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className={btnAccent}>Показать разбор</button>
              {index + 1 < questions.length && <button type="button" onClick={next} className={btnGhost}>Пропустить вопрос</button>}
            </div>
          </form>
        )}
        {stage === 'revealed' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs font-semibold text-emerald-700">Вопрос разобран</span>
            {index + 1 < questions.length || questions.some((x, i) => i !== index && !doneIds.has(x.id)) ? (
              <button type="button" onClick={next} className={btnPrimary}>Следующий вопрос →</button>
            ) : (
              <button type="button" onClick={() => setStage('finished')} className={btnPrimary}>Завершить блок</button>
            )}
          </div>
        )}
        {stage === 'finished' && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={restart} className={btnPrimary}>Пройти блок заново</button>
          </div>
        )}
      </footer>
    </section>
  )
}
