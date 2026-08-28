// Демо-счетчик просмотров материала базы знаний — детерминированный (по id),
// чтобы не менялся при каждом ререндере. Реальный счетчик подключается позже.
export function articleViews(id: string | number) {
  const n = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return 80 + ((n * 53) % 620)
}
