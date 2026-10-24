// Встроенный чат работодателя и соискателя — прямо на платформе, чтобы все
// переговоры велись в одном месте (запрос заказчика). В этом
// фронтенд-прототипе нет реального бэкенда/WebSocket — оба демо-аккаунта
// (кабинет соискателя и кабинет работодателя) читают и пишут в один и тот
// же localStorage, поэтому переписка видна с обеих сторон в одном браузере
// (см. AccountGate.tsx — оба кабинета всегда доступны одному пользователю).
export interface ChatMessage {
  id: string
  senderRole: 'employer' | 'candidate'
  text: string
  sentAt: string
  read: boolean
}

export interface ChatThread {
  id: string
  vacancyTitle: string
  employerName: string
  candidateName: string
  messages: ChatMessage[]
}

const KEY = 'ky_chat_threads'

function seedThreads(): ChatThread[] {
  return [
    {
      id: 'resp1',
      vacancyTitle: 'Юрист M&A, инхаус',
      employerName: '«Гарант-Право»',
      candidateName: 'Мария Кузнецова',
      messages: [
        {
          id: 'msg1',
          senderRole: 'employer',
          text: 'Добрый день! Посмотрели ваш отклик — опыт в M&A подходит. Удобно созвониться на этой неделе?',
          sentAt: '2026-08-17T10:00:00.000Z',
          read: true,
        },
        {
          id: 'msg2',
          senderRole: 'candidate',
          text: 'Добрый день! Да, удобно в четверг после 15:00.',
          sentAt: '2026-08-17T10:20:00.000Z',
          read: true,
        },
      ],
    },
  ]
}

export function getThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ChatThread[]
    const seeded = seedThreads()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

function writeAll(all: ChatThread[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

/** Создает тред при первом обращении (например, когда работодатель впервые
 *  нажимает «Написать» на отклике, у которого еще нет переписки). */
export function ensureThread(id: string, meta: Omit<ChatThread, 'id' | 'messages'>): ChatThread {
  const all = getThreads()
  const existing = all.find((t) => t.id === id)
  if (existing) return existing
  const thread: ChatThread = { id, messages: [], ...meta }
  writeAll([...all, thread])
  return thread
}

export function getThread(id: string): ChatThread | undefined {
  return getThreads().find((t) => t.id === id)
}

export function sendMessage(threadId: string, senderRole: ChatMessage['senderRole'], text: string): ChatThread | undefined {
  const all = getThreads()
  const idx = all.findIndex((t) => t.id === threadId)
  if (idx === -1) return undefined
  const message: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    senderRole,
    text,
    sentAt: new Date().toISOString(),
    read: false,
  }
  all[idx] = { ...all[idx], messages: [...all[idx].messages, message] }
  writeAll(all)
  return all[idx]
}

/** Отмечает прочитанными сообщения от другой стороны (viewerRole — тот, кто
 *  сейчас открыл тред). */
export function markThreadRead(threadId: string, viewerRole: ChatMessage['senderRole']): ChatThread | undefined {
  const all = getThreads()
  const idx = all.findIndex((t) => t.id === threadId)
  if (idx === -1) return undefined
  all[idx] = {
    ...all[idx],
    messages: all[idx].messages.map((m) => (m.senderRole !== viewerRole ? { ...m, read: true } : m)),
  }
  writeAll(all)
  return all[idx]
}

export function unreadForRole(thread: ChatThread, viewerRole: ChatMessage['senderRole']): number {
  return thread.messages.filter((m) => m.senderRole !== viewerRole && !m.read).length
}
