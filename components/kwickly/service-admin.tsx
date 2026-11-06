'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Siren, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { FIELD_TYPES, GENERIC_FIELDS, SERVICE_ICON_KEYS, serviceStyles, slugify } from '@/lib/kwickly'
import type { FieldType, FormField, ServiceRow } from '@/lib/kwickly'
import { Empty, Panel, ghostBtn, inputCls, solidBtn } from './ui'
import { DynamicFields } from './booking-modal'
import type { FormValues } from './booking-modal'

type Notify = (message: string) => void
type EditField = FormField & { uid: number; optionsText: string }

let uidSeq = 0
const toEdit = (field: FormField): EditField => ({ ...field, uid: ++uidSeq, optionsText: (field.options ?? []).join('\n') })
const blankField = (): EditField => ({ uid: ++uidSeq, key: '', label: '', type: 'text', required: false, optionsText: '' })

const PRESETS: { label: string; make: () => FormField }[] = [
  { label: 'Describe the problem', make: () => ({ key: 'description', label: 'Describe the problem', type: 'textarea', required: true, placeholder: 'Tell the pro what is happening' }) },
  { label: 'Property type', make: () => ({ key: 'property_type', label: 'Property type', type: 'select', required: true, options: ['Flat / apartment', 'Independent house', 'Shop / office', 'Other'] }) },
  { label: 'Preferred date', make: () => ({ key: 'preferred_date', label: 'Preferred date', type: 'date', required: false }) },
  { label: 'Number of items', make: () => ({ key: 'number_of_items', label: 'Number of items', type: 'number', required: false }) },
  { label: 'Is it urgent?', make: () => ({ key: 'is_it_urgent', label: 'Is it urgent?', type: 'yesno', required: false }) },
]

const needsOptions = (type: FieldType) => type === 'select' || type === 'multiselect'
const migrationHint = (message: string) => /form_fields|is_flash|column/i.test(message) ? 'Run supabase/migration-forms-flash-profiles.sql in Supabase first, then try again.' : message

