import { useState } from 'react'
import '../../pages/events/noir.css'

interface CasePage {
  label: string
  text: string
}

/**
 * Папка с делом: вкладки сверху, страницы-карточки внутри. При переключении страница
 * переворачивается, как лист в папке (формат → жанр → цель). Стрелки и клик по странице — вперёд/назад.
 */
export default function CaseFile({ pages }: { pages: CasePage[] }) {
  const [cur, setCur] = useState(0)
  const go = (i: number) => setCur(Math.max(0, Math.min(pages.length - 1, i)))

  return (
    <div className="cf">
      <div className="cf-tabs" role="tablist" aria-label="Страницы досье">
        {pages.map((p, i) => (
          <button key={p.label} type="button" role="tab" aria-selected={i === cur} data-active={i === cur ? '' : undefined} className="cf-tab" onClick={() => go(i)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="cf-folder">
        <div className="cf-stage">
          {pages.map((p, i) => (
            <article
              key={p.label}
              role="tabpanel"
              aria-hidden={i !== cur}
              data-flipped={i < cur ? '' : undefined}
              data-current={i === cur ? '' : undefined}
              className="cf-page"
              style={{ zIndex: i < cur ? 10 + i : pages.length - i }}
              onClick={() => i === cur && i < pages.length - 1 && go(i + 1)}
            >
              <div className="cf-head">
                <span className="cf-label">{p.label}</span>
                <span className="cf-stamp">Конфиденциально</span>
              </div>
              <p className="cf-text">{p.text}</p>
              <div className="cf-foot">
                Стр. {i + 1} из {pages.length}
              </div>
            </article>
          ))}
        </div>

        <div className="cf-nav">
          <button type="button" className="cf-arrow" onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="Предыдущая страница">
            ←
          </button>
          <div className="cf-dots" aria-hidden="true">
            {pages.map((p, i) => (
              <span key={p.label} data-active={i === cur ? '' : undefined} />
            ))}
          </div>
          <button type="button" className="cf-arrow" onClick={() => go(cur + 1)} disabled={cur === pages.length - 1} aria-label="Следующая страница">
            →
          </button>
        </div>
      </div>
    </div>
  )
}
