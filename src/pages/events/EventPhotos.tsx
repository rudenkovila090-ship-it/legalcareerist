import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { events } from '../../data/events'
import { getPhotoReport, photoSrc } from '../../data/photoReports'
import { Masonry } from '../../components/layouts'
import Lightbox from '../../components/Lightbox'
import { pluralRu } from '../../lib/plural'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useSocialMeta } from '../../lib/useSocialMeta'
import { useNoindex } from '../../lib/pageMeta'
import EventsFooter from './EventsFooter'

// Страница фотоотчёта с мероприятия: схема Masonry (снимки разной высоты без пустот), по нажатию снимок открывается на весь экран.
export default function EventPhotos() {
  const { slug } = useParams()
  const event = events.find((e) => e.slug === slug)
  const report = getPhotoReport(slug)
  const [open, setOpen] = useState<number | null>(null)
  useDocumentTitle(event && report ? `Фотоотчёт: ${event.title}` : 'Фотоотчёта пока нет')
  useNoindex(!event || !report)
  useSocialMeta({
    title: event && report ? `Фотоотчёт: ${event.title}` : undefined,
    description: report?.description ?? (event ? `Фотографии с мероприятия «${event.title}»` : undefined),
    path: slug ? `/events/${slug}/photos` : undefined,
  })

  if (!event || !report) {
    return (
      <div>
        <div className="container-page py-16">
          <h1 className="text-2xl font-semibold">Фотоотчёта пока нет</h1>
          <p className="mt-3 text-ink/70">
            {event ? <>Фотографии с мероприятия появятся после его проведения. <Link className="underline" to={`/events/${event.slug}`}>К мероприятию</Link></> : <Link className="underline" to="/events">Все мероприятия</Link>}
          </p>
        </div>
        <EventsFooter />
      </div>
    )
  }

  const date = new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })
  const photos = report.photos.map((p) => ({ src: photoSrc(report, p), alt: p.alt, caption: p.caption }))

  return (
    <div>
      <div className="container-page pb-12 pt-8">
        <Link to={`/events/${event.slug}`} className="text-sm text-ink/50 hover:text-ink">← К мероприятию</Link>
        <div className="mt-4 text-sm font-medium uppercase tracking-wide text-gold">Фотоотчёт</div>
        <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{event.title}</h1>
        <div className="mt-2 text-sm text-ink/60">
          {date} · {event.format === 'online' ? 'Онлайн' : event.city} · {report.photos.length} {pluralRu(report.photos.length, ['фотография', 'фотографии', 'фотографий'])}
        </div>
        {report.description && <p className="mt-4 max-w-2xl leading-relaxed text-ink/70">{report.description}</p>}
        {report.photographer && <p className="mt-2 text-sm text-ink/50">Фотограф: {report.photographer}</p>}

        <Masonry columns={3} className="mt-8">
          {report.photos.map((p, i) => (
            <figure key={p.file} className="overflow-hidden rounded-xl bg-ink/5">
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Открыть фото ${i + 1}: ${p.alt}`}
                className="group block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <img
                  src={photos[i].src}
                  alt={p.alt}
                  width={p.width}
                  height={p.height}
                  loading="lazy"
                  className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </button>
              {p.caption && <figcaption className="px-3 py-2 text-xs text-ink/60">{p.caption}</figcaption>}
            </figure>
          ))}
        </Masonry>
      </div>
      {open !== null && <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
      <EventsFooter />
    </div>
  )
}
