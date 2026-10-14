import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { EventCharacter } from '../../data/eventStories'
import { prefersReducedMotion } from '../../lib/motion'
import { CharacterGlyph } from './CharacterGlyph'
import '../../pages/events/noir.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

type Decor = 'stamp' | 'slip' | 'print' | 'evid'
type Silhouette = 'hat' | 'man' | 'woman'

// Что лежит на лицевой стороне каждой папки (штамп, листок с чёрными строками, отпечаток, бирка вещдока) и какой силуэт стоит в деле,
// пока у роли нет фото гостя. Привязка — по порядку ролей в eventStories.
const LOOKS: { decor: Decor; stamp?: string; face: Silhouette }[] = [
  { decor: 'stamp', stamp: 'Секретно', face: 'hat' },
  { decor: 'slip', face: 'man' },
  { decor: 'print', face: 'hat' },
  { decor: 'evid', face: 'woman' },
  { decor: 'stamp', stamp: 'Улика', face: 'man' },
  { decor: 'slip', face: 'man' },
]
const look = (i: number) => LOOKS[i % LOOKS.length]

/** Номер дела — четыре цифры, у каждой роли свой (задаётся в данных; запасной вариант — вычисленный из порядка роли). */
const caseNumber = (c: EventCharacter, i: number) => c.caseNo ?? String(1000 + (((i + 1) * 2749) % 9000))

// Где у папки язычок: три позиции, как у настоящих папок со срезом в треть.
const TABS = ['5%', '34%', '63%']

function Fingerprint() {
  return (
    <svg viewBox="0 0 60 70" fill="none" stroke="#16130f" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M30 6C16 6 7 17 7 31v8" strokeDasharray="30 5 12 4" />
      <path d="M30 11C19 11 12 20 12 31v12c0 5-2 8-4 11" strokeDasharray="26 4 16 5" />
      <path d="M30 16c-8 0 -13 7-13 15v10c0 6-1 10-3 14" strokeDasharray="22 6 14 3" />
      <path d="M30 21c-5 0-8 5-8 10v9c0 7-1 12-3 17" strokeDasharray="18 4 10 5" />
      <path d="M30 26c-2 0-4 2-4 5v10c0 8 0 14-1 20" strokeDasharray="14 5 8 4" />
      <path d="M30 6c14 0 23 11 23 25v10c0 6 1 12 3 16" strokeDasharray="28 4 14 6" />
      <path d="M30 11c11 0 18 9 18 20v11c0 7 1 11 3 15" strokeDasharray="24 5 12 4" />
      <path d="M30 16c8 0 13 7 13 15v10c0 8 1 13 2 18" strokeDasharray="20 4 14 5" />
      <path d="M30 21c5 0 8 5 8 10v9c0 8 0 14 1 19" strokeDasharray="16 5 10 4" />
      <path d="M30 26c2 0 4 2 4 5v10c0 9 0 15 0 21" strokeDasharray="12 4 9 5" />
    </svg>
  )
}

/** Тёмный силуэт «фото» — пока у гостя нет снимка. Виден только контур, лицо не прорисовано. Фон — в CSS (.ef-photo). */
function SilhouetteArt({ kind }: { kind: Silhouette }) {
  return (
    <svg viewBox="0 0 160 190" preserveAspectRatio="xMidYMax meet" className="ef-sil" aria-hidden="true">
      <g fill="#070504">
        {/* плечи (шире рамки — лишнее обрежет «фото») и шея */}
        <path d="M-70 190c0-38 60-52 134-58l16 8 16-8c74 6 134 20 134 58Z" />
        <rect x="68" y="108" width="24" height="30" rx="8" />
        {kind === 'woman' ? (
          <>
            {/* длинные волосы одной сплошной массой — без просветов между головой и плечами */}
            <ellipse cx="80" cy="70" rx="31" ry="38" />
            <path d="M49 72C45 102 47 132 56 160L104 160C113 132 115 102 111 72Z" />
          </>
        ) : (
          <ellipse cx="80" cy="76" rx="25" ry="31" />
        )}
        {kind === 'hat' && (
          <>
            <ellipse cx="80" cy="52" rx="46" ry="8" />
            <path d="M54 52c0-26 10-38 26-38s26 12 26 38Z" />
          </>
        )}
      </g>
      {kind !== 'woman' && <path d="M80 138l-7 10 7 32 7-32Z" fill="#2c2722" />}
      {kind !== 'woman' && <path d="M62 132l18 16 18-16-4-6-14 10-14-10Z" fill="#1b1714" />}
    </svg>
  )
}

/**
 * Лицевая сторона папки-дела: язычок, листы внутри, наклейка с номером и ролью, улика, имя гостя.
 * Одна и та же разметка — и папка в списке, и обложка в окне дела (размеры в cqw, от ширины контейнера).
 */
