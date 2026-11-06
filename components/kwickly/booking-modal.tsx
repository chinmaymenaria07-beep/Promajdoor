'use client'

import { useMemo, useState } from 'react'
import { Check, MapPin, Siren, X } from 'lucide-react'
import { cleanPhone, describeDetails, detailValue, isHttpUrl, money, validPhone } from '@/lib/kwickly'
import type { DetailEntry, FormField, ServiceCard } from '@/lib/kwickly'
import { HelplineCard } from './helpline'

export type FormValues = Record<string, string | string[]>
export type BookingPayload = {
  service: string
  slot: 'today' | 'tomorrow' | 'asap'
  description: string
  details: DetailEntry[]
  address: string
  phone: string
  altPhone: string | null
  mapsLink: string | null
  contactName: string
}

const box = 'w-full rounded-2xl border border-[#dce3e4] bg-white px-4 py-3.5 text-sm font-normal outline-none focus:border-[#397f68]'
const labelCls = 'flex flex-col gap-2 text-sm font-semibold text-[#29434b]'

const isEmpty = (value: string | string[] | undefined) => value === undefined || (Array.isArray(value) ? value.length === 0 : value.trim() === '')

/** Returns the label of the first required question that has no answer. */
export const firstMissing = (fields: FormField[], values: FormValues) => fields.find((field) => field.required && isEmpty(values[field.key]))?.label ?? null

export const toDetails = (fields: FormField[], values: FormValues): DetailEntry[] =>
  fields.filter((field) => !isEmpty(values[field.key])).map((field) => ({ key: field.key, label: field.label, value: values[field.key] }))

