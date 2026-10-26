import { Fragment, type ReactNode } from 'react'
import { kbHeadings } from '../lib/kbHeadings'

// Показ текста статьи базы знаний. Разбирает обычный Markdown: заголовки (#–####), абзацы, списки (в том числе вложенные и
// нумерованные), цитаты, таблицы, горизонтальную черту, блоки кода, **жирный**, *курсив*, `код` и [ссылки](адрес).
// Сырой HTML не поддерживается: всё строится из элементов React, ссылки пропускаются только http(s), mailto, относительные и якоря.

const safeHref = (href: string) => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href.trim()) ? href.trim() : null)

/** Строчная разметка: **жирный**, *курсив*, `код`, [текст](адрес) и адреса, вставленные как есть. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w])|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<)]+))/g
  let last = 0
  let i = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyPrefix}-${i++}`
    if (m[2] ?? m[3]) out.push(<strong key={key} className="font-semibold text-ink">{inline(m[2] ?? m[3], key)}</strong>)
    else if (m[4] ?? m[5]) out.push(<em key={key}>{inline(m[4] ?? m[5], key)}</em>)
    else if (m[6]) out.push(<code key={key} className="rounded bg-ink/[0.07] px-1.5 py-0.5 text-[0.9em]">{m[6]}</code>)
    else {
      const href = safeHref(m[8] ?? m[9] ?? '')
      const label = m[7] ?? m[9]
      if (!href) out.push(label)
      else {
        const external = /^https?:\/\//i.test(href)
        out.push(
          <a key={key} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="font-medium text-gold underline decoration-gold/40 underline-offset-2 hover:text-ink hover:decoration-ink">
            {label}
          </a>,
        )
      }
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface ListItem { text: string; children: ListBlock | null }
interface ListBlock { ordered: boolean; items: ListItem[] }

/** Список с вложенностью по отступу (2 и более пробела = следующий уровень). */
function parseList(lines: string[], start: number, indent: number): [ListBlock, number] {
  const first = /^(\s*)([-*+]|\d+[.)])\s+/.exec(lines[start])!
  const block: ListBlock = { ordered: /\d/.test(first[2]), items: [] }
  let i = start
  while (i < lines.length) {
    const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
    if (!m) {
      // продолжение пункта на следующей строке с отступом
      if (/^\s{2,}\S/.test(lines[i]) && block.items.length) {
        block.items[block.items.length - 1].text += ` ${lines[i].trim()}`
        i++
        continue
      }
      break
    }
    const ind = m[1].replace(/\t/g, '  ').length
    if (ind < indent) break
    if (ind > indent) {
      const [sub, next] = parseList(lines, i, ind)
      if (block.items.length) block.items[block.items.length - 1].children = sub
      i = next
      continue
    }
    block.items.push({ text: m[3], children: null })
    i++
  }
  return [block, i]
}

function renderList(block: ListBlock, key: string): ReactNode {
  const Tag = block.ordered ? 'ol' : 'ul'
  return (
    <Tag key={key} className={`my-3 space-y-1.5 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'} marker:text-ink/40`}>
      {block.items.map((it, i) => (
        <li key={i} className="pl-1">
          {inline(it.text, `${key}-${i}`)}
          {it.children && renderList(it.children, `${key}-${i}c`)}
        </li>
      ))}
    </Tag>
  )
}

const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

export default function KbMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const headings = kbHeadings(source)
  let h = 0
  const blocks: ReactNode[] = []
  let i = 0
  let n = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${n++}`
    if (!line.trim()) { i++; continue }

    if (/^```/.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++])
      i++
      blocks.push(<pre key={key} className="my-4 overflow-x-auto rounded-xl bg-ink/[0.06] p-4 text-sm leading-relaxed"><code>{code.join('\n')}</code></pre>)
      continue
    }

    const hm = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line)
    if (hm) {
      const level = hm[1].length
      const found = level === 2 || level === 3 ? headings[h++] : undefined
      const cls = level === 1 ? 'mt-10 text-2xl font-semibold' : level === 2 ? 'mt-10 text-xl font-semibold' : level === 3 ? 'mt-7 text-lg font-semibold' : 'mt-6 text-base font-semibold'
      const Tag = (level === 1 ? 'h2' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4') as 'h2' | 'h3' | 'h4'
      blocks.push(<Tag key={key} id={found?.id} className={`${cls} scroll-mt-28 text-ink`}>{inline(hm[2], key)}</Tag>)
      i++
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-8 border-ink/10" />)
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={key} className="my-5 rounded-r-xl border-l-4 border-gold-light bg-ink/[0.035] px-5 py-3 text-ink/80">{inline(quote.join(' '), key)}</blockquote>)
      continue
    }

    if (/^\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]))
      blocks.push(
        <div key={key} className="my-5 overflow-x-auto rounded-xl border border-ink/10">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead className="bg-ink/[0.04]">
              <tr>{head.map((c, k) => <th key={k} className="px-4 py-2.5 font-semibold">{inline(c, `${key}h${k}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-ink/10">
                  {r.map((c, k) => <td key={k} className="px-4 py-2.5 align-top">{inline(c, `${key}r${ri}c${k}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const indent = /^(\s*)/.exec(line)![1].replace(/\t/g, '  ').length
      const [list, next] = parseList(lines, i, indent)
      blocks.push(renderList(list, key))
      i = next
      continue
    }

    // абзац: подряд идущие строки до пустой или до начала другого блока
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>\s?|\s*([-*+]|\d+[.)])\s+|\|.+\|\s*$)/.test(lines[i])) para.push(lines[i++].trim())
    blocks.push(<p key={key} className="my-4 leading-[1.75] text-ink/85">{para.map((p, k) => <Fragment key={k}>{k > 0 && ' '}{inline(p, `${key}-${k}`)}</Fragment>)}</p>)
  }
  return <div className="kb-prose text-[1.0625rem]">{blocks}</div>
}
