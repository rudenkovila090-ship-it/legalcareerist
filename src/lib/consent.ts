// Согласия при отправке форм. Под каждой формой три отдельные галочки (см. ConsentCheck):
//   policy     — ознакомлен с Политикой обработки персональных данных (обязательна);
//   processing — согласие на обработку персональных данных (обязательна);
//   marketing  — согласие на рекламные и информационные сообщения (по желанию).
// Обязательные — обычные <input type="checkbox" required>: браузер не даст отправить форму, пока они не отмечены.
// Обработчик формы читает состояние через consentOf(e) и передаёт на сервер вместе с заявкой в поле consent —
// там факт и время согласий записываются в журнал (server/lib/consentLog.js).

export interface ConsentChoice {
  policy: boolean
  processing: boolean
  marketing: boolean
}

/** Версия текста согласия на странице /legal/consent — меняйте, когда меняется текст, чтобы в журнале было видно, с какой редакцией согласились. */
export const CONSENT_VERSION = '2026-10-17'

/** Редакция отдельного согласия на публикацию отзыва (/legal/consent-publication). */
export const PUBLICATION_CONSENT_VERSION = '2026-10-14'

/**
 * Редакция согласия на рекламные и информационные сообщения (/legal/marketing-consent): дата выкладки файла на сайт.
 * В самом документе указана своя дата (01.09.2025).
 */
export const MARKETING_CONSENT_VERSION = '2026-10-17'

const checked = (form: HTMLFormElement, name: string) => {
  const field = form.elements.namedItem(name)
  return field instanceof HTMLInputElement && field.checked
}

/** Что отмечено в форме, из которой пришло событие submit. Читать нужно сразу, до первого await. */
export function consentOf(e: { currentTarget: EventTarget }): ConsentChoice {
  const form = e.currentTarget
  if (!(form instanceof HTMLFormElement)) return { policy: false, processing: false, marketing: false }
  return { policy: checked(form, 'policy'), processing: checked(form, 'processing'), marketing: checked(form, 'marketing') }
}
