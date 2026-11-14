import certificateRasoLbf from '../assets/certificate-raso-lbf-2026.jpg'

export default function CommunityAchievements() {
  return (
    <section id="achievements" className="container-page scroll-mt-24 py-14">
      <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Наши достижения</h2>
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <a href={certificateRasoLbf} target="_blank" rel="noreferrer" aria-label="Открыть сертификат рейтинга РАСО и Legal Business Forum">
            <img src={certificateRasoLbf} alt="Сертификат рейтинга РАСО и Legal Business Forum, 2026: 3-я группа — профессиональные сообщества; отдельно отмечены персональный бренд и интегральная оценка" className="aspect-[640/452] w-full object-contain" loading="lazy" width={640} height={452} />
          </a>
          <div className="p-5">
            <p className="text-xs font-medium text-accent">РАСО × Legal Business Forum · 2026</p>
            <h3 className="mt-2 text-lg font-semibold">3-я группа рейтинга</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">Вошли в 3-ю группу «Профессиональные сообщества» рейтинга репутационного капитала юридического рынка Москвы и Санкт-Петербурга. Отдельно отмечены в категориях «Персональный бренд» и «Интегральная оценка».</p>
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="flex aspect-[640/452] flex-col justify-center bg-ink p-7 text-white">
            <p className="text-xs uppercase tracking-wide text-white/60">XI конференция · 2026</p>
            <p className="mt-4 text-2xl font-semibold">Юридический бизнес России</p>
            <p className="mt-5 text-sm text-white/80">Благодарность информационному партнеру</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-accent">Москва · 8–9 октября 2026</p>
            <h3 className="mt-2 text-lg font-semibold">За развитие профессиональных связей</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">Получили благодарность за содействие в продвижении XI конференции «Юридический бизнес России» и укреплении профессиональных связей в юридическом сообществе.</p>
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="flex aspect-[640/452] flex-col justify-center bg-accent/[0.08] p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/60">Юридические клубы · 2025</p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[{ place: 8, label: 'Самые большие' }, { place: 12, label: 'Индекс качества' }, { place: 5, label: 'Самые вовлеченные' }].map((rating) => (
                <div key={rating.place} className="rounded-xl bg-white p-2 py-4">
                  <p className="text-3xl font-semibold text-accent">{rating.place}</p>
                  <p className="mt-1 text-[10px] text-ink/50">место</p>
                  <p className="mt-3 text-[11px] leading-relaxed text-ink/70">{rating.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-accent">Рейтинг юридических Telegram-каналов · 2025</p>
            <h3 className="mt-2 text-lg font-semibold">Среди юридических клубов</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink/70">
              <li>Самые большие — 8 место</li>
              <li>Индекс качества — 12 место</li>
              <li>Самые вовлеченные — 5 место</li>
            </ul>
          </div>
        </article>
      </div>
    </section>
  )
}
