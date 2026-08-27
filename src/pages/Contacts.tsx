import PageHero from '../components/PageHero'
import LeadForm from '../components/LeadForm'
import type { LeadSourceBlock } from '../types'

export default function Contacts({ eyebrow, sourceBlock }: { eyebrow: string; sourceBlock: LeadSourceBlock }) {
  return (
    <div>
      <PageHero eyebrow={eyebrow} title="Контакты" description="Свяжитесь с нами удобным способом." prototype />
      <div className="container-page grid gap-8 py-12 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Email</div>
            <div className="font-medium">hello@career-lawyer.example</div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Телефон</div>
            <div className="font-medium">+7 495 000-00-00</div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Telegram</div>
            <div className="font-medium">@career_lawyer_bot</div>
          </div>
        </div>
        <LeadForm sourceBlock={sourceBlock} formType="contact" title="Написать нам" />
      </div>
    </div>
  )
}
