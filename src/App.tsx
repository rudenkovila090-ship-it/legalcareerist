import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import KadryHome from './pages/kadry/KadryHome'
import Candidates from './pages/kadry/Candidates'
import CareerReserve from './pages/kadry/CareerReserve'
import CareerConsultation from './pages/kadry/CareerConsultation'
import Vacancies from './pages/kadry/Vacancies'
import Salary from './pages/kadry/Salary'
import VacancyDetail from './pages/VacancyDetail'
import KnowledgeList from './pages/KnowledgeList'
import ArticleDetail from './pages/ArticleDetail'
import CommunityHome from './pages/community/CommunityHome'
import JoinSuccess from './pages/community/JoinSuccess'
import ClubDetail from './pages/community/ClubDetail'
import EventsHome from './pages/events/EventsHome'
import EventDetail from './pages/events/EventDetail'
import Materials from './pages/events/Materials'
import MaterialDetail from './pages/events/MaterialDetail'
import Account from './pages/Account'
import MarketplaceHome from './pages/MarketplaceHome'
import BlogHome from './pages/BlogHome'
import Contacts from './pages/Contacts'
import Privacy from './pages/legal/Privacy'
import Consent from './pages/legal/Consent'
import About from './pages/About'
import News from './pages/News'
import Documents from './pages/Documents'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
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
        <Route
          path="/community/knowledge"
          element={
            <KnowledgeList
              audience="community"
              eyebrow="Сообщество · База знаний"
              title="Материалы для студентов-юристов"
            />
          }
        />
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
  )
}
