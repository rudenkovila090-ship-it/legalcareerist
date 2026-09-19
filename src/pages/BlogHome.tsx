import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

// База знаний на Блоге сгруппирована по тем же разделам, что и фильтр
// новостей ниже — каждая группа переиспользует тот же компонент/данные,
// что и на /kadry (employers/candidates), /community, что и является
// причиной id-якорей (#kb-...) — по ним ведут ссылки из подвалов разделов
// ("База знаний" в /events, например), чтобы попадать сразу в нужную ветку.
const knowledgeGroups: { id: string; label: string; audience: 'employers' | 'community' | 'events' }[] = [
  { id: 'kb-kadry', label: 'Кадры', audience: 'employers' },
  { id: 'kb-soobschestvo', label: 'Сообщество', audience: 'community' },
  { id: 'kb-meropriyatiya', label: 'Мероприятия', audience: 'events' },
]

// /blog — демо-каркас, добавлен по запросу рядом с Кадрами/Сообществом/
// Мероприятиями/Маркетплейсом. Наполнение еще не согласовано с бизнесом.
// Заголовок страницы снят с экрана по просьбе клиента — по умолчанию
// открыты Новости, а Сообщество остается доступно по прямой ссылке
// (?tab=...), тот же прием, что и у скрытых вкладок в /events и /kadry
// (см. featureFlags.ts). Подкаст, в отличие от Сообщества, — единственная
// видимая ссылка под шапкой (клиент явно просил вернуть к ней доступ).
export default function BlogHome() {
  useDocumentTitle('Блог')
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const validTabIds = new Set<string>(blogTabs.map((t) => t.id))
  const tab: (typeof blogTabs)[number]['id'] =
    tabParam && validTabIds.has(tabParam) ? (tabParam as (typeof blogTabs)[number]['id']) : 'news'

  // Категория новостей читается из ?category= при заходе (так подвалы
  // разделов могут прислать сразу на свою ветку — см. /blog?category=...
  // в EventsFooter/CommunityFooter), дальше переключается кнопками ниже.
  const categoryParam = searchParams.get('category')
  const initialCategory: NewsCategory | 'all' =
    categoryParam && (newsCategories as string[]).includes(categoryParam) ? (categoryParam as NewsCategory) : 'all'
  const [newsCategory, setNewsCategory] = useState<NewsCategory | 'all'>(initialCategory)

  const filteredNews = useMemo(
    () => (newsCategory === 'all' ? news : news.filter((n) => n.category === newsCategory)),
    [newsCategory],
  )

  return (
    <div>
      {tab === 'news' && (
        <div className="container-page py-12">
          <div className="mb-8 flex justify-end">
            <Link to="/blog?tab=podcast" className="text-sm font-semibold text-ink/50 hover:text-ink">
              Подкаст →
            </Link>
          </div>

          {/* Единая база знаний — тот же компонент и те же материалы, что и
              на /kadry/employers, /kadry/candidates, /events, /community,
              сгруппированы по разделу вместо одной общей ленты. */}
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">База знаний</div>
          <h2 className="mb-6 text-2xl font-semibold">Гайды, чек-листы и статьи «Карьерного юриста»</h2>
          <div className="space-y-10">
            {knowledgeGroups.map((g) => (
              <div key={g.id} id={g.id}>
                <h3 className="mb-4 text-lg font-semibold">{g.label}</h3>
                <KnowledgeList audience={g.audience} eyebrow={`Блог · ${g.label}`} title={g.label} compact />
              </div>
            ))}
          </div>

          <div className="mt-14 border-t border-ink/10 pt-12">
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