function ServiceEditor({ initial, notify, onClose, onSaved }: { initial: ServiceRow | null; notify: Notify; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [detail, setDetail] = useState(initial?.detail ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? SERVICE_ICON_KEYS[0])
  const [flash, setFlash] = useState(!!initial?.is_flash)
  const [active, setActive] = useState(initial?.active ?? true)
  const [fields, setFields] = useState<EditField[]>((initial?.form_fields?.length ? initial.form_fields : GENERIC_FIELDS).map(toEdit))
  const [preview, setPreview] = useState(false)
  const [previewValues, setPreviewValues] = useState<FormValues>({})
  const [busy, setBusy] = useState(false)

  const patch = (uid: number, change: Partial<EditField>) => setFields((current) => current.map((f) => (f.uid === uid ? { ...f, ...change } : f)))
  const move = (index: number, dir: -1 | 1) => setFields((current) => { const copy = [...current]; const target = index + dir; if (target < 0 || target >= copy.length) return current;[copy[index], copy[target]] = [copy[target], copy[index]]; return copy })

  /** Final form definition: stable keys (existing keys never change), unique, options parsed. */
  const build = (): { fields: FormField[]; problem: string | null } => {
    const used = new Set<string>()
    const out: FormField[] = []
    for (const f of fields) {
      const label = f.label.trim()
      if (!label) return { fields: [], problem: 'Every field needs a label' }
      let key = f.key || slugify(label) || `field_${out.length + 1}`
      let n = 2
      const base = key
      while (used.has(key)) key = `${base}_${n++}`
      used.add(key)
      const field: FormField = { key, label, type: f.type, required: f.required }
      if (f.placeholder?.trim()) field.placeholder = f.placeholder.trim()
      if (needsOptions(f.type)) {
        const options = Array.from(new Set(f.optionsText.split('\n').map((o) => o.trim()).filter(Boolean)))
        if (options.length < 2) return { fields: [], problem: `"${label}" needs at least two options (one per line)` }
        field.options = options
      }
      out.push(field)
    }
    return { fields: out, problem: null }
  }

  const save = async () => {
    if (name.trim().length < 2) { notify('Give the service a name'); return }
    if (fields.length > 30) { notify('A form can have at most 30 fields'); return }
    const { fields: finalFields, problem } = build()
    if (problem) { notify(problem); return }
    setBusy(true)
    const row = { name: name.trim(), detail: detail.trim(), icon, active, is_flash: flash, form_fields: finalFields }
    const { error } = initial ? await supabase.from('services').update(row).eq('id', initial.id) : await supabase.from('services').insert(row)
    setBusy(false)
    if (error) { notify(error.code === '23505' ? 'A service with this name already exists' : migrationHint(error.message)); return }
    notify(initial ? 'Service updated' : 'Service created')
    await onSaved()
    onClose()
  }

  const style = serviceStyles[icon] ?? serviceStyles.wrench
  const PreviewIcon = style.icon
  const previewFields = (() => { const { fields: f, problem } = build(); return problem ? [] : f })()

  return <div className="mt-6 rounded-[26px] border-2 border-[#173f4a] bg-white p-5 shadow-lg sm:p-7">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8a9a9e]">{initial ? 'Edit service' : 'New service'}</p><h3 className="mt-1 text-xl font-semibold text-[#173f4a]">{initial ? initial.name : 'Create a service'}</h3></div><button onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-[#f2f5f5]" aria-label="Close editor"><X className="size-4" /></button></div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#29434b]">Service name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AC repair" className={inputCls} /></label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#29434b]">Short description<input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Shown on the service card" className={inputCls} /></label>
      <div className="flex flex-col gap-2 text-sm font-semibold text-[#29434b] sm:col-span-2">Icon
        <div className="flex flex-wrap gap-2">{SERVICE_ICON_KEYS.map((key) => { const s = serviceStyles[key]; const I = s.icon; return <button type="button" key={key} onClick={() => setIcon(key)} title={key} className={`flex size-11 items-center justify-center rounded-2xl ${s.tone} ${icon === key ? 'ring-2 ring-[#173f4a] ring-offset-2' : 'opacity-70 hover:opacity-100'}`}><I className="size-5" /></button> })}</div></div>
      <label className="flex items-start gap-3 rounded-2xl border border-[#f2b8b0] bg-[#fff5f3] p-4 text-sm"><input type="checkbox" checked={flash} onChange={(e) => setFlash(e.target.checked)} className="mt-1 size-4 accent-[#c0392b]" /><span><b className="flex items-center gap-1.5 text-[#8a1f17]"><Siren className="size-4" />Flash (emergency) service</b><span className="mt-1 block text-xs leading-5 text-[#8a5a55]">Shown in the separate Flash section on the home page, marked urgent for your team and moved to the top of the orders list.</span></span></label>
      <label className="flex items-start gap-3 rounded-2xl border border-[#e8edef] p-4 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-1 size-4 accent-[#397f68]" /><span><b className="text-[#173f4a]">Live on the website</b><span className="mt-1 block text-xs leading-5 text-[#819096]">Untick to hide it from customers without deleting it.</span></span></label>
    </div>

    <div className="mt-7 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-[#173f4a]">Booking form fields <span className="font-normal text-[#8a9a9e]">({fields.length})</span></p><button type="button" onClick={() => setPreview(!preview)} className={ghostBtn}><Eye className="mr-1 inline size-3.5" />{preview ? 'Hide preview' : 'Preview form'}</button></div>
    <p className="mt-1 text-xs leading-5 text-[#819096]">These are the questions customers answer when booking this service. Contact name, mobile, address and map link are always asked in the next step.</p>

    {preview && <div className="mt-4 rounded-2xl bg-[#f7f8fa] p-5"><div className="mb-4 flex items-center gap-3"><span className={`flex size-10 items-center justify-center rounded-xl ${style.tone}`}><PreviewIcon className="size-5" /></span><p className="font-bold text-[#173f4a]">{name || 'Service'} — customer view</p></div>{previewFields.length ? <DynamicFields fields={previewFields} values={previewValues} onChange={(k, v) => setPreviewValues((c) => ({ ...c, [k]: v }))} /> : <p className="text-sm text-[#a24a4a]">Fix the highlighted problems in the field list to see the preview.</p>}</div>}

    <div className="mt-4 flex flex-col gap-3">
      {fields.map((f, index) => <div key={f.uid} className="rounded-2xl border border-[#edf0f1] bg-[#fcfdfd] p-4">
        <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_auto]">
          <input value={f.label} onChange={(e) => patch(f.uid, { label: e.target.value })} placeholder="Question / label" className={inputCls} />
          <select value={f.type} onChange={(e) => patch(f.uid, { type: e.target.value as FieldType })} className={inputCls}>{FIELD_TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
          <div className="flex items-center gap-1"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="flex size-9 items-center justify-center rounded-full hover:bg-[#f2f5f5] disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-4" /></button><button type="button" onClick={() => move(index, 1)} disabled={index === fields.length - 1} className="flex size-9 items-center justify-center rounded-full hover:bg-[#f2f5f5] disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-4" /></button><button type="button" onClick={() => setFields((current) => current.filter((x) => x.uid !== f.uid))} className="flex size-9 items-center justify-center rounded-full text-[#a24a4a] hover:bg-[#fbeeee]" aria-label="Delete field"><Trash2 className="size-4" /></button></div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          {needsOptions(f.type) ? <textarea value={f.optionsText} onChange={(e) => patch(f.uid, { optionsText: e.target.value })} placeholder={'One option per line\nOption A\nOption B'} className={`${inputCls} min-h-24`} />
            : f.type === 'yesno' || f.type === 'date' || f.type === 'time' ? <span className="text-xs text-[#a7b3b6]">No extra settings for this type.</span>
            : <input value={f.placeholder ?? ''} onChange={(e) => patch(f.uid, { placeholder: e.target.value })} placeholder="Hint shown inside the box (optional)" className={inputCls} />}
          <label className="flex items-center gap-2 text-xs font-bold text-[#29434b]"><input type="checkbox" checked={f.required} onChange={(e) => patch(f.uid, { required: e.target.checked })} className="size-4 accent-[#397f68]" />Required</label>
        </div>
      </div>)}
      {!fields.length && <Empty text="No fields yet — customers will only see the contact and address step." />}
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setFields((current) => [...current, blankField()])} className={ghostBtn}><Plus className="mr-1 inline size-3.5" />Add field</button>
      <span className="text-xs text-[#a7b3b6]">Quick add:</span>
      {PRESETS.map((preset) => <button type="button" key={preset.label} onClick={() => setFields((current) => current.some((f) => f.label === preset.label) ? current : [...current, toEdit(preset.make())])} className="rounded-full bg-[#f2f5f5] px-3 py-1.5 text-[11px] font-bold text-[#40525a] hover:bg-[#e5efe9]">{preset.label}</button>)}
    </div>

    <div className="mt-6 flex gap-3 border-t border-[#edf0f1] pt-5"><button disabled={busy} onClick={save} className="flex-1 rounded-2xl bg-[#173f4a] py-3.5 text-sm font-bold text-white disabled:opacity-60 sm:flex-none sm:px-10">{busy ? 'Saving…' : initial ? 'Save changes' : 'Create service'}</button><button onClick={onClose} className="rounded-2xl border border-[#dce3e4] px-6 py-3.5 text-sm font-bold text-[#40525a]">Cancel</button></div>
  </div>
}

