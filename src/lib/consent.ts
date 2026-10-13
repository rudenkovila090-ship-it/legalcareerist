// Согласие на обработку персональных данных при отправке форм.
// Галочка — обычный <input type="checkbox" name="consent" required> (см. ConsentCheck): браузер не даст
// отправить форму, пока она не отмечена, а обработчик формы читает её состояние через consentOf(e) и передаёт
// на сервер вместе с заявкой — там факт и время согласия записываются в журнал (server/lib/consentLog.js).

/** Версия текста согласия на странице /legal/consent — меняйте, когда меняется текст, чтобы в журнале было видно, с какой редакцией согласились. */
export const CONSENT_VERSION = '2025-09-01'

/** Редакция отдельного согласия на публикацию отзыва (/legal/consent-publication). */
export const PUBLICATION_CONSENT_VERSION = '2026-10-14'

/** Отмечена ли галочка согласия в форме, из которой пришло событие submit. Читать нужно сразу, до первого await. */
export function consentOf(e: { currentTarget: EventTarget }): boolean {
  const form = e.currentTarget
  if (!(form instanceof HTMLFormElement)) return false
  const field = form.elements.namedItem('consent')
  return field instanceof HTMLInputElement && field.checked
}
