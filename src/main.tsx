import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { captureUtm } from './lib/utm'

// Данные кабинетов хранятся только в браузере посетителя (localStorage) и на сервер не копируются.
async function bootstrap() {
  captureUtm()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

bootstrap()
