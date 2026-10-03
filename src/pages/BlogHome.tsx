import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { NewsCard, ArticleCard } from '../components/cards'
import KnowledgeList from './KnowledgeList'
import { news } from '../data/news'
import { articles } from '../data/articles'
import { podcastEpisodes } from '../data/podcast'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { Article, NewsCategory } from '../types'

const blogTabs = [
  { id: 'news', label: 'Новости' },
  { id: 'community', label: 'Сообщество' },
] as const

// Порядок чипов — Все, затем разделы сайта в том же порядке, что и в
// главном меню (Кадры/Сообщество/Мероприятия/Маркетплейс), Подкаст —
// последним. Один и тот же ряд чипов фильтрует и новости, и статьи базы
// знаний вместе — единая лента, а не разнесенные по разделам блоки.
const categoryChips: NewsCategory[] = ['Карьерный юрист', 'Кадры', 'Сообщество', 'Мероприятия', 'Маркетплейс', 'Подкаст']

// Статья попадает в категорию через свою аудиторию (employers/candidates
// — Кадры, community — Сообщество, events — Мероприятия); одна статья
// может подходить сразу нескольким категориям, если аудиторий несколько.
function articleCategories(a: Article): NewsCategory[] {
  const cats = new Set<NewsCategory>()
  if (a.audience.includes('employers') || a.audience.includes('candidates')) cats.add('Кадры')
  if (a.audience.includes('community')) cats.add('Сообщество')
  if (a.audience.includes('events')) cats.add('Мероприятия')
  return [...cats]
}

// /blog — демо-каркас, добавлен по запросу рядом с Кадрами/Сообществом/
// Мероприятиями/Маркетплейсом. Наполнение еще не согласовано с бизнесом.
// Заголовок страницы снят с экрана по просьбе клиента. Единая лента
// (новости + статьи базы знаний) фильтруется одним рядом чипов —
// «Все» показывает вообще всё, каждый раздел — новости и материалы
// именно этого раздела вместе, «Подкаст» — сетку выпусков вместо ленты.
// Категория читается из ?category= при заходе, чтобы подвалы разделов
// могли прислать сразу на свою ветку (см. /blog?category=... в
// EventsFooter/CommunityFooter). Сообщество как отдельная вкладка
// остается доступно по прямой ссылке (?tab=community), тот же прием,
// что и у скрытых вкладок в /events и /kadry (см. featureFlags.ts).
export default function BlogHome() {
  useDocumentTitle('Блог')
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const validTabIds = new Set<string>(blogTabs.map((t) => t.id))
  const tab: (typeof blogTabs)[number]['id'] =
    tabParam && validTabIds.has(tabParam) ? (tabParam as (typeof blogTabs)[number]['id']) : 'news'

  const categoryParam = searchParams.get('category')
  const initialCategory: NewsCategory | 'all' =
    categoryParam && (categoryChips as string[]).includes(categoryParam) ? (categoryParam as NewsCategory) : 'all'
  const [category, setCategory] = useState<NewsCategory | 'all'>(initialCategory)

  const visibleNews = useMemo(
    () => (category === 'all' || category === 'Подкаст' ? (category === 'Подкаст' ? [] : news) : news.filter((n) => n.category === category)),
    [category],
  )
  const visibleArticles = useMemo(
    () =>
      category === 'Подкаст'
        ? []
        : articles.filter((a) => a.kind !== 'faq' && (category === 'all' || articleCategories(a).includes(category))),
    [category],
  )

  return (
    <div>
      {tab === 'news' && (
        <div className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Блог</div>
          <h2 className="mb-6 text-2xl font-semibold">Что нового у «Карьерного юриста»</h2>

          <div className="mb-8 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                category === 'all' ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
              }`}
            >
              Все
            </button>
            {categoryChips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  category === c ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {category === 'Подкаст' ? (
            <div>
              <p className="mb-8 max-w-2xl text-sm text-ink/60">
                Подкаст, в котором профессионалы из разных областей права и резиденты Сообщества
                рассказывают о своём опыте, карьерных сложностях и особенностях профессии, а также
                делятся практическими советами для тех, кто только начинает или уже строит свою
                юридическую карьеру.
              </p>
              <div className="mb-6 text-sm font-semibold uppercase tracking-wide text-ink/40">1 сезон</div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleNews.map((n) => (
                <NewsCard key={`n-${n.slug}`} n={n} />
              ))}
              {visibleArticles.map((a) => (
                <ArticleCard key={`a-${a.slug}`} a={a} />
              ))}
              {visibleNews.length === 0 && visibleArticles.length === 0 && (
                <p className="text-sm text-ink/50">В этой категории пока нет материалов.</p>
              )}
            </div>
          )}
        </div>
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
