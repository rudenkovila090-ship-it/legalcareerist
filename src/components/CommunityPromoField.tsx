import {useEffect,useState} from 'react'

export default function CommunityPromoField({ value, onChange, tariffId, onPriceChange }: { value: string; onChange: (value: string) => void; tariffId: string; onPriceChange: (value: number | null) => void }) {
  const [message,setMessage]=useState('')
  const [invalid,setInvalid]=useState(false)
  useEffect(()=>{
    onPriceChange(null);setMessage('');setInvalid(false)
    if(!value)return
    const controller=new AbortController()
    const timer=window.setTimeout(async()=>{
      setMessage('Проверяем промокод…')
      try{
        const response=await fetch('/api/community/promo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tariffId,promoCode:value}),signal:controller.signal})
        const data=await response.json()
        if(controller.signal.aborted)return
        if(!response.ok||!data.applied||!Number.isFinite(data.amount))throw Error('invalid')
        onPriceChange(data.amount);setMessage(`Промокод применен: ${Number(data.amount).toLocaleString('ru-RU')} ₽ ${data.months===1?'каждый месяц':`за ${data.months} мес.`}`)
      }catch{if(!controller.signal.aborted){setInvalid(true);setMessage('Промокод не найден, недоступен для этого тарифа или не удалось его проверить.')}}
    },300)
    return ()=>{window.clearTimeout(timer);controller.abort()}
  },[value,tariffId,onPriceChange])
  return (
    <label className="grid gap-1.5 text-sm text-ink">
      <input
        aria-label="Промокод"
        name="promoCode"
        value={value}
        onChange={(event) => {onPriceChange(null);onChange(event.target.value.toUpperCase().replace(/\s+/g, ''))}}
        placeholder="Промокод"
        maxLength={32}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
      />
      {message&&<span role="status" className={invalid?'text-xs text-red-600':'text-xs text-emerald-700'}>{message}</span>}
    </label>
  )
}
