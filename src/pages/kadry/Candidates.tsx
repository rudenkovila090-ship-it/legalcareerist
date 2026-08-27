import PageHero from '../../components/PageHero'
import LeadForm from '../../components/LeadForm'

export default function Candidates() {
  return (
    <div>
      <PageHero
        eyebrow="Кадры · Соискателям"
        title="Найдём позицию под вашу специализацию"
        description="Загрузите резюме — при желании анонимно. Компания увидит обезличенный профиль первой, контакты откроются после вашего отклика или её интереса."
      />
      <section className="container-page grid gap-6 py-12 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-ink/10 bg-white p-5">
            <div className="font-semibold">Анонимное резюме</div>
            <p className="mt-1 text-sm text-ink/60">
              Полезно, если вы не хотите, чтобы текущий работодатель узнал о поиске. Переключить
              видимость можно в личном кабинете в любой момент.
            </p>
          </div>
          <div className="rounded-xl border border-ink/10 bg-white p-5">
            <div className="font-semibold">Личный кабинет</div>
            <p className="mt-1 text-sm text-ink/60">
              Все отклики, статус резюме, покупки материалов и членство в клубах сообщества — в
              одном месте, без повторной регистрации.
            </p>
          </div>
          <div className="rounded-xl border border-ink/10 bg-white p-5">
            <div className="font-semibold">Telegram-бот</div>
            <p className="mt-1 text-sm text-ink/60">
              Подпишитесь на @career_lawyer_bot, чтобы получать релевантные вакансии по вашей
              специализации без захода на сайт.
            </p>
          </div>
        </div>
        <LeadForm
          sourceBlock="kadry"
          formType="candidate_signup"
          title="Зарегистрироваться как соискатель"
          description="Оставьте контакт — пришлём ссылку на анкету резюме."
          interestOptions={['Адвокатура', 'Консалтинг', 'Инхаус', 'Госслужба']}
        />
      </section>
    </div>
  )
}
