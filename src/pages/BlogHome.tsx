import { useState } from 'react'
import PageHero from '../components/PageHero'
import { news } from '../data/news'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const blogTabs = [
  { id: 'news', label: 'Новости Карьерного юриста' },
  { id: 'podcast', label: 'Подкаст' },
] as const

// /blog — демо-каркас, добавлен по запросу рядом с Кадрами/Сообществом/
// Мероприятиями/Маркетплейсом. Наполнение еще не согласовано с бизнесом.
export default function BlogHome() {
  useDocumentTitle('Блог')
  const [tab, setTab] = useState<(typeof blogTabs)[number]['id']>('news')

  return (
    <div>
      <PageHero
        eyebrow="Карьерный Юрист"
        title="Блог"
        description="Статьи о карьере в праве, подборе персонала и юридическом рынке — раздел в разработке."
        prototype
      />

      {/* Подвкладки — Новости Карьерного юриста / Подкаст */}
      <div className="border-b border-ink/10 bg-white py-4">
        <div className="container-page">
          <div className="flex flex-wrap gap-3">
            {blogTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                  tab === t.id ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'news' && (
        <div className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Новости Карьерного юриста</div>
          <h2 className="mb-6 text-2xl font-semibold">Что нового у «Карьерного юриста»</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((n) => (
              <div key={n.title} className="glass rounded-xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{n.tag}</span>
                  <span className="text-xs text-ink/40">{n.date}</span>
                </div>
                <div className="mt-3 font-semibold">{n.title}</div>
                <p className="mt-1.5 text-sm text-ink/60">{n.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'podcast' && (
        <section className="py-16">
          <div className="container-page text-center">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Блог</div>
            <h2 className="mb-2 text-2xl font-semibold">Подкаст</h2>
            <p className="mx-auto mb-6 max-w-lg text-sm text-ink/60">
              Разговоры о найме, карьере и юридическом рынке — раздел в разработке, выпуски скоро появятся здесь.
            </p>
            <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink/15 p-10 text-sm text-ink/30">
              Раздел «Подкаст» — наполнение уточняется
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
