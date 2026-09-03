import { Link, useParams } from 'react-router-dom'
import { clubs } from '../../data/clubs'
import { TagRow } from '../../components/Tag'
import RelatedContentBlock from '../../components/RelatedContentBlock'
import { getRelatedContent } from '../../lib/related'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export default function ClubDetail() {
  const { slug } = useParams()
  const club = clubs.find((c) => c.slug === slug)
  useDocumentTitle(club?.name ?? 'Клуб не найден')

  if (!club) {
    return (
      <div className="container-page py-16">
        <p>Клуб не найден. <Link className="underline" to="/community">К списку клубов</Link></p>
      </div>
    )
  }

  const related = getRelatedContent(club, 'club', club.id)

  return (
    <div className="container-page py-12">
      <Link to="/community" className="text-sm text-ink/50 hover:text-ink">← Все клубы</Link>
      <div className="mx-auto mt-4 max-w-3xl">
        <h1 className="text-3xl font-semibold">{club.name}</h1>
        <div className="mt-3">
          <TagRow specialization={club.specialization} industry={club.industry} />
        </div>
        <p className="mt-6 leading-relaxed text-ink/80">{club.description}</p>
        <div className="mt-4 text-sm text-ink/60">Координатор: {club.coordinator}</div>
        <a
          href={club.telegramLink}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-block rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
        >
          Вступить в Telegram-чат клуба
        </a>

        <RelatedContentBlock items={related} title="Обсудить с другими: связанные материалы и вакансии" />
      </div>
    </div>
  )
}