export function AdminServices({ services, notify, reloadServices }: { services: ServiceRow[]; notify: Notify; reloadServices: () => Promise<void> }) {
  const [editing, setEditing] = useState<ServiceRow | 'new' | null>(null)
  const rows = services.filter((s) => s.id !== 0)
  const flash = rows.filter((s) => s.is_flash)
  const regular = rows.filter((s) => !s.is_flash)

  const toggle = async (service: ServiceRow) => {
    const { error } = await supabase.from('services').update({ active: !service.active }).eq('id', service.id)
    notify(error ? error.message : service.active ? 'Service hidden from customers' : 'Service is live')
    await reloadServices()
  }
  const remove = async (service: ServiceRow) => {
    if (!window.confirm(`Delete "${service.name}"? Existing bookings keep their details. This cannot be undone.`)) return
    const { error } = await supabase.from('services').delete().eq('id', service.id)
    notify(error ? error.message : 'Service deleted')
    await reloadServices()
  }

  const list = (items: ServiceRow[], title: string) => <Panel title={`${title} (${items.length})`}>{items.length ? <div className="flex flex-col gap-3">{items.map((s) => {
    const style = serviceStyles[s.icon] ?? serviceStyles.wrench; const I = style.icon
    return <div key={s.id} className="flex flex-col gap-3 rounded-2xl border border-[#edf0f1] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3"><span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${style.tone}`}><I className="size-5" /></span><div><p className="font-bold text-[#29434b]">{s.name}</p><p className="mt-0.5 text-xs text-[#8a9a9e]">{s.detail || 'No description'} · {s.form_fields?.length ?? 0} form field{(s.form_fields?.length ?? 0) === 1 ? '' : 's'}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${s.active ? 'bg-[#e5f5ea] text-[#388157]' : 'bg-[#f0f2f3] text-[#738288]'}`}>{s.active ? 'Live' : 'Hidden'}</span>{s.is_flash && <span className="rounded-full bg-[#fde3e0] px-2.5 py-1 text-[10px] font-bold text-[#c0392b]">⚡ Flash</span>}<button onClick={() => setEditing(s)} className={solidBtn}><Pencil className="mr-1 inline size-3" />Edit</button><button onClick={() => toggle(s)} className={ghostBtn}>{s.active ? 'Hide' : 'Show'}</button><button onClick={() => remove(s)} className={`${ghostBtn} text-[#a24a4a]`}>Delete</button></div>
    </div>
  })}</div> : <Empty text="Nothing here yet." />}</Panel>

  return <>
    <Panel title="Services & booking forms" action={<button onClick={() => setEditing('new')} className={solidBtn}><Plus className="mr-1 inline size-3.5" />New service</button>}>
      <p className="text-sm leading-6 text-[#738288]">Every service has its own booking form. Create services, choose what customers are asked, and mark urgent ones as <b>Flash</b> so they appear in the emergency section and jump to the top of your orders.</p>
      {rows.length === 0 && <p className="mt-4 rounded-2xl bg-[#fff0be] p-4 text-sm text-[#9d6e00]">No services in the database yet. Run <b>supabase/migration-forms-flash-profiles.sql</b> (and the earlier migrations) to add the starter services, or create one with “New service”.</p>}
      {editing && <ServiceEditor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} notify={notify} onClose={() => setEditing(null)} onSaved={reloadServices} />}
    </Panel>
    {list(flash, '⚡ Flash services')}
    {list(regular, 'Regular services')}
  </>
}