/** Renders the questions of one service. Also used for the admin's live preview. */
export function DynamicFields({ fields, values, onChange }: { fields: FormField[]; values: FormValues; onChange: (key: string, value: string | string[]) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  return <div className="flex flex-col gap-4">{fields.map((field) => {
    const value = values[field.key]
    const text = typeof value === 'string' ? value : ''
    const star = field.required ? <span className="ml-1 text-[#c0392b]">*</span> : <span className="ml-2 text-[11px] font-normal text-[#a7b3b6]">Optional</span>
    if (field.type === 'multiselect') {
      const chosen = Array.isArray(value) ? value : []
      return <div key={field.key} className={labelCls}><span>{field.label}{star}</span><div className="flex flex-wrap gap-2">{(field.options ?? []).map((option) => { const on = chosen.includes(option); return <button type="button" key={option} onClick={() => onChange(field.key, on ? chosen.filter((c) => c !== option) : [...chosen, option])} className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${on ? 'border-[#173f4a] bg-[#173f4a] text-white' : 'border-[#dce3e4] bg-white text-[#40525a] hover:border-[#397f68]'}`}>{on && <Check className="mr-1 inline size-3" />}{option}</button> })}</div></div>
    }
    if (field.type === 'yesno') {
      return <div key={field.key} className={labelCls}><span>{field.label}{star}</span><div className="grid grid-cols-2 gap-2">{['Yes', 'No'].map((option) => <button type="button" key={option} onClick={() => onChange(field.key, option)} className={`rounded-2xl border py-3 text-sm font-bold transition ${text === option ? 'border-[#173f4a] bg-[#173f4a] text-white' : 'border-[#dce3e4] bg-white text-[#40525a] hover:border-[#397f68]'}`}>{option}</button>)}</div></div>
    }
    return <label key={field.key} className={labelCls}><span>{field.label}{star}</span>
      {field.type === 'textarea' ? <textarea value={text} onChange={(e) => onChange(field.key, e.target.value)} placeholder={field.placeholder} maxLength={1500} className={`${box} min-h-24`} />
        : field.type === 'select' ? <select value={text} onChange={(e) => onChange(field.key, e.target.value)} className={box}><option value="">Choose…</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
        : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'} min={field.type === 'date' ? today : field.type === 'number' ? 0 : undefined} inputMode={field.type === 'number' ? 'decimal' : undefined} value={text} onChange={(e) => onChange(field.key, e.target.value)} placeholder={field.placeholder} maxLength={200} className={box} />}
    </label>
  })}</div>
}

type Props = {
  visitFee: number
  selectedService: string
  services: ServiceCard[]
  defaults: { name: string; phone: string; address: string }
  close: () => void
  createBooking: (payload: BookingPayload) => Promise<number | null>
  onEditProfile: () => void
}

export function BookingModal({ visitFee, selectedService, services, defaults, close, createBooking, onEditProfile }: Props) {
  const [step, setStep] = useState(1)
  const [serviceName, setServiceName] = useState(selectedService)
  const [values, setValues] = useState<FormValues>({})
  const [contact, setContact] = useState({ name: defaults.name, phone: defaults.phone, alt: '', address: defaults.address, maps: '' })
  const [slot, setSlot] = useState<'today' | 'tomorrow'>('tomorrow')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)
  const [code, setCode] = useState<number | null>(null)

  const service = useMemo(() => services.find((s) => s.name === serviceName), [services, serviceName])
  const flash = !!service?.isFlash
  const fields = service?.fields ?? []
  const steps = ['Details', 'Contact & place', flash ? 'Confirm' : 'Time & pay']

  const pickService = (name: string) => { setServiceName(name); setValues({}); setError('') }
  const setValue = (key: string, value: string | string[]) => { setValues((current) => ({ ...current, [key]: value })); setError('') }
  const setC = (key: keyof typeof contact) => (value: string) => { setContact((current) => ({ ...current, [key]: value })); setError('') }

  const next = () => {
    if (step === 1) {
      if (!service) { setError('Please choose a service'); return }
      const missing = firstMissing(fields, values)
      if (missing) { setError(`Please answer: ${missing}`); return }
    }
    if (step === 2) {
      if (contact.name.trim().length < 2) { setError('Please enter the contact name'); return }
      if (!validPhone(contact.phone)) { setError('Enter a valid 10-digit mobile number'); return }
      if (contact.alt.trim() && !validPhone(contact.alt)) { setError('The alternate number must be a valid 10-digit mobile number'); return }
      if (contact.address.trim().length < 8) { setError('Please enter the full service address'); return }
      if (contact.maps.trim() && !isHttpUrl(contact.maps)) { setError('The map link must start with http:// or https://'); return }
    }
    setError('')
    setStep(step + 1)
  }

  const locate = () => {
    if (!navigator.geolocation) { setError('Location is not available on this device'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setC('maps')(`https://www.google.com/maps?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`); setLocating(false) },
      () => { setError('Could not get your location. You can paste a Google Maps link instead.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const submit = async () => {
    if (!service) return
    setSaving(true)
    const details = toDetails(fields, values)
    const id = await createBooking({
      service: service.name,
      slot: flash ? 'asap' : slot,
      description: describeDetails(details),
      details,
      address: contact.address.trim(),
      phone: cleanPhone(contact.phone),
      altPhone: contact.alt.trim() ? cleanPhone(contact.alt) : null,
      mapsLink: contact.maps.trim() || null,
      contactName: contact.name.trim(),
    })
    setSaving(false)
    if (id != null) { setCode(id); setStep(4) }
  }

  const slotClass = (value: 'today' | 'tomorrow') => `rounded-2xl border p-4 text-left text-sm font-bold ${slot === value ? 'border-[#173f4a] bg-[#eef5f3]' : 'border-[#dce3e4]'}`
  const summary = toDetails(fields, values).filter((d) => d.key !== 'description').slice(0, 4)

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102f36]/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"><div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
    <div className={`sticky top-0 z-10 flex items-start justify-between gap-3 px-6 pb-4 pt-6 sm:px-8 ${flash ? 'bg-gradient-to-r from-[#7a1b17] to-[#a02a22] text-white' : 'bg-white'}`}>
      <div><p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.16em] ${flash ? 'text-[#ffd84a]' : 'text-[#8a9a9e]'}`}>{flash && <Siren className="size-3.5" />}{flash ? 'Flash request · urgent' : 'Book a trusted pro'}</p><h2 className={`mt-1 text-2xl font-semibold ${flash ? 'text-white' : 'text-[#173f4a]'}`}>{step === 4 ? 'Request received' : service?.name || 'New booking'}</h2></div>
      <button onClick={close} className={`flex size-9 shrink-0 items-center justify-center rounded-full ${flash ? 'bg-white/15' : 'bg-[#f2f5f5]'}`} aria-label="Close booking"><X className="size-4" /></button>
    </div>

    {step < 4 && <div className="flex gap-2 px-6 sm:px-8">{steps.map((label, index) => <div key={label} className="flex-1"><span className={`block h-1.5 rounded-full ${index + 1 <= step ? (flash ? 'bg-[#ff5a47]' : 'bg-[#397f68]') : 'bg-[#e8edef]'}`} /><span className={`mt-1.5 block text-[10px] font-bold uppercase tracking-wide ${index + 1 === step ? 'text-[#173f4a]' : 'text-[#a7b3b6]'}`}>{label}</span></div>)}</div>}

    <div className="px-6 pb-7 pt-5 sm:px-8 sm:pb-8">
      {step === 1 && <div className="flex flex-col gap-5">
        {!selectedService && <label className={labelCls}>Service<select value={serviceName} onChange={(e) => pickService(e.target.value)} className={box}><option value="">Choose a service</option>{services.filter((s) => !s.isFlash).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}{services.some((s) => s.isFlash) && <optgroup label="⚡ Flash / emergency">{services.filter((s) => s.isFlash).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</optgroup>}</select></label>}
        {flash && <p className="flex items-start gap-3 rounded-2xl bg-[#fde3e0] p-4 text-sm leading-6 text-[#8a1f17]"><Siren className="mt-0.5 size-5 shrink-0" /><span>This is an <b>urgent</b> request. Our team reviews it immediately and calls you. If someone is in danger, call emergency services (112) first.</span></p>}
        {service ? <DynamicFields fields={fields} values={values} onChange={setValue} /> : <p className="rounded-2xl bg-[#f7f8fa] p-4 text-sm text-[#819096]">Choose a service to see its questions.</p>}
      </div>}

      {step === 2 && <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-[#f7f8fa] p-3.5 text-xs leading-5 text-[#607078]">Filled in from your profile. You can change anything below <b>just for this booking</b> — your profile stays as it is. <button type="button" onClick={onEditProfile} className="font-bold text-[#34788b] underline">Edit my profile</button></p>
        <label className={labelCls}>Contact person<input value={contact.name} onChange={(e) => setC('name')(e.target.value)} placeholder="Who should the pro ask for?" className={box} /></label>
        <label className={labelCls}>Mobile number<input type="tel" inputMode="numeric" value={contact.phone} onChange={(e) => setC('phone')(e.target.value)} placeholder="10-digit mobile number" className={box} /></label>
        <label className={labelCls}><span>Alternate mobile<span className="ml-2 text-[11px] font-normal text-[#a7b3b6]">Optional</span></span><input type="tel" inputMode="numeric" value={contact.alt} onChange={(e) => setC('alt')(e.target.value)} placeholder="Another number we can reach" className={box} /></label>
        <label className={labelCls}>Service address<textarea value={contact.address} onChange={(e) => setC('address')(e.target.value)} placeholder="Flat / house no., building, street, area, landmark" className={`${box} min-h-24`} /></label>
        <div className={labelCls}><span>Location link<span className="ml-2 text-[11px] font-normal text-[#a7b3b6]">Optional · helps the pro find you</span></span>
          <div className="flex gap-2"><input value={contact.maps} onChange={(e) => setC('maps')(e.target.value)} placeholder="Paste a Google Maps link" className={box} /><button type="button" onClick={locate} disabled={locating} className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-[#dce3e4] px-4 text-xs font-bold text-[#29434b] disabled:opacity-60"><MapPin className="size-4 text-[#397f68]" />{locating ? 'Locating…' : 'Use my location'}</button></div>
        </div>
      </div>}

      {step === 3 && <div className="flex flex-col gap-4">
        {flash ? <div className="rounded-2xl border border-[#f2b8b0] bg-[#fff5f3] p-4 text-sm leading-6 text-[#8a1f17]"><b>Flash priority.</b> No time slot needed — your request goes to the top of our queue and our team will call you on <b>{cleanPhone(contact.phone)}</b>.</div>
          : <><p className="text-sm font-semibold text-[#29434b]">Choose a visit time</p><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setSlot('today')} className={slotClass('today')}>Today<span className="mt-1 block text-xs font-normal text-[#819096]">4:30 PM – 6 PM</span></button><button type="button" onClick={() => setSlot('tomorrow')} className={slotClass('tomorrow')}>Tomorrow<span className="mt-1 block text-xs font-normal text-[#819096]">10 AM – 12 PM</span></button></div></>}
        <div className="rounded-2xl bg-[#f7f8fa] p-4 text-sm">
          <p className="font-bold text-[#173f4a]">{service?.name}</p>
          {summary.map((d) => <p key={d.key} className="mt-1 text-xs text-[#607078]"><span className="text-[#8a9a9e]">{d.label}:</span> {detailValue(d)}</p>)}
          <p className="mt-2 text-xs text-[#607078]"><span className="text-[#8a9a9e]">Contact:</span> {contact.name} · {cleanPhone(contact.phone)}{contact.alt.trim() ? ` / ${cleanPhone(contact.alt)}` : ''}</p>
          <p className="mt-1 text-xs text-[#607078]"><span className="text-[#8a9a9e]">Address:</span> {contact.address}</p>
          <div className="mt-3 flex items-center justify-between border-t border-[#e2e8e9] pt-3"><span>Visit fee</span><strong>{money(visitFee)}</strong></div>
          <p className="mt-2 text-xs text-[#819096]">Pay now to confirm the visit. The work is billed separately after your pro inspects the job — the visit fee is never charged twice.</p>
        </div>
      </div>}

      {step === 4 && <div className="py-4 text-center">
        <span className={`mx-auto flex size-16 items-center justify-center rounded-full ${flash ? 'bg-[#fde3e0] text-[#c0392b]' : 'bg-[#e5f5ea] text-[#388157]'}`}>{flash ? <Siren className="size-8" /> : <Check className="size-8" />}</span>
        <h3 className="mt-5 text-xl font-bold text-[#173f4a]">{flash ? 'Flash request sent.' : "You're all set."}</h3>
        <p className="mt-1 text-sm font-bold text-[#397f68]">Booking KV-{code}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#738288]">{flash ? 'Our team is reviewing it right now and will call you shortly.' : 'Our team will assign a verified pro. You can follow the status on your dashboard.'} Questions? Call or WhatsApp us with your booking number.</p>
        <div className="mt-5 text-left"><HelplineCard compact title="Helpline" message={`Hi ProMajdoor, I just booked ${service?.name ?? 'a service'} (KV-${code}).`} /></div>
        <button onClick={close} className="mt-6 rounded-full bg-[#173f4a] px-8 py-3 text-sm font-bold text-white">Done</button>
      </div>}

      {error && step < 4 && <p role="alert" className="mt-4 rounded-2xl bg-[#fbeeee] p-3 text-sm font-semibold text-[#a24a4a]">{error}</p>}

      {step < 4 && <div className="mt-6 flex gap-3">
        {step > 1 && <button type="button" onClick={() => { setError(''); setStep(step - 1) }} className="rounded-2xl border border-[#dce3e4] px-6 py-4 text-sm font-bold text-[#40525a]">Back</button>}
        {step < 3 ? <button type="button" onClick={next} className="flex-1 rounded-2xl bg-[#173f4a] py-4 text-sm font-bold text-white">Continue</button>
          : <button type="button" disabled={saving} onClick={submit} className={`flex-1 rounded-2xl py-4 text-sm font-bold text-white disabled:opacity-60 ${flash ? 'bg-[#c0392b]' : 'bg-[#173f4a]'}`}>{saving ? 'Booking…' : flash ? `Send flash request · pay ${money(visitFee)}` : `Pay ${money(visitFee)} & book visit`}</button>}
      </div>}
    </div>
  </div></div>
}
