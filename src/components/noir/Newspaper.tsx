import { useState } from 'react'
import type { EventPaper, NewsPage } from '../../data/eventStories'
import '../../pages/events/noir.css'

// «Новости бара» — газета, которая лежит на столе. Страницы листаются по клику (как лист в папке);
// пока страница одна — главная, остальные добавляются в данные (paper.pages) по мере появления материалов.

/** Всё, что газета берёт из самого мероприятия: так дата, место и цена не расходятся с остальной страницей. */
export interface PaperFacts {
  issue: string
  date: string
  time: string
  city: string
  venue?: string
  price: string
  question: string
  photo: string
}

function Page({ page, facts, paper }: { page: NewsPage; facts: PaperFacts; paper: EventPaper }) {
  return (
    <>
      <header className="np-mast">
        <span className="np-rule" aria-hidden="true" />
        <h3 className="np-name">{paper.name}</h3>
        <span className="np-rule" aria-hidden="true" />
        <p className="np-motto">{paper.motto}</p>
      </header>

      <div className="np-dateline">
        <span>Выпуск № {facts.issue}</span>
        <span>{facts.date}</span>
        <span>{facts.city}</span>
        <span>Цена {facts.price}</span>
      </div>

      <div className="np-head">
        {page.kicker && <p className="np-kicker">{page.kicker}</p>}
        <h4 className="np-headline">{page.headline}</h4>
        {page.subhead && <p className="np-subhead">{page.subhead}</p>}
      </div>

      <div className="np-grid">
        <div className="np-main">
          {page.photo && (
            <figure className="np-photo">
              <div className="np-photo-in">
                <img src={facts.photo} alt="" draggable={false} />
              </div>
              <figcaption>{page.photo.caption}</figcaption>
            </figure>
          )}
          {page.lead && <p className="np-lead">{page.lead}</p>}
          {page.paragraphs?.map((p) => (
            <p key={p} className="np-p">
              {p}
            </p>
          ))}
        </div>

        <aside className="np-side">
          {page.announce && (
            <>
              <section className="np-box" aria-label="Анонс">
                <h5>Анонс</h5>
                <dl>
                  <div>
                    <dt>Когда</dt>
                    <dd>
                      {facts.date}, {facts.time}
                    </dd>
                  </div>
                  <div>
                    <dt>Где</dt>
                    <dd>{[facts.city, facts.venue].filter(Boolean).join(', ')}</dd>
                  </div>
                  <div>
                    <dt>Вход</dt>
                    <dd>{facts.price}</dd>
                  </div>
                </dl>
              </section>

              <div className="np-coupon">
                <span className="np-scissors" aria-hidden="true">
                  ✂
                </span>
                <p>Билет на вечер</p>
                <a href="#register" onClick={(e) => e.stopPropagation()}>
                  Приобрести билет — {facts.price}
                </a>
              </div>
            </>
          )}

          {page.quote && (
            <blockquote className="np-quote">
              <p className="np-quote-l">{page.quote.label}</p>
              <p className="np-quote-t">«{page.quote.text ?? facts.question}»</p>
            </blockquote>
          )}
        </aside>
      </div>
    </>
  )
}

export default function Newspaper({ paper, facts }: { paper: EventPaper; facts: PaperFacts }) {
  const [cur, setCur] = useState(0)
  const { pages } = paper
  const go = (i: number) => setCur(Math.max(0, Math.min(pages.length - 1, i)))
  const many = pages.length > 1

  return (
    <div className="np" role="group" aria-roledescription="газета" aria-label={`Газета «${paper.name}»`}>
      <div className="np-stage">
        {pages.map((p, i) => (
          <article
            key={p.section}
            className="np-page"
            aria-hidden={i !== cur}
            data-flipped={i < cur ? '' : undefined}
            data-current={i === cur ? '' : undefined}
            data-more={many && i < pages.length - 1 ? '' : undefined}
            style={{ zIndex: i < cur ? 10 + i : pages.length - i }}
            onClick={() => i === cur && i < pages.length - 1 && go(i + 1)}
          >
            <Page page={p} facts={facts} paper={paper} />
            <div className="np-foot">
              <span>{many ? `Стр. ${i + 1} из ${pages.length} · ${p.section}` : 'Продолжение следует…'}</span>
            </div>
          </article>
        ))}
      </div>

      {many && (
        <div className="cf-nav">
          <button type="button" className="cf-arrow" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Предыдущая страница">
            ←
          </button>
          <div className="cf-dots" aria-hidden="true">
            {pages.map((p, i) => (
              <span key={p.section} data-active={i === cur ? '' : undefined} />
            ))}
          </div>
          <button type="button" className="cf-arrow" onClick={() => go(cur + 1)} disabled={cur === pages.length - 1} aria-label="Следующая страница">
            →
          </button>
        </div>
      )}
    </div>
  )
}
