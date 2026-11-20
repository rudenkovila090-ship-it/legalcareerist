import { useState } from 'react'

/** Placeholder wordmarks until real community partners are supplied. */
export default function CommunityPartners() {
  const [paused, setPaused] = useState(false)
  return (
    <section id="partners" className="community-partners" aria-labelledby="community-partners-title">
      <div className="container-page community-partners-heading">
        <h2 id="community-partners-title">Партнеры</h2>
      </div>
      <p className="sr-only">Партнеры сообщества — раздел в разработке.</p>
      <div className="community-partners-marquee" role="region" aria-label={`Лента партнеров — в разработке. Пробел: ${paused ? 'продолжить' : 'остановить'} движение.`} tabIndex={0} onKeyDown={event => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        setPaused(value => !value)
      }}>
        <div className="community-partners-track" aria-hidden="true" style={{ animationPlayState: paused ? 'paused' : undefined }}>
          {[0, 1].map(copy => <div key={copy} className="community-partners-group">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="community-partner-placeholder"><span>В разработке</span><small>Партнеры сообщества</small></div>)}
          </div>)}
        </div>
      </div>
    </section>
  )
}
