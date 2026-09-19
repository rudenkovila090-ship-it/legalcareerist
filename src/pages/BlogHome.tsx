import { useState } from 'react'
import PageHero from '../components/PageHero'
import { NewsCard } from '../components/cards'
import KnowledgeList from './KnowledgeList'
import { news } from '../data/news'
import { podcastEpisodes } from '../data/podcast'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const blogTabs = [
  { id: 'news', label: 'Новости' },
  { id: 'podcast', label: 'Подкаст' },
  { id: 'community', label: 'Сообщество' },
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
        description="Статьи о карьере в праве, подборе персонала и юридическом рынке."
      />

      {/* Подвкладки — Новости / Подкаст */}
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
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Новости</div>
          <h2 className="mb-6 text-2xl font-semibold">Что нового у «Карьерного юриста»</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((n) => (
              <NewsCard key={n.slug} n={n} />
            ))}
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
