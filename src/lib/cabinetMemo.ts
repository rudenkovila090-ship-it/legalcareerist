import type { ApiResult } from './cabinet'

// Последние полученные данные вкладок кабинета: при переключении вкладки они показываются сразу, а свежие подгружаются следом,
// поэтому страница не мигает заглушкой «Загружаем…». Сбрасывается при выходе из кабинета.
const memo = new Map<string, unknown>()

/** Выполняет запрос и запоминает удачный ответ под ключом. */
export async function remember<T>(key: string, request: Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  const r = await request
  if (r.ok) memo.set(key, r.data)
  return r
}

export const recall = <T>(key: string) => memo.get(key) as T | undefined

/** Обновляет запомненные данные после изменения (чтобы при возврате на вкладку не мелькали старые). */
export function patchMemo<T extends object>(key: string, patch: Partial<T>) {
  const prev = memo.get(key) as T | undefined
  if (prev) memo.set(key, { ...prev, ...patch })
}

export const forgetCabinetData = () => memo.clear()
