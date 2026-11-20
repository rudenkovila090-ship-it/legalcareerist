import { useState } from 'react'

/** Placeholder wordmarks until real community partners are supplied. */
export default function CommunityPartners() {
  const [paused, setPaused] = useState(false)
  return (
    <section id="partners" className="community-partners" aria-labelledby="community-partners-title">
      <div className="container-page community-partners-heading">
        <h2 id="community-partners-title">Партнеры</h2>
        <button type="button" className="community-partners-pause" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={paused ? 'Продолжить ленту партнеров' : 'Приостановить ленту партнеров'} title={paused ? 'Продолжить ленту' : 'Приостановить ленту'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paused ? <path d="m9 5 10 7-10 7V5Z" /> : <path d="M8 5v14M16 5v14" />}</svg>
        </button>
      </div>
      <p className="sr-only">Партнеры сообщества — раздел в разработке.</p>
      <div className="community-partners-marquee" aria-hidden="true">
        <div className="community-partners-track" style={{ animationPlayState: paused ? 'paused' : undefined }}>
          {[0, 1].map(copy => <div key={copy} className="community-partners-group">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="community-partner-placeholder"><span>В разработке</span><small>Партнеры сообщества</small></div>)}
          </div>)}
        </div>
      </div>
    </section>
  )
}
