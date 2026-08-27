import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import KadryHome from './pages/kadry/KadryHome'
import Candidates from './pages/kadry/Candidates'
import Vacancies from './pages/kadry/Vacancies'
import Salary from './pages/kadry/Salary'
import VacancyDetail from './pages/VacancyDetail'
import KnowledgeList from './pages/KnowledgeList'
import ArticleDetail from './pages/ArticleDetail'
import CommunityHome from './pages/community/CommunityHome'
import ClubDetail from './pages/community/ClubDetail'
import EventsHome from './pages/events/EventsHome'
import EventDetail from './pages/events/EventDetail'
import Materials from './pages/events/Materials'
import MaterialDetail from './pages/events/MaterialDetail'
import Account from './pages/Account'
import Contacts from './pages/Contacts'
import Privacy from './pages/legal/Privacy'
import Consent from './pages/legal/Consent'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />

        {/* Кадры */}
        <Route path="/kadry" element={<KadryHome />} />
        <Route path="/kadry/employers" element={<KadryHome />} />
        <Route path="/kadry/candidates" element={<Candidates />} />
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
              title="Отчёты и гайды по мероприятиям"
            />
          }
        />
        <Route path="/events/materials" element={<Materials />} />
        <Route path="/materials/:slug" element={<MaterialDetail />} />
        <Route path="/events/contacts" element={<Contacts eyebrow="Мероприятия" sourceBlock="events" />} />

        {/* Общая статья Базы знаний (единая сущность для всех трёх разделов) */}
        <Route path="/knowledge/:slug" element={<ArticleDetail />} />

        {/* Сквозной личный кабинет */}
        <Route path="/account" element={<Account />} />

        {/* Юридические документы */}
        <Route path="/legal/privacy" element={<Privacy />} />
        <Route path="/legal/consent" element={<Consent />} />
      </Route>
    </Routes>
  )
}
