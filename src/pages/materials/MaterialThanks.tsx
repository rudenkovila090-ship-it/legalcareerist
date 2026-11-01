import { Link, useSearchParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { usePaymentGoal } from '../../lib/paymentGoal'

// Страница после оплаты материала — Prodamus возвращает сюда (urlSuccess в server/index.js, /api/marketplace/purchase).
// Покупатель получает на почту письмо с личной ссылкой на файл (действует 7 дней, страница /materials/download).
// Сама страница данных покупателя и файла не показывает: токен в адресе нужен только для отметки об оплате в Метрике.
export default function MaterialThanks() {
  useDocumentTitle('Оплата получена')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  usePaymentGoal('product', token)

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
            Мы отправили на почту, которую вы указали, письмо с личной ссылкой на материал. Ссылка действует 7 дней: скачайте файл за это
            время. Обычно письмо приходит в течение нескольких минут. Если его нет, загляните в папку «Спам».
          </p>

          <p className="mt-6 text-xs text-ink/50">
            Не пришло письмо, не открывается ссылка или срок закончился? Напишите в поддержку, пришлём новую ссылку:{' '}
            <a className="underline" href="https://t.me/legalcareerist_support" target="_blank" rel="noreferrer">@legalcareerist_support</a>
          </p>
          <Link to="/marketplace" className="mt-4 inline-block text-sm font-medium text-ink underline">В маркетплейс</Link>
        </div>
      </section>
    </div>
  )
}