function FolderFace({ character, index }: { character: EventCharacter; index: number }) {
  const { decor, stamp } = look(index)
  const sealed = !character.speaker
  return (
    <span className="fd" data-revealed={sealed ? undefined : ''} style={{ '--tab': TABS[index % TABS.length] } as CSSProperties} aria-hidden="true">
      <span className="fd-back" />
      <span className="fd-papers">
        <i />
        <i />
      </span>
      <span className="fd-tab">
        <b>{ROMAN[index] ?? index + 1}</b>
      </span>
      <span className="fd-front">
        <span className="fd-label">
          <span className="fd-no">
            <span>Дело</span>
            <span>№ {caseNumber(character, index)}</span>
          </span>
          <span className="fd-role">{character.name}</span>
        </span>

        {decor === 'stamp' && <span className="fd-stamp">{stamp}</span>}
        {decor === 'slip' && <span className="fd-slip" />}
        {decor === 'evid' && <span className="fd-evid">Вещдок</span>}
        {decor === 'print' && (
          <span className="fd-print">
            <Fingerprint />
          </span>
        )}

        {sealed ? <span className="fd-bar">имя позже</span> : <span className="fd-tag">{character.speaker?.name}</span>}
      </span>
    </span>
  )
}

/** Папка в списке: по клику открывается окно дела. */
function Folder({ character, index, onOpen }: { character: EventCharacter; index: number; onOpen: (index: number, opener: HTMLButtonElement) => void }) {
  const sealed = !character.speaker
  const label = sealed ? `Открыть дело: ${character.name}, имя гостя пока засекречено` : `Открыть дело: ${character.name}, ${character.speaker?.name}`

  return (
    <li className="sf-slot" style={{ '--i': index } as CSSProperties}>
      <button
        type="button"
        className="sf-card"
        data-sealed={sealed ? '' : undefined}
        aria-haspopup="dialog"
        aria-label={label}
        style={{ '--tilt': index % 2 ? '1deg' : '-1deg' } as CSSProperties}
        onClick={(e: MouseEvent<HTMLButtonElement>) => onOpen(index, e.currentTarget)}
      >
        <FolderFace character={character} index={index} />
      </button>
    </li>
  )
}

interface EvidenceFileProps {
  character: EventCharacter
  index: number
  dateLabel: string
  onClose: () => void
}

/** Сколько ждём, пока обложка закроется и окно уйдёт, прежде чем убрать его из страницы (мс). */
const CLOSE_MS = 950

