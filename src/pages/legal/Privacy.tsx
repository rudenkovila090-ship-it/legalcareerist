import { useSyncExternalStore } from 'react'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// Политика обработки персональных данных публикуется файлом PDF без изменений: полный текст документа, как он утверждён.
// Чтобы выпустить новую редакцию, замените файл в public/documents/ и поменяйте дату и размер ниже — параметр ?v= в ссылке
// заставит браузеры забрать новый файл, а не показать старую копию из кэша.
const POLICY = {
  file: '/documents/politika-obrabotki-personalnykh-dannykh.pdf',
  version: '2026-10-17',
  date: '17.10.2026',
  pages: 21,
  sizeKb: 463,
}
const url = `${POLICY.file}?v=${POLICY.version}`

const WIDE = '(min-width: 768px)'
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

export default function Privacy() {
  useDocumentTitle('Политика обработки персональных данных')
  // Встроенный просмотр PDF есть только в настольных браузерах; на телефоне файл открывается в системном просмотрщике.
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false)
  return (
    <div>
      <PageHero eyebrow="Документы" title="Политика в области обработки персональных данных" description={`Редакция от ${POLICY.date} г. Документ целиком, без сокращений.`} />

      <div className="container-page py-10">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
            <div className="min-w-0">
              <div className="text-lg font-semibold">Политика в области обработки персональных данных</div>
              <div className="mt-1 text-sm text-ink/60">
                ИП Руденков И. В. · PDF, {POLICY.pages} стр., {POLICY.sizeKb} КБ
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={url} target="_blank" rel="noopener" className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                Открыть PDF
              </a>
              <a href={url} download="politika-obrabotki-personalnykh-dannykh.pdf" className="rounded-full border border-ink/15 px-6 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink">
                Скачать
              </a>
            </div>
          </div>

          {wide ? (
            <object data={url} type="application/pdf" aria-label="Политика в области обработки персональных данных" className="h-[80vh] min-h-[480px] w-full rounded-2xl border border-ink/10 bg-white">
              <p className="p-6 text-sm text-ink/60">
                Браузер не показывает PDF прямо на странице. Откройте документ кнопкой «Открыть PDF» выше.
              </p>
            </object>
          ) : (
            <p className="text-sm text-ink/60">Нажмите «Открыть PDF» — документ откроется в просмотрщике вашего телефона.</p>
          )}

          <p className="text-xs text-ink/50">
            Вопросы по обработке персональных данных, отзыв согласия и запросы на удаление данных: <a className="underline hover:text-ink" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
