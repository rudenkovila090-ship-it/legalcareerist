import type { MaterialItem } from '../types'

/** Бесплатный материал: платить не нужно (для вебинаров с частичной продажей цена задаётся в sale). */
export const isFreeMaterial = (m: MaterialItem) => m.price === 0 && !m.sale

/** Платные материалы сверху, бесплатные внизу; внутри каждой группы порядок сохраняется. */
export function paidFirst(list: MaterialItem[]): MaterialItem[] {
  return [...list.filter((m) => !isFreeMaterial(m)), ...list.filter(isFreeMaterial)]
}
