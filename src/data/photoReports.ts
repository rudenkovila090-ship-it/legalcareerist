// Фотоотчёты с мероприятий. Страница отчёта открывается по адресу /events/<адрес мероприятия>/photos, а на странице самого
// мероприятия появляется кнопка «Фотоотчёт». Пока отчётов нет, список пуст и ни кнопки, ни страницы не видно.
// Как добавить отчёт — docs/photo-reports.md.
export interface PhotoReportPhoto {
  /** Имя файла в public/photoreports/<адрес мероприятия>/ */
  file: string
  alt: string
  caption?: string
  /** Размеры в пикселях: если заданы, место под снимок резервируется заранее и страница не прыгает при загрузке. */
  width?: number
  height?: number
}

export interface PhotoReport {
  /** Адрес (slug) мероприятия из src/data/events.ts */
  eventSlug: string
  description?: string
  photographer?: string
  photos: PhotoReportPhoto[]
}

export const photoReports: PhotoReport[] = []

export const getPhotoReport = (eventSlug: string | undefined) => photoReports.find((r) => r.eventSlug === eventSlug && r.photos.length > 0)

export const photoSrc = (r: PhotoReport, p: PhotoReportPhoto) => `/photoreports/${r.eventSlug}/${p.file}`
