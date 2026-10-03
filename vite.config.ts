import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // /api/* в деве идет на server/index.js (npm start в server/), как и
    // будет в проде за одним доменом — без этого все запросы вида
    // fetch('/api/...') (счетчики просмотров, синхронизация localStorage
    // с сервером, см. src/lib/serverSync.ts) в `npm run dev` молча
    // получали 404 от самого Vite вместо ответа бэкенда.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
