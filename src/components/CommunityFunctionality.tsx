const functionalityGroups = [
  {
    title: 'Построение карьеры',
    icon: 'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 7h16v13H4zM4 12c4 3 12 3 16 0M12 11v4',
    items: ['Составление и редактирование резюме', 'Шаблоны резюме', 'Подготовка к собеседованию'],
  },
  {
    title: 'Знакомство',
    icon: 'M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 2v3M3 22h15',
    items: ['Рандом-кофе', 'Онлайн-встречи', 'Офлайн-события', 'Чат в Телеграме', 'Групповые форматы работы'],
  },
]

const platformFeatures = ['Профиль резидента', 'Лента', 'Календарь', 'База знаний']

function OutlineIcon({ path, className = 'h-6 w-6' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={path} /></svg>
  )
}

export default function CommunityFunctionality() {
  return (
    <>
      <section id="functionality" className="scroll-mt-24 border-b border-ink/10 bg-white py-14">
        <div className="container-page">
          <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Функционал</h2>
          <div className="grid items-stretch gap-5 md:grid-cols-2">
            {functionalityGroups.map((group) => (
              <article key={group.title} className="rounded-2xl border border-accent/20 bg-accent/[0.05] p-6 sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-action"><OutlineIcon path={group.icon} /></span>
                  <h3 className="text-lg font-semibold sm:text-xl">{group.title}</h3>
                </div>
                <ul className="space-y-4 text-sm leading-relaxed text-ink/80 sm:text-base">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-3"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span>{item}</span></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="digital-platforms" className="container-page scroll-mt-24 py-14">
        <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Цифровые платформы</h2>
        <figure aria-label="Личный кабинет и Telegram Mini App объединены общими возможностями резидента" className="mx-auto max-w-3xl">
          <div className="grid grid-cols-2 items-stretch">
            {[
              { title: 'Личный кабинет', path: 'M3 4h18v13H3zM8 21h8M12 17v4' },
              { title: 'Telegram Mini App', path: 'm21 3-8 17-3-7-7-3L21 3ZM10 13 21 3' },
            ].map((platform) => (
              <div key={platform.title} className="flex min-h-32 w-[calc(100%_-_1rem)] max-w-72 flex-col items-center justify-center justify-self-center gap-3 rounded-2xl border border-accent/25 bg-accent/[0.05] px-3 py-5 text-center sm:min-h-36">
                <OutlineIcon path={platform.path} className="h-7 w-7 text-action sm:h-8 sm:w-8" />
                <h3 className="text-sm font-semibold sm:text-lg">{platform.title}</h3>
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="relative h-20 text-accent">
            <span className="absolute left-1/4 right-1/4 top-0 h-10 rounded-b-xl border-x-2 border-b-2 border-accent/60" />
            <span className="absolute left-1/2 top-10 h-9 -translate-x-1/2 border-l-2 border-accent/60" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute bottom-0 left-1/2 h-5 w-5 -translate-x-1/2"><path d="m6 9 6 6 6-6" /></svg>
          </div>
          <figcaption className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] to-white p-4 sm:p-6">
            <h3 className="mb-5 text-center text-sm font-semibold text-ink/70">Общие возможности</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {platformFeatures.map((feature) => (
                <li key={feature} className="flex min-h-20 items-center justify-center rounded-xl border border-ink/[0.06] bg-white px-3 py-4 text-center text-xs font-medium leading-relaxed sm:text-sm">{feature}</li>
              ))}
            </ul>
          </figcaption>
        </figure>
      </section>
    </>
  )
}
