import certificateRasoLbf from '../assets/certificate-raso-lbf-2026.jpg'
import conferenceThanks from '../assets/achievements/conference-thanks-2026.png'
import telegramRating from '../assets/achievements/legal-telegram-rating-2025.jpg'

function AchievementImage({ src, alt, label, width, height }: { src: string; alt: string; label: string; width: number; height: number }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" aria-label={label} className="block aspect-[640/452] overflow-hidden bg-[#05264a]">
      <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" width={width} height={height} />
    </a>
  )
}

export default function CommunityAchievements() {
  return (
    <section id="achievements" className="container-page scroll-mt-24 py-14">
      <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Наши достижения</h2>
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <AchievementImage src={certificateRasoLbf} alt="Сертификат рейтинга РАСО и Legal Business Forum, 2026: 3-я группа — профессиональные сообщества; отдельно отмечены персональный бренд и интегральная оценка" label="Открыть сертификат рейтинга РАСО и Legal Business Forum" width={640} height={452} />
          <div className="p-5">
            <p className="min-h-8 text-xs font-medium leading-4 text-accent">РАСО × Legal Business Forum · 2026</p>
            <h3 className="mt-2 min-h-14 text-lg font-semibold">3-я группа рейтинга</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">3-я группа рейтинга в группе «Профессиональные сообщества»</p>
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <AchievementImage src={conferenceThanks} alt="Благодарность информационному партнеру «Карьерный юрист» от XI конференции «Юридический бизнес России 2026»" label="Открыть оригинал благодарности информационному партнеру" width={4200} height={2968} />
          <div className="p-5">
            <p className="min-h-8 text-xs font-medium leading-4 text-accent">Москва · 8–9 октября 2026</p>
            <h3 className="mt-2 min-h-14 text-lg font-semibold">За развитие профессиональных связей</h3>
          </div>
        </article>
        <article className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <AchievementImage src={telegramRating} alt="Оригинальная карточка рейтинга юридических Telegram-каналов 2025 для «Карьерного юриста»" label="Открыть оригинал рейтинга юридических Telegram-каналов 2025" width={1280} height={780} />
          <div className="p-5">
            <p className="min-h-8 text-xs font-medium leading-4 text-accent">Рейтинг юридических Telegram-каналов · 2025</p>
            <h3 className="mt-2 min-h-14 text-lg font-semibold">Среди юридических клубов</h3>
          </div>
        </article>
      </div>
    </section>
  )
}
