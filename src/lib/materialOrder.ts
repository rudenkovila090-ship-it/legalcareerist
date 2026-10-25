import type { MaterialItem } from '../types'

/** Бесплатный материал: платить не нужно (для вебинаров с частичной продажей цена задаётся в sale). */
export const isFreeMaterial = (m: MaterialItem) => m.price === 0 && !m.sale

/** Материал ещё не готов: оплаты нет, поэтому в каталоге он всегда в самом низу — при любой сортировке. */
export const isInDevelopment = (m: MaterialItem) => m.inDevelopment === true

/** Материалы «в разработке» — в самый низ; порядок остальных и порядок самих «в разработке» сохраняется. */
export function inDevelopmentLast(list: MaterialItem[]): MaterialItem[] {
  return [...list.filter((m) => !isInDevelopment(m)), ...list.filter(isInDevelopment)]
}

/** Платные материалы сверху, затем бесплатные, в самом низу — те, что в разработке; внутри групп порядок сохраняется. */
export function paidFirst(list: MaterialItem[]): MaterialItem[] {
  const ready = list.filter((m) => !isInDevelopment(m))
  return inDevelopmentLast([...ready.filter((m) => !isFreeMaterial(m)), ...ready.filter(isFreeMaterial), ...list.filter(isInDevelopment)])
}
