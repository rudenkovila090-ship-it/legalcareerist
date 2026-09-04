import { useSearchParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { openTelegramBot } from '../../lib/telegram'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// Страница, на которую Prodamus возвращает человека после успешной оплаты
// подписки (urlSuccess в server/lib/prodamus.js). Токен связывает оплату
// с заявкой в server/lib/store.js — по нему бот узнает, что показывать
// после Start.
export default function JoinSuccess() {
  useDocumentTitle('Оплата прошла успешно')
  const [params] = useSearchParams()
  const token = params.get('token')

  function handleContinue() {
    if (token) openTelegramBot(`access_${token}`)
  }

  return (
    <div>
      <PageHero
        eyebrow="Сообщество"
        title="Оплата прошла успешно"
        description="Осталось получить доступ — это займет одну минуту в Telegram."
      />
      <section className="container-page pb-16">
        <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
          <div className="mb-3 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
          </div>
          <p className="text-sm leading-relaxed text-ink/70">
            Подписка оформлена. Нажмите кнопку ниже, чтобы открыть чат с ботом — как только нажмете там Start,
            бот пришлет ссылку на вступление в закрытое сообщество.
          </p>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!token}
            className="mt-6 rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-50"
          >
            Перейти в бота
          </button>
          {!token && <p className="mt-3 text-xs text-red-600">Не нашли данные об оплате — напишите нам, если ссылка не сработала.</p>}
        </div>
      </section>
    </div>
  )
}
