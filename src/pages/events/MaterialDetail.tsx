import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { materials } from '../../data/materials'
import { TagRow } from '../../components/Tag'
import RelatedContentBlock from '../../components/RelatedContentBlock'
import { getRelatedContent } from '../../lib/related'
import { materialKindLabel as kindLabel } from '../../components/cards'

export default function MaterialDetail() {
  const { slug } = useParams()
  const material = materials.find((m) => m.slug === slug)
  const [purchased, setPurchased] = useState(false)

  if (!material) {
    return (
      <div className="container-page py-16">
        <p>Материал не найден. <Link className="underline" to="/events/materials">Все материалы</Link></p>
      </div>
    )
  }

  const related = getRelatedContent(material, 'material', material.id)

  return (
    <div className="container-page py-12">
      <Link to="/events/materials" className="text-sm text-ink/50 hover:text-ink">← Все материалы</Link>

      <div className="mx-auto mt-4 max-w-3xl">
        <span className="text-sm font-medium uppercase tracking-wide text-gold">{kindLabel[material.kind]}</span>
        <h1 className="mt-1 text-3xl font-semibold">{material.title}</h1>
        <div className="mt-3"><TagRow specialization={material.specialization} industry={material.industry} /></div>
        <p className="mt-6 leading-relaxed text-ink/80">{material.description}</p>
        <div className="mt-2 text-sm text-ink/50">Для кого: {material.forWhom}</div>

        <div className="glass mt-6 rounded-xl p-6">
          {purchased ? (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Доступ открыт — ссылка отправлена на email, также появится в личном кабинете.
            </div>
          ) : material.kind === 'webinar' && material.sale ? (
            <div className="space-y-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/40">Что купить</div>
              {material.sale.recording !== undefined && (
                <button onClick={() => setPurchased(true)} className="flex w-full items-center justify-between rounded-lg border border-ink/15 px-4 py-2.5 text-sm hover:border-ink/30">
                  <span>Запись</span>
                  <span className="font-semibold">{material.sale.recording === 0 ? 'Бесплатно' : `${material.sale.recording.toLocaleString('ru-RU')} ₽`}</span>
                </button>
              )}
              {material.sale.materials !== undefined && (
                <button onClick={() => setPurchased(true)} className="flex w-full items-center justify-between rounded-lg border border-ink/15 px-4 py-2.5 text-sm hover:border-ink/30">
                  <span>Материалы</span>
                  <span className="font-semibold">{material.sale.materials.toLocaleString('ru-RU')} ₽</span>
                </button>
              )}
              {material.sale.bundle !== undefined && (
                <button onClick={() => setPurchased(true)} className="flex w-full items-center justify-between rounded-lg bg-ink px-4 py-2.5 text-sm text-white hover:bg-ink/90">
                  <span>Запись + материалы</span>
                  <span className="font-semibold">{material.sale.bundle === 0 ? 'Бесплатно' : `${material.sale.bundle.toLocaleString('ru-RU')} ₽`}</span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="text-2xl font-semibold">
                {material.price === 0 ? 'Бесплатно' : `${material.price.toLocaleString('ru-RU')} ₽`}
              </div>
              <button
                onClick={() => setPurchased(true)}
                className="mt-4 rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
              >
                {material.price === 0 ? 'Получить бесплатно' : 'Оплатить и получить доступ'}
              </button>
            </>
          )}
        </div>

        <RelatedContentBlock items={related} />
      </div>
    </div>
  )
}
