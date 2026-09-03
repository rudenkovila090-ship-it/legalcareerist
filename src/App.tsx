import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'

// Каждая страница — отдельный чанк, подгружается только при переходе на неё.
// Экономит первый экран: раньше весь сайт грузился одним файлом ~650 КБ.
const Home = lazy(() => import('./pages/Home'))
const KadryHome = lazy(() => import('./pages/kadry/KadryHome'))
const Candidates = lazy(() => import('./pages/kadry/Candidates'))
const CareerReserve = lazy(() => import('./pages/kadry/CareerReserve'))
const CareerConsultation = lazy(() => import('./pages/kadry/CareerConsultation'))
const Vacancies = lazy(() => import('./pages/kadry/Vacancies'))
const Salary = lazy(() => import('./pages/kadry/Salary'))
const VacancyDetail = lazy(() => import('./pages/VacancyDetail'))
const KnowledgeList = lazy(() => import('./pages/KnowledgeList'))
const ArticleDetail = lazy(() => import('./pages/ArticleDetail'))
const CommunityHome = lazy(() => import('./pages/community/CommunityHome'))
const JoinSuccess = lazy(() => import('./pages/community/JoinSuccess'))
const ClubDetail = lazy(() => import('./pages/community/ClubDetail'))
const EventsHome = lazy(() => import('./pages/events/EventsHome'))
const EventDetail = lazy(() => import('./pages/events/EventDetail'))
const Materials = lazy(() => import('./pages/events/Materials'))
const MaterialDetail = lazy(() => import('./pages/events/MaterialDetail'))
const PurchaseCabinet = lazy(() => import('./pages/materials/PurchaseCabinet'))
const Account = lazy(() => import('./pages/Account'))
const MarketplaceHome = lazy(() => import('./pages/MarketplaceHome'))
const BlogHome = lazy(() => import('./pages/BlogHome'))
const Contacts = lazy(() => import('./pages/Contacts'))
const Privacy = lazy(() => import('./pages/legal/Privacy'))
const Consent = lazy(() => import('./pages/legal/Consent'))
const About = lazy(() => import('./pages/About'))
const News = lazy(() => import('./pages/News'))
const Documents = lazy(() => import('./pages/Documents'))
const Placeholder = lazy(() => import('./pages/Placeholder'))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />

          {/* Кадры */}
          <Route path="/kadry" element={<KadryHome />} />
          <Route path="/kadry/employers" element={<KadryHome />} />
          <Route path="/kadry/candidates" element={<Candidates />} />
          <Route path="/kadry/candidates/reserve" element={<CareerReserve />} />
          <Route path="/kadry/candidates/consultation" element={<CareerConsultation />} />
          <Route path="/kadry/vacancies" element={<Vacancies />} />
          <Route path="/kadry/salary" element={<Salary />} />
          <Route
            path="/kadry/knowledge"
            element={
              <KnowledgeList
                audience="candidates"
                eyebrow="Кадры · База знаний"
                title="База знаний для соискателей и работодателей"
                description="Статьи, FAQ, глоссарий и чек-листы по подбору на юридическом рынке."
              />
            }
          />
          <Route path="/kadry/contacts" element={<Contacts eyebrow="Кадры" sourceBlock="kadry" />} />
          <Route path="/vacancies/:slug" element={<VacancyDetail />} />

          {/* Сообщество */}
          <Route path="/community" element={<CommunityHome />} />
          <Route path="/community/success" element={<JoinSuccess />} />
          <Route path="/community/clubs/:slug" element={<ClubDetail />} />
          <Route path="/community/contacts" element={<Contacts eyebrow="Сообщество" sourceBlock="community" />} />

          {/* Мероприятия */}
          <Route path="/events" element={<EventsHome />} />
          <Route path="/events/:slug" element={<EventDetail />} />
          <Route
            path="/events/knowledge"
            element={
              <KnowledgeList
                audience="events"
                eyebrow="Мероприятия · База знаний"
                title="Отчеты и гайды по мероприятиям"
              />
            }
          />
          <Route path="/events/materials" element={<Materials />} />
          <Route path="/materials/cabinet" element={<PurchaseCabinet />} />
          <Route path="/materials/:slug" element={<MaterialDetail />} />
          <Route path="/events/contacts" element={<Contacts eyebrow="Мероприятия" sourceBlock="events" />} />
          <Route path="/events/documents" element={<Documents />} />
          <Route path="/events/ticket-refund" element={<Placeholder eyebrow="Афиша" title="Возврат билета" />} />
          <Route path="/events/research" element={<Placeholder eyebrow="Афиша" title="Участие в исследованиях" />} />
          <Route path="/events/ticketing" element={<Placeholder eyebrow="Афиша" title="Билетная система" />} />
          <Route path="/events/opportunities" element={<Placeholder eyebrow="Организаторам" title="Возможности" />} />
          <Route path="/events/advertising" element={<Placeholder eyebrow="Организаторам" title="Реклама" />} />

          {/* Общие информационные страницы */}
          <Route path="/about" element={<About />} />
          <Route path="/news" element={<News />} />

          {/* Общая статья Базы знаний (единая сущность для всех трех разделов) */}
          <Route path="/knowledge/:slug" element={<ArticleDetail />} />

          {/* Сквозной личный кабинет */}
          <Route path="/account" element={<Account />} />

          {/* Marketplace */}
          <Route path="/marketplace" element={<MarketplaceHome />} />

          {/* Блог */}
          <Route path="/blog" element={<BlogHome />} />

          {/* Юридические документы */}
          <Route path="/legal/privacy" element={<Privacy />} />
          <Route path="/legal/consent" element={<Consent />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
