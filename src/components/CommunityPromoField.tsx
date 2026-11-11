export default function CommunityPromoField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-sm text-ink">
      <span>Промокод (необязательно)</span>
      <input
        name="promoCode"
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase().replace(/\s+/g, ''))}
        placeholder="Введите промокод"
        maxLength={32}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
      />
    </label>
  )
}
