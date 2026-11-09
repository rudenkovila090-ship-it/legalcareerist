import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BodyContext } from './sectionBodies'
import { ExpectationsSection, PracticesSection, PrivacySection } from './ProfileSections'
import { DocumentsSection } from './DocumentsSections'

/** Одна форма и одно серверное хранилище для вакансий и построения карьеры. */
export default function ProfessionalProfile({ ctx, initial }: { ctx: BodyContext; initial?: string }) {
  const partOf = (value?: string) => value === 'expectations' || value === 'privacy' || value === 'documents' ? value : 'practices'
  const [part, setPart] = useState(partOf(initial))
  return <div className="space-y-4">
    <div className="rounded-2xl bg-white p-4">
      <h2 className="text-base font-semibold">Профессиональный профиль</h2>
      <p className="mt-1 text-sm text-ink/60">Заполните один раз: опыт, практики и ожидания используются в вакансиях и построении карьеры.</p>
      <p className="mt-2 text-xs text-ink/55">Имя и контакты — в <Link to="/cabinet/profile" className="font-medium underline underline-offset-2">личном профиле</Link>. Резюме — в <Link to="/cabinet/cv" className="font-medium underline underline-offset-2">документах и CV</Link>.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Данные профессионального профиля">
        {Object.entries({ practices: 'Практики и опыт', expectations: 'Карьерные ожидания', privacy: 'Конфиденциальность', documents: 'Документы' }).map(([id, label]) => <button type="button" key={id} aria-pressed={part === id} onClick={() => setPart(partOf(id))} className={`rounded-full px-3 py-2 text-xs font-medium ${part === id ? 'bg-ink text-white' : 'bg-ink/5 text-ink/65 hover:bg-ink/10'}`}>{label}</button>)}
      </div>
      {initial === 'expert' && <p className="mt-3 text-xs text-ink/60">Проверка резюме экспертом пока в разработке. Ваш профиль и документы уже можно заполнить.</p>}
    </div>
    {part === 'practices' && <PracticesSection />}
    {part === 'expectations' && <ExpectationsSection />}
    {part === 'privacy' && <PrivacySection onSaved={() => void ctx.onRefresh()} />}
    {part === 'documents' && <DocumentsSection />}
  </div>
}
