// Пол собеседника по имени — чтобы бот говорил «согласен/согласна», «ознакомился/ознакомилась».
// Определяется по окончанию русского имени с учётом исключений; если имя неоднозначное или написано
// латиницей и незнакомо — пол не определяется, и бот один раз спрашивает кнопкой.
const MALE_ENDING_A = new Set(['илья', 'никита', 'данила', 'гаврила', 'кузьма', 'фома', 'лёва', 'лева', 'миша', 'гоша', 'вова', 'дима', 'коля', 'петя', 'ваня', 'толя', 'костя', 'юра', 'леша', 'лёша', 'паша', 'гриша', 'саня', 'андрюша', 'серёжа', 'сережа', 'володя', 'слава', 'алёша', 'алеша', 'женя_м'])
const AMBIGUOUS = new Set(['саша', 'женя', 'валя', 'шура', 'вика', 'сева', 'ярослава_'])
const FEMALE_SOFT = new Set(['любовь'])
const LAT_FEMALE = new Set(['daria', 'darya', 'anastasia', 'anastasiya', 'maria', 'mariya', 'anna', 'elena', 'olga', 'natalia', 'natalya', 'ekaterina', 'julia', 'yulia', 'victoria', 'viktoria', 'alina', 'polina', 'sofia', 'sofya', 'ksenia', 'kseniya', 'diana', 'kristina', 'irina', 'tatiana', 'tatyana', 'svetlana', 'alexandra', 'aleksandra', 'valeria', 'veronika', 'veronica', 'margarita', 'elizaveta', 'liza', 'katya', 'nastya', 'masha', 'dasha', 'sasha_f', 'ulyana', 'milena', 'karina', 'angelina', 'alisa', 'arina', 'vasilisa', 'evgeniya', 'oksana', 'marina', 'galina', 'lyudmila', 'nadezhda', 'vera', 'lyubov'])
const LAT_MALE = new Set(['ivan', 'alexander', 'aleksandr', 'dmitry', 'dmitriy', 'ilya', 'nikita', 'andrey', 'andrei', 'sergey', 'sergei', 'mikhail', 'maxim', 'maksim', 'artem', 'artyom', 'denis', 'egor', 'yegor', 'kirill', 'pavel', 'roman', 'vladimir', 'vladislav', 'timur', 'daniil', 'danil', 'anton', 'oleg', 'igor', 'nikolay', 'nikolai', 'alexey', 'aleksey', 'evgeny', 'evgeniy', 'konstantin', 'vitaly', 'viktor', 'georgy', 'stepan', 'matvey', 'mark', 'lev', 'ruslan', 'yuri', 'yury', 'arseniy', 'gleb', 'bogdan', 'vadim', 'valery', 'leonid', 'boris', 'peter', 'petr'])

/** 'm' | 'f' | null (не удалось определить). */
export function detectGender(firstName) {
  const n = String(firstName ?? '').trim().toLowerCase().split(/\s+/)[0]
  if (!n) return null
  if (/^[а-яё-]+$/.test(n)) {
    if (AMBIGUOUS.has(n)) return null
    if (MALE_ENDING_A.has(n)) return 'm'
    if (FEMALE_SOFT.has(n)) return 'f'
    if (/[ая]$/.test(n)) return 'f'
    if (/[бвгджзйклмнпрстфхцчшщь]$/.test(n)) return 'm'
    return null
  }
  if (/^[a-z-]+$/.test(n)) {
    if (LAT_FEMALE.has(n)) return 'f'
    if (LAT_MALE.has(n)) return 'm'
  }
  return null
}

/** Форма слова по полу: gv(user, 'согласен', 'согласна', 'согласен(на)'). Неизвестный пол — третья форма (по умолчанию мужская). */
export function gv(user, male, female, both) {
  if (user?.gender === 'f') return female
  if (user?.gender === 'm') return male
  return both ?? male
}
