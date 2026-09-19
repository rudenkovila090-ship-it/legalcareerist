import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NewsCard } from '../components/cards'
import KnowledgeList from './KnowledgeList'
import { news } from '../data/news'
import { podcastEpisodes } from '../data/podcast'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { NewsCategory } from '../types'

const blogTabs = [
  { id: 'news', label: 'Новости' },
  { id: 'podcast', label: 'Подкаст' },
  { id: 'community', label: 'Сообщество' },
] as const

const newsCategories: NewsCategory[] = ['Карьерный юрист', 'Кадры', 'Сообщество', 'Мероприятия', 'Маркетплейс', 'Подкаст']

// /blog — демо-каркас, добавлен по запросу рядом с Кадрами/Сообществом/
// Мероприятиями/Маркетплейсом. Наполнение еще не согласовано с бизнесом.
// Заголовок страницы и переключатель вкладок (Новости/Подкаст/Сообщество)
// сняты с экрана по просьбе клиента — по умолчанию открыты Новости, а
// Подкаст и Сообщество остаются доступны по прямой ссылке (?tab=...), тот
// же прием, что и у скрытых вкладок в /events и /kadry (см. featureFlags.ts).
export default function BlogHome() {
  useDocumentTitle('Блог')
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const validTabIds = new Set<string>(blogTabs.map((t) => t.id))
  const tab: (typeof blogTabs)[number]['id'] =
    tabParam && validTabIds.has(tabParam) ? (tabParam as (typeof blogTabs)[number]['id']) : 'news'
  const [newsCategory, setNewsCategory] = useState<NewsCategory | 'all'>('all')

  const filteredNews = useMemo(
    () => (newsCategory === 'all' ? news : news.filter((n) => n.category === newsCategory)),
    [newsCategory],
  )

  return (
    <div>
      {tab === 'news' && (
        <div className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Новости</div>
          <h2 className="mb-6 text-2xl font-semibold">Что нового у «Карьерного юриста»</h2>

          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setNewsCategory('all')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                newsCategory === 'all' ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
              }`}
            >
              Все
            </button>
            {newsCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewsCategory(c)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  newsCategory === c ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredNews.map((n) => (
              <NewsCard key={n.slug} n={n} />
            ))}
            {filteredNews.length === 0 && <p className="text-sm text-ink/50">В этой категории пока нет новостей.</p>}
          </div>

          {/* Единая база знаний — тот же компонент и те же материалы, что и
              на /kadry/employers, /kadry/candidates, /events/knowledge,
              /community — audience="all" снимает фильтр по разделу, чтобы
              на Блоге все накопленные статьи/чек-листы/глоссарий были
              собраны в одном месте, а не жили только внутри своих разделов. */}
          <div className="mt-14 border-t border-ink/10 pt-12">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">База знаний</div>
            <h2 className="mb-6 text-2xl font-semibold">Гайды, чек-листы и статьи «Карьерного юриста»</h2>
            <KnowledgeList audience="all" eyebrow="Блог · База знаний" title="База знаний" compact />
          </div>
        </div>
      )}

      {tab === 'podcast' && (
        <section className="py-16">
          <div className="container-page text-center">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Блог</div>
            <h2 className="mb-2 text-2xl font-semibold">Подкаст</h2>
            <p className="mx-auto mb-10 max-w-2xl text-sm text-ink/60">
              Подкаст, в котором профессионалы из разных областей права и резиденты Сообщества
              рассказывают о своём опыте, карьерных сложностях и особенностях профессии, а также
              делятся практическими советами для тех, кто только начинает или уже строит свою
              юридическую карьеру.
            </p>

            <div className="mb-6 text-left text-sm font-semibold uppercase tracking-wide text-ink/40">1 сезон</div>
            <div className="grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
              {podcastEpisodes.map((ep) => (
                <div key={ep.episode} className="flex flex-col justify-between rounded-xl bg-ink p-5 text-white">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gold-light">
                      {ep.season} сезон {ep.episode} выпуск
                    </div>
                    <div className="mt-1 text-xs text-white/50">{ep.date}</div>
                    <p className="mt-3 text-sm leading-snug text-white/85">{ep.title}</p>
                  </div>
                  <a
                    href={ep.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-block rounded-full bg-gold-light px-4 py-2 text-center text-sm font-semibold text-ink hover:opacity-90"
                  >
                    Слушать
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === 'community' && (
        <div className="container-page py-12">
          <h2 className="mb-6 text-2xl font-semibold">Сообщество</h2>
          <KnowledgeList audience="community" eyebrow="Блог · Сообщество" title="Сообщество" compact />
        </div>
      )}
    </div>
  )
}
