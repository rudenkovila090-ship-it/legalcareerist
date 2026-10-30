/** Пользователь отключил анимацию в системе — тогда анимированные эффекты страницы не запускаем. */
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
