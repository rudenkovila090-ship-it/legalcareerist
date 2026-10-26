import type { ReactNode } from 'react'
import type { CabinetUser } from '../../lib/cabinet'
import { ActivitySection, ProfileInfoSection, SettingsSection } from './AccountSections'
import { ExpectationsSection, PracticesSection, PrivacySection } from './ProfileSections'
import { ConsentsSection, MyDataSection, VisibilitySection } from './DataSections'
import { EventsSection, StatusSection, TelegramSection } from './CommunitySections'
import { PodcastSection, VacanciesSection } from './CareerSections'
import { CvSection, DocumentsSection } from './DocumentsSections'
import { HelpSection, SupportSection } from './HelpSections'
import { PasswordSection } from './AccountAccess'

export interface BodyContext {
  user: CabinetUser
  /** Обновить данные вошедшего и сводку обзора. */
  onRefresh: () => Promise<void>
  /** Человек открыл чат поддержки: сводку (число непрочитанных) нужно перечитать. */
  onRead: () => void
}

/** Содержимое готового раздела; null — раздел ещё не сделан (показывается «В разработке» с перечнем). */
export function sectionBody(id: string, { user, onRefresh, onRead }: BodyContext): ReactNode | null {
  switch (id) {
    case 'profile': return <ProfileInfoSection user={user} onSaved={onRefresh} />
    case 'activity': return <ActivitySection />
    case 'settings': return <SettingsSection user={user} />
    case 'password': return <PasswordSection user={user} />
    case 'help': return <HelpSection />
    case 'support': return <SupportSection onRead={onRead} />
    case 'privacy': return <PrivacySection onSaved={() => void onRefresh()} />
    case 'practices': return <PracticesSection />
    case 'expectations': return <ExpectationsSection />
    case 'documents': return <DocumentsSection />
    case 'consents': return <ConsentsSection user={user} onRefresh={onRefresh} />
    case 'mydata': return <MyDataSection />
    case 'visibility': return <VisibilitySection />
    case 'resident': return <StatusSection user={user} onRefresh={onRefresh} />
    case 'events': return <EventsSection />
    case 'telegram': return <TelegramSection user={user} onRefresh={onRefresh} />
    case 'vacancies': return <VacanciesSection />
    case 'podcast': return <PodcastSection />
    case 'cv': return <CvSection />
    default: return null
  }
}
