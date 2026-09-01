import type { MaterialItem } from '../types'

export const materialKindLabel: Record<MaterialItem['kind'], string> = {
  guide: 'Гайд',
  checklist: 'Чек-лист',
  recording: 'Запись',
  longlist: 'Лонглист',
  article: 'Статья',
  webinar: 'Вебинар',
  presentation: 'Презентация',
}
