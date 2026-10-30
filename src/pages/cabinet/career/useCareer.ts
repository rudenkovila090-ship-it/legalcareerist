import { useCallback, useEffect, useState } from 'react'
import { fetchCareer, patchCareer, peekCareer, type CareerState } from '../../../lib/careerCabinet'

/** Состояние раздела «Построение карьеры» (план, достижения, сводные числа): общее для всех вкладок, при возврате на вкладку показывается сразу. */
export function useCareer() {
  const [state, setState] = useState<CareerState | null>(() => peekCareer() ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetchCareer().then((r) => {
      if (!live) return
      if (r.ok) setState(r.data)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  /** Обновить часть состояния после сохранения на сервере. */
  const patch = useCallback((p: Partial<CareerState>) => {
    patchCareer(p)
    setState((prev) => (prev ? { ...prev, ...p } : prev))
  }, [])

  return { state, failed, patch }
}

export type CareerHandle = { state: CareerState; patch: (p: Partial<CareerState>) => void }
