import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { EventCharacter } from '../../data/eventStories'
import { prefersReducedMotion } from '../../lib/motion'
import { CharacterGlyph } from './CharacterGlyph'
import '../../pages/events/noir.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

type Decor = 'stamp' | 'torn' | 'print' | 'clip'
type Silhouette = 'hat' | 'man' | 'woman'

// Что «торчит» из каждой папки (как на референсе: штамп, надорванный лист, отпечаток, скрепка) и какой силуэт стоит в деле,
// пока у роли нет фото гостя. Привязка — по порядку ролей в eventStories.
const LOOKS: { decor: Decor; stamp?: string; face: Silhouette }[] = [
  { decor: 'stamp', stamp: 'Секретно', face: 'hat' },
  { decor: 'torn', face: 'man' },
  { decor: 'print', face: 'hat' },
  { decor: 'clip', face: 'woman' },
  { decor: 'stamp', stamp: 'Улика', face: 'man' },
  { decor: 'torn', face: 'man' },
]
const look = (i: number) => LOOKS[i % LOOKS.length]

/** Номер дела — четыре цифры, у каждой роли свой (задаётся в данных; запасной вариант — вычисленный из порядка роли). */
const caseNumber = (c: EventCharacter, i: number) => c.caseNo ?? String(1000 + ((i + 1) * 2749) % 9000)

// Где у папки язычок: три позиции, как у настоящих папок со срезом в треть.
const TABS = ['5%', '34%', '63%']

