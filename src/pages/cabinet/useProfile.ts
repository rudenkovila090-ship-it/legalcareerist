import { useCallback, useEffect, useState } from 'react'
import { fetchOptions, fetchProfile, type Profile, type ProfileOptions } from '../../lib/cabinet'

/** Профиль и справочники (практики, уровни) для форм кабинета. */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([fetchProfile(), fetchOptions()]).then(([p, o]) => {
      if (!active) return
      if (p.ok && o.ok) {
        setProfile(p.data.profile)
        setOptions(o.data)
      } else setFailed(true)
    })
    return () => {
      active = false
    }
  }, [])

  const update = useCallback((next: Profile) => setProfile(next), [])
  return { profile, options, failed, update }
}
