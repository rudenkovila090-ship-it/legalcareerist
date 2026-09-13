import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { hydrateFromServer, patchLocalStorage } from './lib/serverSync'

// Синхронизация демо-данных кабинетов с сервером — ДО первого рендера
// (см. lib/serverSync.ts). Ограничена по времени изнутри hydrateFromServer,
// так что недоступный бэкенд не держит сайт на пустом экране дольше
// секунды-другой — index.html тем временем показывает статичный (без JS)
// лоадер, замещаемый первым рендером React.
async function bootstrap() {
  await hydrateFromServer()
  patchLocalStorage()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

bootstrap()