function Fingerprint() {
  return (
    <svg viewBox="0 0 60 70" fill="none" stroke="#1b1410" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
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

function Paperclip() {
  return (
    <svg viewBox="0 0 24 56" fill="none" stroke="#5d5a58" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M17 12v30a7 7 0 0 1-14 0V10a5 5 0 0 1 10 0v28a2.6 2.6 0 0 1-5.2 0V16" />
    </svg>
  )
}

/** Лист бумаги с рваным краем, пятнами и заломами — фон карточки-«вещдока» (стили .ef-paper). */
function Paper() {
  return <i className="ef-paper" aria-hidden="true" />
}

/** Тёмный силуэт «фото» — пока у гостя нет снимка. Виден только контур, лицо не прорисовано, как на референсе. Фон — в CSS (.ef-photo). */
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

/** Схема города со следом публикации: от автора через репосты — к тому, кто решил, что обойдётся. */
function PublicationMap({ route }: { route: boolean }) {
  return (
    <svg viewBox="0 0 200 210" className="ef-mapsvg" aria-hidden="true">
      <rect width="200" height="210" fill="#cfc4a8" />
      <g fill="none" stroke="#3a2e22" strokeLinecap="round" opacity="0.62">
        <path d="M-5 38 205 56M-5 92C55 78 120 108 205 96M-5 148 205 126M-5 190 205 176" strokeWidth="1.1" />
        <path d="M26-5 52 215M84-5C96 60 78 130 100 215M140-5 150 215M184-5 172 215" strokeWidth="1.1" />
        <path d="M-5 205 205 12" strokeWidth="2.6" />
        <path d="M60 60 100 150M120 20 70 190M165 30 124 190M10 120 90 70" strokeWidth="0.8" />
      </g>
      <path d="M100 0C108 40 126 60 160 84 188 104 200 130 200 160" fill="none" stroke="#7d8fa0" strokeWidth="9" opacity="0.38" />
      {route ? (
        <g>
          <path d="M34 168C58 142 66 116 98 104S150 78 166 38" fill="none" stroke="#a3281b" strokeWidth="2.4" strokeDasharray="5 5" strokeLinecap="round" />
          <circle cx="34" cy="168" r="7" fill="#a3281b" />
          <circle cx="34" cy="168" r="12" fill="none" stroke="#a3281b" strokeWidth="1.4" />
          <circle cx="98" cy="104" r="5" fill="#2a1d12" />
          <circle cx="132" cy="84" r="4" fill="#2a1d12" />
          <circle cx="166" cy="38" r="9" fill="#e9dfc6" stroke="#a3281b" strokeWidth="2" />
          <path d="M163 34.5c0-2 1.4-3 3-3s3 1 3 2.6c0 2-3 2.4-3 4.4M166 43v.1" fill="none" stroke="#a3281b" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path d="M100 150c-9-14-16-22-16-32a16 16 0 0 1 32 0c0 10-7 18-16 32Z" fill="#a3281b" />
          <circle cx="100" cy="118" r="5.5" fill="#e9dfc6" />
        </g>
      )}
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
        {decor === 'torn' && <span className="fd-torn" />}
        {decor === 'clip' && (
          <span className="fd-clip">
            <Paperclip />
          </span>
        )}
        {decor === 'print' && (
          <span className="fd-print">
            <Fingerprint />
          </span>
        )}

        <span className="fd-label">
          <span className="fd-no">
            <b>Дело</b>№ {caseNumber(character, index)}
          </span>
          <span className="fd-role">{character.name}</span>
        </span>

        {decor === 'stamp' && <span className="fd-stamp">{stamp}</span>}

        {sealed ? (
          <span className="fd-bar">имя позже</span>
        ) : (
          <span className="fd-tag">
            <span>{character.speaker?.name}</span>
          </span>
        )}
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
        style={{ '--tilt': index % 2 ? '1.2deg' : '-1.2deg' } as CSSProperties}
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

/** Карточка дела на корковой доске: «фото» гостя, роль, темы, показания, схема, уровень риска, пометка «конфиденциально». */
function EvidenceFile({ character, index, dateLabel, onClose }: EvidenceFileProps) {
  const speaker = character.speaker
  // Имя можно объявить раньше темы: пока темы нет, «показания» и блокнот остаются закрытыми.
  const hasTalk = Boolean(speaker?.topic || speaker?.testimony)
  const themes = speaker?.themes ?? []
  const meaning = speaker?.meaning
  const about = speaker?.about
  const hasAbout = themes.length > 0 || Boolean(about)
  const risk = speaker?.risk
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const pressedBackdrop = useRef(false)
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
  const { face } = look(index)
  // --k/--r — порядок и наклон листа; остальное — где у него пятно, затёртость и залом (у каждого свои, чтобы листы не выглядели копиями).
  const piece = (k: number, r: number) =>
    ({
      '--k': k,
      '--r': `${r}deg`,
      '--sx': `${18 + ((k * 37) % 64)}%`,
      '--sy': `${14 + ((k * 53) % 60)}%`,
      '--bx': `${(k * 29) % 90}%`,
      '--by': `${40 + ((k * 41) % 55)}%`,
      '--cy': `${34 + ((k * 17) % 34)}%`,
      '--ca': `${-3 + (k % 5)}deg`,
    }) as CSSProperties

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

          <div className="ef-piece ef-label ef-label-l" style={piece(0, -2)}>
            <Paper />
            <i className="ef-tape ef-tape-l" />
            <span>Материалы дела</span>
          </div>
          <div className="ef-piece ef-label ef-label-r" style={piece(1, 1)}>
            <Paper />
            <span>Дело № {caseNumber(character, index)}</span>
          </div>

          <figure className="ef-piece ef-polaroid" style={piece(2, -1.4)}>
            <Paper />
            <div className="ef-photo">{speaker?.photo ? <img src={speaker.photo} alt={speaker.name} draggable={false} /> : <SilhouetteArt kind={face} />}</div>
            <figcaption id={titleId} className="ef-script">
              {speaker ? speaker.name : 'Имя объявим позже'}
            </figcaption>
            {speaker?.position && <p className="ef-pos">{speaker.position}</p>}
          </figure>

          <div className="ef-piece ef-sticky" style={piece(3, 2)}>
            <Paper />
            <i className="ef-tape ef-tape-tl" />
            <i className="ef-tape ef-tape-br" />
            <p className="ef-k">Проходит по делу как</p>
            <p className="ef-hot">{character.name}</p>
            <p className="ef-sm">{character.epithet}</p>
            <p className="ef-k ef-gap">На вечере: {dateLabel}</p>
          </div>

          <div className="ef-piece ef-notebook" style={piece(4, -1)}>
            <Paper />
            {hasAbout && (
              <>
                <p className="ef-h">О чем расскажет</p>
                {about && <p>{about}</p>}
                {themes.length > 0 && (
                  <ul>
                    {themes.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {meaning && (
              <>
                <p className={hasAbout ? 'ef-h ef-h-next' : 'ef-h'}>Смысл</p>
                <p>{meaning}</p>
              </>
            )}
            {!hasAbout && !meaning && (
              <>
                <p className="ef-h">О чем расскажет</p>
                <div className="ef-lines" aria-hidden="true">
                  <i style={{ width: '88%' }} />
                  <i style={{ width: '64%' }} />
                  <i style={{ width: '76%' }} />
                </div>
                <p className="ef-sm ef-gap">тема выступления — позже</p>
              </>
            )}
          </div>

          <div className="ef-piece ef-witness" style={piece(5, 1.2)}>
            <Paper />
            <i className="ef-tape ef-tape-tl" />
            <p className="ef-h">Показания</p>
            {speaker && hasTalk ? (
              <>
                {speaker.topic && <p className="ef-topic">«{speaker.topic}»</p>}
                {speaker.suspect && (
                  <p className="ef-suspect">
                    <span>Подозреваемый</span>
                    <b>{speaker.suspect}</b>
                  </p>
                )}
                {speaker.topicLead && <p>{speaker.topicLead}.</p>}
                {speaker.description && <p>{speaker.description}</p>}
                {speaker.questions?.map((q) => (
                  <p key={q}>{q}</p>
                ))}
                {speaker.testimony && <p className="ef-quote">«{speaker.testimony}»</p>}
                <p className="ef-by">
                  — {character.name}, {speaker.name}
                </p>
              </>
            ) : (
              <>
                <p>Показания еще не приобщены к делу.</p>
                <span className="ef-redact">Выступление — раскроется на вечере</span>
              </>
            )}
          </div>

          <div className="ef-piece ef-map" style={piece(6, -1.6)}>
            <Paper />
            <PublicationMap route={speaker?.map === 'route'} />
            <p className="ef-script ef-script-sm">{speaker?.map === 'route' ? 'Путь публикации' : 'Место происшествия'}</p>
          </div>

          {/* Описание роли: то, что раньше было отдельным блоком «Персонажи и роли». */}
          <div className="ef-piece ef-role" style={piece(7, -0.5)}>
            <Paper />
            <i className="ef-tape ef-tape-tr" />
            <div className="ef-role-head">
              <span className="ef-glyph" aria-hidden="true">
                <CharacterGlyph icon={character.icon} />
              </span>
              <div>
                <p className="ef-h">Роль в деле</p>
                <p className="ef-k">{character.keywords}</p>
              </div>
            </div>
            {speaker?.roleNote && <p className="ef-lead">{speaker.roleNote}</p>}
            <p>{character.text}</p>
            <dl className="ef-dl">
              <div>
                <dt className="ef-k">Мотив</dt>
                <dd>{character.motive}</dd>
              </div>
              <div>
                <dt className="ef-k">Символизирует</dt>
                <dd>{character.symbol}</dd>
              </div>
              <div>
                <dt className="ef-k">Улика</dt>
                <dd>
                  <span className="ef-redact">Раскроется на вечере</span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="ef-piece ef-risk" style={piece(8, -0.8)}>
            <Paper />
            <p className="ef-h">Уровень риска</p>
            <div className="ef-scale" role="img" aria-label={risk ? `Уровень риска: ${risk} из 5` : 'Уровень риска пока не установлен'}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} data-on={risk === n ? '' : undefined} data-unknown={risk ? undefined : ''}>
                  {n}
                </span>
              ))}
            </div>
            {!risk && <p className="ef-sm ef-gap">пока не установлен</p>}
          </div>

          <div className="ef-piece ef-conf" style={piece(9, 1.5)}>
            <span className="ef-clip" aria-hidden="true">
              <Paperclip />
            </span>
            <div className="ef-conf-in">Конфиденциально</div>
          </div>
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
 * Блок «Спикеры»: по папке-делу на каждую роль. Папки чуть сдвигаются при наведении, по клику открывается карточка дела.
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
