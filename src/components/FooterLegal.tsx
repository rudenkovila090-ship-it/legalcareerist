import { Link } from 'react-router-dom'
import { openCookieSettings } from '../lib/metrika'

// Общие части подвалов сайта (главный и разделов «Кадры», «Сообщество», «Мероприятия», «Маркетплейс»).
// Юридические документы в подвале — одна строка, ведущая на /legal: полный перечень лежит там и не раздувает подвал.

/** Колонка «Юридический блок»: одна ссылка на страницу со всеми документами. */
export function FooterLegal() {
  return (
    <div>
      <div className="mb-3 whitespace-nowrap text-xs font-bold uppercase leading-tight tracking-wide text-white">Юридический блок</div>
      <ul className="space-y-1.5 text-xs">
        <li><Link className="hover:text-white" to="/legal">Юридические документы</Link></li>
      </ul>
    </div>
  )
}

/** Нижняя строка подвала: реквизиты и «Настройки cookie» (отозвать согласие на cookie должно быть так же просто, как дать). */
export function FooterBottom() {
  return (
    <div className="border-t border-white/10 py-5">
      <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 text-center text-xs text-white/40 sm:px-10 lg:px-16">
        <span>© {new Date().getFullYear()} ИП Руденков И.В. Карьерный Юрист. ИНН 262607024144 ОГРНИП 325784700110048</span>
        <button type="button" onClick={openCookieSettings} className="underline-offset-2 hover:text-white hover:underline">Настройки cookie</button>
      </div>
    </div>
  )
}
