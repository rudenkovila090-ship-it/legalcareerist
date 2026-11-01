import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { EventCharacter } from '../../data/eventStories'
import { prefersReducedMotion } from '../../lib/motion'
import { CharacterGlyph } from './CharacterGlyph'
import '../../pages/events/noir.css'

type Silhouette = 'hat' | 'man' | 'woman'

// Штамп на фото каждой папки и силуэт, пока у роли нет снимка гостя. Привязка — по порядку ролей в eventStories.
const LOOKS: { stamp: string; face: Silhouette }[] = [
  { stamp: 'Секретно', face: 'hat' },
  { stamp: 'Свидетель', face: 'man' },
  { stamp: 'Допрос', face: 'hat' },
  { stamp: 'Улика', face: 'woman' },
  { stamp: 'Алиби', face: 'man' },
  { stamp: 'Архив', face: 'man' },
]
const look = (i: number) => LOOKS[i % LOOKS.length]

/** Номер дела — четыре цифры, у каждой роли свой (задаётся в данных; запасной вариант — вычисленный из порядка роли). */
const caseNumber = (c: EventCharacter, i: number) => c.caseNo ?? String(1000 + (((i + 1) * 2749) % 9000))

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

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

/** Металлическая скрепка, на которой держится карточка дела. */
function Clip() {
  return (
    <svg className="fd-clip" viewBox="0 0 32 84" fill="none" strokeLinecap="round" aria-hidden="true">
      <path d="M21 74V18a8 8 0 0 0-16 0v46a13 13 0 0 0 26 0V22a5 5 0 0 0-10 0v38" stroke="#4d4b46" strokeWidth="3.6" />
      <path d="M21 74V18a8 8 0 0 0-16 0v46a13 13 0 0 0 26 0V22a5 5 0 0 0-10 0v38" stroke="#c4c2ba" strokeWidth="2" />
    </svg>
  )
}

/** Красная круглая печать архива: кольцо с надписью, в центре — весы. */
function Seal() {
  const id = useId()
  return (
    <svg className="fd-seal" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <path id={id} d="M50 50m-37 0a37 37 0 1 1 74 0a37 37 0 1 1-74 0" />
      </defs>
      <g fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="47" strokeWidth="2.6" />
        <circle cx="50" cy="50" r="26" strokeWidth="1.4" />
        <g transform="translate(30 30) scale(1.67)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.6 6a3 3 0 0 0 5.2 0L5 8ZM19 8l-2.6 6a3 3 0 0 0 5.2 0L19 8Z" />
        </g>
      </g>
      <text fill="currentColor" fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" fontSize="8.6" fontWeight="800" letterSpacing="1.4">
        <textPath href={`#${id}`} textLength="228" lengthAdjust="spacing">
          LEGAL NIGHT JAZZ · ДЕЛО ЗАВЕДЕНО ·
        </textPath>
      </text>
    </svg>
  )
}

const SCALE = [190, 180, 170, 160, 150]

/**
 * Лицевая сторона дела: бумажная карточка на скрепке — номер, роль, фото с ростовой линейкой и штампом, поля «роль / тема / риск»,
 * суть дела, чёрные полосы и красная печать. Одна и та же разметка — и папка в списке, и обложка в окне дела (размеры в cqw, от ширины контейнера).
 */
function FolderFace({ character, index }: { character: EventCharacter; index: number }) {
  const { stamp, face } = look(index)
  const speaker = character.speaker
  const sealed = !speaker
  const risk = speaker?.risk
  return (
    <span className="fd" data-revealed={sealed ? undefined : ''} aria-hidden="true">
      {/* Листы, лежащие в деле: выглядывают справа, при наведении выезжают. */}
      <span className="fd-papers">
        <i />
        <i />
      </span>
      <span className="fd-front">
        <Clip />
        <span className="fd-head">
          <span>Дело</span>
          <span>№ {caseNumber(character, index)}</span>
        </span>

        <span className="fd-id">
          <span className="fd-name">{character.name}</span>
          {sealed ? <span className="fd-bar">имя засекречено</span> : <span className="fd-aka">Спикер — {speaker.name}</span>}
        </span>

        <span className="fd-mid">
          <span className="fd-photo">
            <span className="fd-pic" data-photo={speaker?.photo ? '' : undefined}>
              {speaker?.photo ? <img src={speaker.photo} alt="" loading="lazy" decoding="async" /> : <SilhouetteArt kind={face} />}
              <span className="fd-scale">
                {SCALE.map((n) => (
                  <i key={n}>{n}</i>
                ))}
              </span>
            </span>
            <span className="fd-stamp">{stamp}</span>
          </span>
          <span className="fd-meta">
            <span className="fd-f">
              <b>Роль</b>
              <span className="fd-v">{capital(character.epithet)}</span>
            </span>
            <span className="fd-f fd-f-topic">
              <b>Тема</b>
              {speaker?.topic ? <span className="fd-v">{speaker.topic}</span> : <span className="fd-redact" />}
            </span>
            <span className="fd-f">
              <b>Риск</b>
              <span className="fd-dots" data-unknown={risk ? undefined : ''}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} data-on={risk && n <= risk ? '' : undefined} />
                ))}
              </span>
            </span>
          </span>
        </span>

        <span className="fd-case">
          <span className="fd-case-h">Суть дела</span>
          <span className="fd-f fd-f-case">
            <b>По делу</b>
            <span className="fd-v">{character.keywords}</span>
          </span>
          <span className="fd-f">
            <b>Статус</b>
            <span className="fd-v">{sealed ? 'Личность устанавливается' : 'Личность установлена'}</span>
          </span>
        </span>

        <span className="fd-bars">
          <i />
          <i />
        </span>

        <span className="fd-foot">
          <span className="fd-f fd-filed">
            <b>Заведено</b>
            <span className="fd-v">Legal Night Jazz</span>
          </span>
          <Seal />
        </span>
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
