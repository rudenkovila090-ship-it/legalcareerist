import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Адрес страницы: когда он меняется, показанная ошибка сбрасывается, а содержимое при этом не пересоздаётся. */
  resetKey?: string
}

interface State {
  error: Error | null
  /** Адрес страницы, для которого показана ошибка. */
  key?: string
}

// Ловит ошибку рендера ОДНОЙ страницы (например, неожиданная форма данных
// из localStorage/сервера) — раньше это ронял весь сайт белым экраном,
// потому что ни один компонент выше по дереву её не перехватывал. Оборачивает
// <Outlet/> в Layout.tsx, так что шапка и подвал остаются рабочими, а
// сломанный экран заменяется понятным сообщением вместо белого листа.
// key={pathname} на использующей стороне пересоздает границу при переходе
// на другой маршрут — иначе после ошибки застрял бы навсегда, даже уйдя со
// сломанной страницы.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }


  render() {
    if (this.state.error) {
      return (
        <div className="container-page py-16 text-center">
          <div className="glass mx-auto max-w-md rounded-2xl p-8">
            <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
            <p className="mt-2 text-sm text-ink/60">
              Не удалось отобразить эту страницу. Попробуйте обновить её — если ошибка повторится, дайте нам знать.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
