/** Общие классы нового оформления кабинета (см. kit.tsx). */
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
/** Акцентный жёлтый: для «нужно внимание» и текущего шага. */
export const accent = 'bg-amber-300 text-ink'
export const shadowSoft = 'shadow-[0_1px_2px_rgba(40,57,83,0.06)]'
export const shadowLift = 'shadow-[0_1px_2px_rgba(40,57,83,0.08),0_8px_20px_-10px_rgba(40,57,83,0.35)]'

/** Основная кнопка (тёмная) и вторичная (с рамкой): те же, что на всём сайте. */
export const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60 ${focusRing}`
export const btnGhost = `inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink/70 transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-60 ${focusRing}`