/** Дело: вертикальная папка. Сверху фото и «паспорт» дела, ниже два листа — показания и роль. Всё, что может быть длинным, сжато. */
function EvidenceFile({ character, index, dateLabel, onClose }: EvidenceFileProps) {
  const speaker = character.speaker
  const themes = speaker?.themes ?? []
  const risk = speaker?.risk
  const hasTestimony = Boolean(speaker && (speaker.topic || speaker.topicLead || speaker.description || speaker.questions?.length || speaker.testimony || speaker.suspect))
  const hasAbout = themes.length > 0 || Boolean(speaker?.about)
  const hasMeaning = Boolean(speaker?.meaning)
  const nothingYet = !hasTestimony && !hasAbout && !hasMeaning
  // Лист «Роль в деле» свернут: это общее описание роли, и оно удлиняет дело. Пока у роли нет показаний — открыт, ведь больше читать нечего.
  const [roleOpen, setRoleOpen] = useState(nothingYet)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const pressedBackdrop = useRef(false)
  const { face } = look(index)
  // Закрытие — тоже анимация: обложка опускается обратно на доску, и только потом окно убирается.
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const closeTimer = useRef(0)
  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS)
  }, [onClose])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  // --k — порядок появления листа, --r — его наклон.
  const piece = (k: number, r: number) => ({ '--k': k, '--r': `${r}deg` }) as CSSProperties

  useEffect(() => {
    closeRef.current?.focus()
    // Пока открыто дело, страница под ним не прокручивается; ширину полосы прокрутки компенсируем, чтобы вёрстка не «прыгала».
    const { overflow, paddingRight } = document.body.style
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
      // Фокус не уходит за пределы карточки: в ней одна кнопка — «Закрыть».
      if (e.key === 'Tab') {
        e.preventDefault()
        closeRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
    }
  }, [requestClose])

  return createPortal(
    <div
      className="ef-overlay"
      data-closing={closing ? '' : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) requestClose()
      }}
    >
      <div className="ef-wrap" data-closing={closing ? '' : undefined}>
        <div className="ef-board">
          <button ref={closeRef} type="button" className="ef-close" onClick={requestClose} aria-label="Закрыть дело">
            ✕
          </button>

          <div className="ef-top">
            <figure className="ef-print ef-piece" style={piece(0, -1)}>
              <div className="ef-photo">{speaker?.photo ? <img src={speaker.photo} alt={speaker.name} draggable={false} /> : <SilhouetteArt kind={face} />}</div>
              <figcaption id={titleId} className="ef-name">
                {speaker ? speaker.name : 'Имя объявим позже'}
              </figcaption>
              {speaker?.position && <p className="ef-pos">{speaker.position}</p>}
            </figure>

            <div className="ef-meta ef-piece" style={piece(1, 0)}>
              <p className="ef-no">Дело № {caseNumber(character, index)}</p>
              <p className="ef-roleh">{character.name}</p>
              <p className="ef-epi">{character.epithet}</p>
              <p className="ef-date">На вечере: {dateLabel}</p>
              <div className="ef-risk">
                <p className="ef-lab">Уровень риска</p>
                <div className="ef-scale" data-unknown={risk ? undefined : ''} role="img" aria-label={risk ? `Уровень риска: ${risk} из 5` : 'Уровень риска пока не установлен'}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} data-on={risk && n <= risk ? '' : undefined} />
                  ))}
                </div>
                {!risk && <p className="ef-hint">пока не установлен</p>}
              </div>
              <span className="ef-stamp">Конфиденциально</span>
            </div>
          </div>

          <section className="ef-sheet ef-piece" style={piece(2, -0.5)}>
            <h4 className="ef-h">Показания</h4>
            {hasTestimony && speaker && (
              <>
                {speaker.topic && <p className="ef-topic">«{speaker.topic}»</p>}
                {speaker.suspect && (
                  <p className="ef-suspect">
                    <span>Подозреваемый</span>
                    <b>{speaker.suspect}</b>
                  </p>
                )}
                {speaker.topicLead && <p className="ef-p">{speaker.topicLead}.</p>}
                {speaker.description && <p className="ef-p">{speaker.description}</p>}
                {speaker.questions?.map((q) => (
                  <p key={q} className="ef-p">
                    {q}
                  </p>
                ))}
                {speaker.testimony && <p className="ef-q">«{speaker.testimony}»</p>}
              </>
            )}
            {hasAbout && speaker && (
              <div className="ef-part">
                <h5 className="ef-sub">О чем расскажет</h5>
                {speaker.about && <p className="ef-p">{speaker.about}</p>}
                {themes.length > 0 && (
                  <ul className="ef-tags">
                    {themes.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {hasMeaning && speaker && (
              <div className="ef-part">
                <h5 className="ef-sub">Смысл</h5>
                <p className="ef-p">{speaker.meaning}</p>
              </div>
            )}
            {nothingYet && (
              <>
                <p className="ef-p">Показания еще не приобщены к делу.</p>
                <span className="ef-redact">Выступление — раскроется на вечере</span>
              </>
            )}
          </section>

          <section className="ef-sheet ef-role ef-piece" data-collapsed={roleOpen ? undefined : ''} style={piece(3, 0.4)}>
            <h4 className="ef-h">
              <button type="button" className="ef-toggle" aria-expanded={roleOpen} onClick={() => setRoleOpen((v) => !v)}>
                <CharacterGlyph icon={character.icon} />
                Роль в деле
                <span className="ef-plus" aria-hidden="true">
                  {roleOpen ? '−' : '+'}
                </span>
              </button>
            </h4>
            <p className="ef-kw">{character.keywords}</p>
            {roleOpen && (
              <>
                {speaker?.roleNote && <p className="ef-lead">{speaker.roleNote}</p>}
                <p className="ef-p">{character.text}</p>
              </>
            )}
          </section>
        </div>

        {/* Обложка папки: та же лицевая сторона, что и в списке; в начале закрывает доску и раскрывается влево. */}
        <div className="ef-cover" aria-hidden="true">
          <FolderFace character={character} index={index} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface SpeakerFilesProps {
  characters: EventCharacter[]
  /** Дата вечера для подписей: «28 ноября 2026». */
  dateLabel: string
}

/**
 * Блок «Спикеры»: по папке-делу на каждую роль. Папки чуть приоткрываются при наведении, по клику открывается дело.
 * Роль без объявленного гостя открывается тоже — с засекреченным именем и описанием роли.
 */
export default function SpeakerFiles({ characters, dateLabel }: SpeakerFilesProps) {
  const [open, setOpen] = useState<number | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  // Закрыли дело — фокус возвращается на папку, с которой открывали (важно для клавиатуры и экранных читалок).
  const close = useCallback(() => {
    setOpen(null)
    opener.current?.focus()
  }, [])

  const current = open !== null ? characters[open] : undefined

  return (
    <div className="sf">
      <ul className="sf-grid">
        {characters.map((c, i) => (
          <Folder
            key={c.name}
            character={c}
            index={i}
            onOpen={(index, el) => {
              opener.current = el
              setOpen(index)
            }}
          />
        ))}
      </ul>
      {current && open !== null && <EvidenceFile character={current} index={open} dateLabel={dateLabel} onClose={close} />}
    </div>
  )
}
