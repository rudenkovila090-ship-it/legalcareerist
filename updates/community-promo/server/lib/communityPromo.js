// A community code is attribution, not permission to reprice a recurring plan.
export function normalizeCommunityPromo(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || value.length > 128) throw Error('invalid_promo_code')
  const code = value.trim().toUpperCase().replace(/\s+/g, '')
  if (!code) return ''
  if (!/^[A-ZА-ЯЁ0-9_-]{3,32}$/.test(code)) throw Error('invalid_promo_code')
  return code
}

export function communityPromoFromExtra(extra) {
  const marker = String(extra || '').split(' | ').find(part => part.startsWith('KY_PROMO:'))
  if (!marker) return ''
  try { return normalizeCommunityPromo(marker.slice('KY_PROMO:'.length)) } catch { return '' }
}
