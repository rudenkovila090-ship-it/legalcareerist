import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { MARKETING_CONSENT_VERSION } from '../../lib/consent'

// Согласие на рекламные и информационные сообщения (ст. 18 38-ФЗ «О рекламе»): необязательная третья галочка под формами
// (см. ConsentCheck). Не объединяется с согласием на обработку (/legal/consent) и не является условием покупки или услуги.
// Редакция текста — MARKETING_CONSENT_VERSION в src/lib/consent.ts.
export default function MarketingConsent() {
  useDocumentTitle('Согласие на получение рекламных и информационных сообщений')
  return (
    <div>
      <PageHero eyebrow="Документы" title="Согласие на получение рекламных и информационных сообщений" />

      <div className="container-page py-10">
        <div className="mx-auto max-w-3xl space-y-10">
          <section className="text-sm leading-relaxed text-ink/80">
            <h2 className="mb-3 text-lg font-semibold text-ink">
              Реклама и рассылки <span className="font-normal text-ink/40">· редакция от {MARKETING_CONSENT_VERSION.split('-').reverse().join('.')}</span>
            </h2>
            <ol className="list-inside list-decimal space-y-2">
              <li>
                Отмечая галочку «Хочу получать рекламные и информационные сообщения» в форме на сайте, я даю Оператору (реквизиты — ниже)
                согласие на получение сообщений рекламного и информационного характера: о мероприятиях, полезных материалах,
                сообществе, карьерных консультациях и других услугах Оператора.
              </li>
              <li>
                <span className="font-medium text-ink">Каналы:</span> адрес электронной почты, который я указал в форме, и Telegram —
                через чат-бот Оператора{' '}
                <a className="underline" href="https://t.me/legalcareerist_bot" target="_blank" rel="noreferrer">@legalcareerist_bot</a>{' '}
                (если я запускал бота). Телефон для рекламы не используется.
              </li>
              <li>
                <span className="font-medium text-ink">Данные:</span> фамилия, имя, отчество, адрес электронной почты, номер телефона,
                ник и идентификатор в Telegram — в объёме, который я указал в форме и в чат-боте.
              </li>
              <li>
                Согласие даётся добровольно и отдельно от согласия на обработку персональных данных. Оно не является условием
                покупки, участия в мероприятии, вступления в сообщество или получения услуги: без него форма отправляется так же.
              </li>
              <li>
                <span className="font-medium text-ink">Срок действия:</span> с момента отправки формы и до моего отзыва согласия.
              </li>
              <li>
                <span className="font-medium text-ink">Как отозвать:</span> в любое время, написав Оператору на{' '}
                <a className="underline" href="mailto:rudenkov.ilia@yandex.ru">rudenkov.ilia@yandex.ru</a> с указанием адреса почты или
                ника, на которые приходят сообщения, либо отключив рассылку в чат-боте. После отзыва Оператор прекращает рассылку;
                обязательные сообщения по заказу (подтверждение оплаты, билет, напоминание о мероприятии, ссылка на материал)
                не являются рекламой и продолжают приходить.
              </li>
            </ol>
          </section>

          <section className="text-sm leading-relaxed text-ink/80">
            <h2 className="mb-2 text-lg font-semibold text-ink">Оператор</h2>
            <p>
              Индивидуальный предприниматель Руденков Илья Владиславович<br />
              ИНН 262607024144 · ОГРНИП 325784700110048<br />
              Адрес: 197725, г. Санкт-Петербург, Туристская ул., д. 28, к. 1<br />
              E-mail: <a className="underline" href="mailto:rudenkov.ilia@yandex.ru">rudenkov.ilia@yandex.ru</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
