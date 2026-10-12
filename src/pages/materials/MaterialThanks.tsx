import { Link, useSearchParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const BOT_USERNAME = 'LegalcareeristBot'

// Страница после оплаты материала — Prodamus возвращает сюда (urlSuccess в server/index.js, /api/marketplace/purchase).
// Личного кабинета и скачивания по ссылке нет: файл приходит на почту, а в Telegram — по кнопке ниже
// (бот по токену покупки находит её и присылает файл). Сама страница данных покупателя не показывает.
export default function MaterialThanks() {
  useDocumentTitle('Оплата получена')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const telegramUrl = /^[0-9a-f]{8,64}$/i.test(token) ? `https://t.me/${BOT_USERNAME}?start=mat_${token}` : null

  return (
    <div>
      <PageHero eyebrow="Маркетплейс" title="Спасибо за покупку!" />

      <section className="container-page pb-16">
        <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
          <div className="mb-3 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
          </div>
          <div className="font-semibold">Оплата получена</div>
          <p className="mt-2 text-sm text-ink/60">
            Материал в формате PDF мы отправили на почту, которую вы указали. Обычно письмо приходит в течение нескольких минут.
            Если его нет, загляните в папку «Спам».
          </p>

          {telegramUrl && (
            <>
              <p className="mt-6 text-sm text-ink/60">Хотите получить файл и в Telegram?</p>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90"
              >
                Получить в Telegram
              </a>
            </>
          )}

          <p className="mt-6 text-xs text-ink/50">
            Не пришло письмо или не открывается файл? Напишите в поддержку:{' '}
            <a className="underline" href="https://t.me/legalcareerist_support" target="_blank" rel="noreferrer">@legalcareerist_support</a>
          </p>
          <Link to="/marketplace" className="mt-4 inline-block text-sm font-medium text-ink underline">В маркетплейс</Link>
        </div>
      </section>
    </div>
  )
}
