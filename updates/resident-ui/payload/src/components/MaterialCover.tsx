import { useState } from 'react'
import type { MaterialItem } from '../types'

/** Полная обложка; для коллажа показываем соответствующий макет через CSS. */
export default function MaterialCover({ material, className = '', priority = false }: { material: MaterialItem; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!material.cover || failed === material.cover) return null
  const region = material.coverRegion
  const props = { src: material.cover, alt: `Обложка: ${material.title}`, loading: priority ? 'eager' as const : 'lazy' as const, decoding: 'async' as const, onError: () => setFailed(material.cover ?? null) }
  return <div className={`grid min-w-0 w-full aspect-[1199/1312] items-center overflow-hidden rounded-xl bg-[#f5efe5] ${className}`}>
    {region ? <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${region.width}/${region.height}` }}>
      <img {...props} width={region.sourceWidth} height={region.sourceHeight} className="absolute max-w-none" style={{ width: `${region.sourceWidth / region.width * 100}%`, height: `${region.sourceHeight / region.height * 100}%`, left: `${-region.x / region.width * 100}%`, top: `${-region.y / region.height * 100}%` }} />
    </div> : <img {...props} width={1199} height={1312} className="aspect-[1199/1312] h-auto w-full object-contain" />}
  </div>
}
