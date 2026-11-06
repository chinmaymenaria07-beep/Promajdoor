'use client'

import { useState } from 'react'
import { ArrowRight, Check, Clock3, FileText, ShieldCheck, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { formatDay } from '@/lib/kwickly'
import type { Application, Role, Screen } from '@/lib/kwickly'

type Props = {
  notify: (message: string) => void
  go: (screen: Screen) => void
  userId?: string
  role: Role
  application: Application | null
  services: string[]
  defaultName: string
  defaultEmail: string
  defaultPhone?: string
  onNeedLogin: () => void
  onSubmitted: () => Promise<void>
}

const ID_TYPES = ['Aadhaar card', 'PAN card', 'Driving licence', 'Voter ID', 'Passport']
const BUSINESS_TYPES = ['Individual / freelancer', 'Sole proprietorship', 'Partnership', 'Private limited company', 'Other']
const BUSINESS_PROOFS = ['GST certificate', 'Udyam / MSME registration', 'Shop & establishment licence', 'Trade licence', 'Skill / trade certificate', 'Other']
const MAX_FILE = 5 * 1024 * 1024
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const box = 'rounded-2xl border border-[#dce3e4] bg-white px-4 py-3.5 text-sm font-normal outline-none focus:border-[#397f68]'
const labelCls = 'flex flex-col gap-2 text-sm font-semibold text-[#29434b]'

const idNumberProblem = (type: string, value: string) => {
  const v = value.replace(/\s/g, '').toUpperCase()
  if (type === 'Aadhaar card') return /^\d{12}$/.test(v) ? null : 'Aadhaar number must be 12 digits'
  if (type === 'PAN card') return /^[A-Z]{5}\d{4}[A-Z]$/.test(v) ? null : 'PAN must look like ABCDE1234F'
  return v.length >= 6 ? null : 'Enter the ID number exactly as printed on the document'
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div className="mt-8 first:mt-6"><p className="text-sm font-bold text-[#173f4a]">{title}</p>{hint && <p className="mt-1 text-xs leading-5 text-[#819096]">{hint}</p>}<div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div></div>
}

function TextField({ label, value, onChange, placeholder, type = 'text', required = true, span, maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; span?: boolean; maxLength?: number }) {
  return <label className={`${labelCls} ${span ? 'sm:col-span-2' : ''}`}>{label}{!required && <span className="-mt-1 text-[11px] font-normal text-[#a7b3b6]">Optional</span>}<input required={required} type={type} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={box} /></label>
}

function SelectField({ label, value, onChange, options, span }: { label: string; value: string; onChange: (value: string) => void; options: string[]; span?: boolean }) {
  return <label className={`${labelCls} ${span ? 'sm:col-span-2' : ''}`}>{label}<select required value={value} onChange={(event) => onChange(event.target.value)} className={box}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>
}

function FileField({ label, hint, file, onChange, required = true }: { label: string; hint: string; file: File | null; onChange: (file: File | null) => void; required?: boolean }) {
  return <div className={labelCls}>
    <span>{label}{!required && <span className="ml-2 text-[11px] font-normal text-[#a7b3b6]">Optional</span>}</span>
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5 text-sm font-normal ${file ? 'border-[#397f68] bg-[#eef5f3] text-[#29434b]' : 'border-[#c9d3d5] text-[#738288]'}`}>
      {file ? <FileText className="size-5 shrink-0 text-[#397f68]" /> : <Upload className="size-5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{file ? file.name : hint}</span>
      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="sr-only" onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
      {file && <button type="button" onClick={(event) => { event.preventDefault(); onChange(null) }} className="rounded-full bg-white p-1" aria-label="Remove file"><X className="size-3.5" /></button>}
    </label>
  </div>
}

function Intro() {
  return <div className="rounded-[30px] bg-[#173f4a] p-8 text-white sm:p-12">
    <p className="text-xs font-bold uppercase tracking-[.16em] text-[#d7f15e]">ProMajdoor partner network</p>
    <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.05em] sm:text-5xl">Your skills deserve better work.</h1>
    <p className="mt-5 text-base leading-7 text-[#c2d3d3]">Get matched with customers nearby, bill your work professionally and take control of your earnings. Every application and document is verified by our team.</p>
    <div className="mt-10 flex flex-col gap-4 text-sm text-[#c2d3d3]">
      <span className="flex items-center gap-3"><Check className="shrink-0 text-[#d7f15e]" /> Quality leads near you</span>
      <span className="flex items-center gap-3"><Check className="shrink-0 text-[#d7f15e]" /> Built-in billing software with GST</span>
      <span className="flex items-center gap-3"><Check className="shrink-0 text-[#d7f15e]" /> Transparent earnings and payouts</span>
      <span className="flex items-center gap-3"><ShieldCheck className="shrink-0 text-[#d7f15e]" /> Your documents are stored privately and only seen by our verification team</span>
    </div>
  </div>
}

function StatusCard({ icon, tone, title, children }: { icon: React.ReactNode; tone: string; title: string; children: React.ReactNode }) {
  return <div className="rounded-[30px] border border-[#e8edef] bg-white p-7 shadow-sm sm:p-10"><span className={`flex size-14 items-center justify-center rounded-full ${tone}`}>{icon}</span><h2 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-[#173f4a]">{title}</h2>{children}</div>
}

export function ProviderApply({ notify, go, userId, role, application, services, defaultName, defaultEmail, defaultPhone, onNeedLogin, onSubmitted }: Props) {
  const [reapply, setReapply] = useState(false)
  const [busy, setBusy] = useState(false)
  const [terms, setTerms] = useState(false)
  const [f, setF] = useState({
    fullName: defaultName, phone: defaultPhone ?? '', email: defaultEmail, city: '', service: services[0] ?? '', years: '', experience: '',
    businessName: '', businessType: BUSINESS_TYPES[0], businessAddress: '', gst: '',
    idType: ID_TYPES[0], idNumber: '', businessProofType: BUSINESS_PROOFS[0],
    bankHolder: '', bankAccount: '', bankIfsc: '', upi: '',
  })
  const [idFile, setIdFile] = useState<File | null>(null)
  const [businessFile, setBusinessFile] = useState<File | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const set = (key: keyof typeof f) => (value: string) => setF((current) => ({ ...current, [key]: value }))

  /* ── who is looking at this page? ── */

  if (!userId) {
    return <section className="mt-3 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><Intro /><StatusCard icon={<ShieldCheck className="size-7" />} tone="bg-[#eef5f3] text-[#397f68]" title="Log in to apply"><p className="mt-3 text-sm leading-6 text-[#738288]">Create a ProMajdoor account or log in first. Then you can submit your details, ID proof and business proof for verification.</p><button onClick={onNeedLogin} className="mt-6 rounded-2xl bg-[#173f4a] px-6 py-4 text-sm font-bold text-white">Log in / create account</button></StatusCard></section>
  }

  if (role === 'provider') {
    return <section className="mt-3 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><Intro /><StatusCard icon={<Check className="size-7" />} tone="bg-[#e5f5ea] text-[#388157]" title="You are a verified provider"><p className="mt-3 text-sm leading-6 text-[#738288]">Your application was approved{application?.reviewed_at ? ` on ${formatDay(application.reviewed_at)}` : ''}. Your provider dashboard is active.</p><button onClick={() => go('provider')} className="mt-6 rounded-2xl bg-[#173f4a] px-6 py-4 text-sm font-bold text-white">Open provider dashboard <ArrowRight className="ml-2 inline size-4" /></button></StatusCard></section>
  }

  if (role === 'admin') {
    return <section className="mt-3 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><Intro /><StatusCard icon={<ShieldCheck className="size-7" />} tone="bg-[#ebe3fa] text-[#7655a5]" title="Admin account"><p className="mt-3 text-sm text-[#738288]">Admin accounts cannot apply as providers. Use a separate customer account to test the provider flow.</p></StatusCard></section>
  }

  if (application?.status === 'pending') {
    const steps: [string, boolean][] = [['Application submitted', true], ['Documents under review', true], ['Approved — dashboard unlocks', false]]
    return <section className="mt-3 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><Intro /><StatusCard icon={<Clock3 className="size-7" />} tone="bg-[#fff0be] text-[#9d6e00]" title="Application under review">
      <p className="mt-3 text-sm leading-6 text-[#738288]">Thanks {application.full_name.split(' ')[0]} — we received your application on {formatDay(application.created_at)}. Our team is checking your ID and business documents. Your provider dashboard turns on automatically as soon as you are approved; this page updates by itself.</p>
      <ol className="mt-7 flex flex-col gap-4">{steps.map(([text, done], index) => <li key={text} className="flex items-center gap-3 text-sm font-semibold text-[#29434b]"><span className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-[#397f68] text-white' : 'bg-[#eef1f2] text-[#8a9a9e]'}`}>{done ? <Check className="size-4" /> : index + 1}</span><span className={done ? '' : 'text-[#8a9a9e]'}>{text}</span></li>)}</ol>
      <dl className="mt-7 grid gap-3 sm:grid-cols-2">{([['Service', application.service], ['Business', application.business_name ?? '—'], ['City', application.city], ['ID proof', application.id_proof_type ?? '—']] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-2xl bg-[#f7f8fa] p-3"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{k}</dt><dd className="mt-1 text-sm font-semibold text-[#29434b]">{v}</dd></div>)}</dl>
      <button onClick={() => go('home')} className="mt-6 text-sm font-bold text-[#557179]">Back to home</button>
    </StatusCard></section>
  }

  if (application?.status === 'approved') {
    return <section className="mt-3 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><Intro /><StatusCard icon={<ShieldCheck className="size-7" />} tone="bg-[#f0f2f3] text-[#738288]" title="Provider access is switched off"><p className="mt-3 text-sm leading-6 text-[#738288]">Your application was approved, but provider access on this account is currently turned off by the ProMajdoor team. Please contact support to have it restored.</p><button onClick={() => go('home')} className="mt-6 text-sm font-bold text-[#557179]">Back to home</button></StatusCard></section>
  }

  if (application?.status === 'rejected' && !reapply) {
    return <section className="mt-3 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><Intro /><StatusCard icon={<X className="size-7" />} tone="bg-[#fbeeee] text-[#a24a4a]" title="Application not approved"><p className="mt-3 text-sm leading-6 text-[#738288]">Your application from {formatDay(application.created_at)} could not be approved this time.</p>{application.review_note && <p className="mt-4 rounded-2xl bg-[#f7f8fa] p-4 text-sm leading-6 text-[#29434b]"><b>Reason:</b> {application.review_note}</p>}<button onClick={() => setReapply(true)} className="mt-6 rounded-2xl bg-[#173f4a] px-6 py-4 text-sm font-bold text-white">Fix and apply again</button></StatusCard></section>
  }

  /* ── the application form ── */

  const checkFile = (file: File | null, name: string, required = true) => {
    if (!file) return required ? `Upload your ${name}` : null
    if (!FILE_TYPES.includes(file.type)) return `${name}: use a JPG, PNG, WEBP or PDF file`
    if (file.size > MAX_FILE) return `${name}: file is larger than 5 MB`
    return null
  }

  const problem = (): string | null => {
    const phone = f.phone.replace(/[\s-]/g, '')
    if (!/^(\+91|91)?[6-9]\d{9}$/.test(phone)) return 'Enter a valid 10-digit Indian mobile number'
    if (!f.service) return 'Choose your primary service'
    if (f.gst.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(f.gst.trim().toUpperCase())) return 'GST number looks incorrect (15 characters, e.g. 22ABCDE1234F1Z5)'
    const idProblem = idNumberProblem(f.idType, f.idNumber)
    if (idProblem) return idProblem
    if (!/^\d{9,18}$/.test(f.bankAccount.replace(/\s/g, ''))) return 'Bank account number must be 9–18 digits'
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.bankIfsc.trim().toUpperCase())) return 'IFSC code looks incorrect (e.g. HDFC0001234)'
    if (f.upi.trim() && !/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(f.upi.trim())) return 'UPI ID looks incorrect (e.g. name@upi)'
    return checkFile(idFile, 'ID proof') ?? checkFile(businessFile, 'business proof') ?? checkFile(photoFile, 'photo', false) ?? (terms ? null : 'Please accept the declaration')
  }

  const upload = async (file: File, tag: string) => {
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
    const path = `${userId}/${Date.now()}-${tag}.${ext}`
    const { error } = await supabase.storage.from('provider-docs').upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(`Could not upload your ${tag.replace('-', ' ')}: ${error.message}`)
    return path
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const issue = problem()
    if (issue) { notify(issue); return }
    setBusy(true)
    const uploaded: string[] = []
    try {
      const idPath = await upload(idFile!, 'id-proof'); uploaded.push(idPath)
      const businessPath = await upload(businessFile!, 'business-proof'); uploaded.push(businessPath)
      let photoPath: string | null = null
      if (photoFile) { photoPath = await upload(photoFile, 'photo'); uploaded.push(photoPath) }
      const years = Number(f.years)
      const { error } = await supabase.from('provider_applications').insert({
        full_name: f.fullName.trim(), phone: f.phone.trim(), email: f.email.trim(), city: f.city.trim(), service: f.service,
        experience: f.experience.trim(), years_experience: Number.isFinite(years) && f.years !== '' ? Math.round(years) : null,
        business_name: f.businessName.trim(), business_type: f.businessType, business_address: f.businessAddress.trim(), gst_number: f.gst.trim().toUpperCase() || null,
        id_proof_type: f.idType, id_proof_number: f.idNumber.replace(/\s/g, '').toUpperCase(), id_proof_path: idPath,
        business_proof_type: f.businessProofType, business_proof_path: businessPath, photo_path: photoPath,
        bank_holder: f.bankHolder.trim(), bank_account: f.bankAccount.replace(/\s/g, ''), bank_ifsc: f.bankIfsc.trim().toUpperCase(), upi_id: f.upi.trim() || null,
      })
      if (error) throw new Error(error.code === '23505' ? 'Your application is already under review' : `We could not submit your application: ${error.message}`)
      notify('Application submitted — our team will review it shortly')
      setReapply(false)
      await onSubmitted()
    } catch (error) {
      if (uploaded.length) await supabase.storage.from('provider-docs').remove(uploaded)
      notify(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="mt-3 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
    <Intro />
    <form onSubmit={submit} className="rounded-[30px] border border-[#e8edef] bg-white p-7 shadow-sm sm:p-10">
      <p className="text-sm font-bold uppercase tracking-[.16em] text-[#8a9a9e]">Provider application</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-[#173f4a]">Tell us about you and your business</h2>
      {application?.status === 'rejected' && application.review_note && <p className="mt-4 rounded-2xl bg-[#fff0be] p-4 text-sm text-[#9d6e00]"><b>Last time:</b> {application.review_note}</p>}

      <Section title="1. About you">
        <TextField label="Full name (as on your ID)" value={f.fullName} onChange={set('fullName')} placeholder="Your name" />
        <TextField label="Mobile number" value={f.phone} onChange={set('phone')} placeholder="98765 43210" type="tel" />
        <TextField label="Email address" value={f.email} onChange={set('email')} placeholder="you@example.com" type="email" />
        <TextField label="City / service area" value={f.city} onChange={set('city')} placeholder="Udaipur" />
        <SelectField label="Primary service" value={f.service} onChange={set('service')} options={services.length ? services : ['Electrician', 'Plumbing', 'Carpentry', 'Mechanic', 'Car wash', 'Catering']} />
        <TextField label="Years of experience" value={f.years} onChange={set('years')} placeholder="5" type="number" />
        <label className={`${labelCls} sm:col-span-2`}>About your work<textarea required value={f.experience} onChange={(event) => set('experience')(event.target.value)} className={`${box} min-h-24`} placeholder="Certifications, the work you do best, tools you own…" /></label>
      </Section>

      <Section title="2. Business details" hint="Working on your own? Use your name as the business name.">
        <TextField label="Business name" value={f.businessName} onChange={set('businessName')} placeholder="e.g. Sharma Electricals" />
        <SelectField label="Business type" value={f.businessType} onChange={set('businessType')} options={BUSINESS_TYPES} />
        <TextField label="Business address" value={f.businessAddress} onChange={set('businessAddress')} placeholder="Shop / office address" span />
        <TextField label="GST number" value={f.gst} onChange={set('gst')} placeholder="22ABCDE1234F1Z5" required={false} maxLength={15} span />
      </Section>

      <Section title="3. Identity & business proof" hint="JPG, PNG, WEBP or PDF, up to 5 MB each. Files are private and only visible to you and the ProMajdoor verification team.">
        <SelectField label="ID proof type" value={f.idType} onChange={set('idType')} options={ID_TYPES} />
        <TextField label="ID number" value={f.idNumber} onChange={set('idNumber')} placeholder={f.idType === 'Aadhaar card' ? '12-digit number' : f.idType === 'PAN card' ? 'ABCDE1234F' : 'As printed on the ID'} />
        <FileField label="Upload ID proof" hint="Choose a clear photo or scan" file={idFile} onChange={setIdFile} />
        <FileField label="Your photo" hint="Passport-style photo" file={photoFile} onChange={setPhotoFile} required={false} />
        <SelectField label="Business proof type" value={f.businessProofType} onChange={set('businessProofType')} options={BUSINESS_PROOFS} />
        <FileField label="Upload business proof" hint="Certificate, licence or registration" file={businessFile} onChange={setBusinessFile} />
      </Section>

      <Section title="4. Payout details" hint="ProMajdoor pays your earnings to this account.">
        <TextField label="Account holder name" value={f.bankHolder} onChange={set('bankHolder')} placeholder="Name on bank account" />
        <TextField label="Bank account number" value={f.bankAccount} onChange={set('bankAccount')} placeholder="Account number" />
        <TextField label="IFSC code" value={f.bankIfsc} onChange={(v) => set('bankIfsc')(v.toUpperCase())} placeholder="HDFC0001234" maxLength={11} />
        <TextField label="UPI ID" value={f.upi} onChange={set('upi')} placeholder="name@upi" required={false} />
      </Section>

      <label className="mt-7 flex items-start gap-2.5 text-xs leading-5 text-[#819096]"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1 size-4 shrink-0 accent-[#397f68]" />I confirm the details and documents are genuine and belong to me. I understand ProMajdoor adds a service charge on work bills and keeps a share of the visit fee, and that my account is activated only after admin approval.</label>

      <button disabled={busy} className="mt-6 w-full rounded-2xl bg-[#173f4a] py-4 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Uploading and submitting…' : 'Submit for verification'} {!busy && <ArrowRight className="ml-2 inline size-4" />}</button>
      <button type="button" onClick={() => go('home')} className="mt-4 w-full text-sm font-bold text-[#557179]">Back to home</button>
    </form>
  </section>
}
