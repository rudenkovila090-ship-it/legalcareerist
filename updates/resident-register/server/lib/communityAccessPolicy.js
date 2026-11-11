// A roster permission is an owner entitlement, never a fabricated bank payment.
export function ownerAccessAllowed(j, now = Date.now()) {
  const grant = j?.ownerAccess
  if (grant?.active !== true) return false
  if (grant.source === 'owner_access_rescue_20261110') return true
  if (grant.source !== 'owner_roster_20261111' || !j.tgUserId || grant.telegramId !== String(j.tgUserId)) return false
  return grant.until === null || (Number.isFinite(grant.until) && grant.until > now)
}
