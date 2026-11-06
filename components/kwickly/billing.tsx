'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, Plus, Printer, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import {
  GST_RATES,
  PAYMENT_METHODS,
  billNumber,
  billStatusLabel,
  callRpc,
  computeBill,
  formatDay,
  formatWhen,
  methodLabel,
  money,
} from '@/lib/kwickly'
import type { Bill, BillItem, Booking, LineKind, ProviderItem, Settings } from '@/lib/kwickly'
import { inputCls, solidBtn, ghostBtn } from './ui'

type Notify = (message: string) => void

export function BillStatusChip({ status }: { status: Bill['status'] }) {
  const tone = status === 'paid' ? 'bg-[#e5f5ea] text-[#388157]' : status === 'sent' ? 'bg-[#fff0be] text-[#9d6e00]' : 'bg-[#f0f2f3] text-[#738288]'
  return <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${tone}`}>{billStatusLabel(status)}</span>
}

/* ───────────────────────── printable invoice ───────────────────────── */

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const kindLabel = (kind: LineKind) => (kind === 'labour' ? 'Labour' : kind === 'other' ? 'Other' : 'Material')

export function printInvoice(bill: Bill, booking: Booking) {
  const rows = bill.items.map((item) => `<tr><td>${esc(item.name)}<small>${kindLabel(item.kind)}</small></td><td class="r">${esc(item.qty)}</td><td class="r">${inr(item.price)}</td><td class="r">${esc(item.tax_percent)}%</td><td class="r">${inr(item.amount ?? item.qty * item.price)}</td></tr>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(billNumber(bill))}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#14212b;margin:0;padding:32px;font-size:13px}
    h1{margin:0;font-size:26px;color:#173f4a}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #173f4a;padding-bottom:14px}
    .meta{text-align:right;line-height:1.6}.cols{display:flex;gap:40px;margin:22px 0}.cols div{flex:1;line-height:1.6}.lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a9a9e;font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#f2f5f5;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:9px}td{padding:9px;border-bottom:1px solid #e8edef;vertical-align:top}
    td small{display:block;color:#8a9a9e;font-size:10px}.r{text-align:right}.tot{margin-left:auto;width:320px;margin-top:16px}.tot div{display:flex;justify-content:space-between;padding:5px 0}
    .grand{border-top:2px solid #173f4a;margin-top:6px;padding-top:10px!important;font-size:17px;font-weight:bold;color:#173f4a}.note{margin-top:22px;padding:12px;background:#f7f8fa;border-radius:8px;line-height:1.6}
    .foot{margin-top:30px;color:#8a9a9e;font-size:11px;text-align:center}@media print{body{padding:0}}</style></head><body>
    <div class="top"><div><h1>ProMajdoor.</h1><div>Tax invoice</div></div><div class="meta"><b>${esc(billNumber(bill))}</b><br>Date: ${esc(formatDay(bill.sent_at ?? bill.created_at))}<br>Booking: ${esc(booking.code)}<br>Status: ${esc(billStatusLabel(bill.status))}${bill.paid_at ? `<br>Paid ${esc(formatDay(bill.paid_at))} (${esc(methodLabel(bill.paid_method))})` : ''}</div></div>
    <div class="cols"><div><span class="lbl">Service provider</span><br><b>${esc(bill.business_name || bill.provider_name)}</b><br>${bill.business_name ? esc(bill.provider_name) + '<br>' : ''}${bill.provider_gst ? 'GSTIN: ' + esc(bill.provider_gst) : ''}</div>
    <div><span class="lbl">Billed to</span><br><b>${esc(booking.customerName || 'Customer')}</b><br>${esc(booking.address)}<br>${esc(booking.phone)}</div>
    <div><span class="lbl">Service</span><br><b>${esc(booking.service)}</b><br>Visit: ${esc(formatWhen(booking.scheduledAt))}</div></div>
    <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><div><span>Items &amp; materials</span><span>${inr(bill.materials_subtotal)}</span></div><div><span>Labour</span><span>${inr(bill.labour_subtotal)}</span></div><div><span>Subtotal</span><span>${inr(bill.subtotal)}</span></div>
    <div><span>GST</span><span>${inr(bill.tax_total)}</span></div><div><span>ProMajdoor service charge (${esc(bill.service_charge_percent)}%)</span><span>${inr(bill.service_charge)}</span></div>
    <div class="grand"><span>Total payable</span><span>${inr(bill.total)}</span></div></div>
    <div class="note">Visit fee of <b>${inr(booking.visitFee)}</b> was paid in advance when the visit was booked and is <b>not</b> included in the total above.${bill.notes ? '<br><br><b>Note:</b> ' + esc(bill.notes) : ''}</div>
    <div class="foot">Thank you for choosing ProMajdoor. This is a computer-generated invoice.</div>
    <script>window.onload=function(){window.print()}</script></body></html>`
  const win = window.open('', '_blank')
  if (!win) { window.alert('Please allow pop-ups to print the invoice.'); return }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

/* ───────────────────────── invoice on screen ───────────────────────── */

export function InvoiceView({ bill, booking, showEarning }: { bill: Bill; booking: Booking; showEarning?: boolean }) {
  const line = (label: string, value: string, strong?: boolean) => <div className={`flex justify-between py-1.5 text-sm ${strong ? 'mt-1 border-t-2 border-[#173f4a] pt-3 text-lg font-bold text-[#173f4a]' : 'text-[#607078]'}`}><span>{label}</span><span>{value}</span></div>
  return <div className="rounded-2xl border border-[#e8edef] bg-white p-5">
    <div className="flex flex-col justify-between gap-3 border-b border-[#edf0f1] pb-4 sm:flex-row">
      <div><p className="text-xl font-bold text-[#173f4a]">{billNumber(bill)}</p><p className="mt-1 text-xs text-[#8a9a9e]">{booking.code} · {formatDay(bill.sent_at ?? bill.created_at)}</p></div>
      <div className="flex items-start gap-2"><BillStatusChip status={bill.status} />{bill.paid_at && <span className="text-xs text-[#738288]">{formatDay(bill.paid_at)} · {methodLabel(bill.paid_method)}</span>}</div>
    </div>
    <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Service provider</p><p className="mt-1 font-bold text-[#29434b]">{bill.business_name || bill.provider_name}</p>{bill.business_name && <p className="text-xs text-[#738288]">{bill.provider_name}</p>}{bill.provider_gst && <p className="text-xs text-[#738288]">GSTIN {bill.provider_gst}</p>}</div>
      <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Billed to</p><p className="mt-1 font-bold text-[#29434b]">{booking.customerName || 'Customer'}</p><p className="text-xs text-[#738288]">{booking.address}</p></div>
    </div>
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead><tr className="bg-[#f7f8fa] text-[10px] uppercase tracking-[.1em] text-[#8a9a9e]"><th className="p-2.5">Description</th><th className="p-2.5 text-right">Qty</th><th className="p-2.5 text-right">Rate</th><th className="p-2.5 text-right">GST</th><th className="p-2.5 text-right">Amount</th></tr></thead>
      <tbody>{bill.items.map((item, index) => <tr key={index} className="border-b border-[#edf0f1]"><td className="p-2.5"><span className="font-semibold text-[#29434b]">{item.name}</span><span className="block text-[10px] text-[#8a9a9e]">{kindLabel(item.kind)}</span></td><td className="p-2.5 text-right">{item.qty}</td><td className="p-2.5 text-right">{money(item.price)}</td><td className="p-2.5 text-right">{item.tax_percent}%</td><td className="p-2.5 text-right font-semibold">{money(item.amount ?? item.qty * item.price)}</td></tr>)}</tbody></table></div>
    <div className="ml-auto mt-4 max-w-xs">
      {line('Items & materials', money(bill.materials_subtotal))}
      {line('Labour', money(bill.labour_subtotal))}
      {line('Subtotal', money(bill.subtotal))}
      {line('GST', money(bill.tax_total))}
      {line(`ProMajdoor service charge (${bill.service_charge_percent}%)`, money(bill.service_charge))}
      {line('Total payable', money(bill.total), true)}
    </div>
    <p className="mt-4 rounded-xl bg-[#f7f8fa] p-3 text-xs leading-5 text-[#738288]">Visit fee {money(booking.visitFee)} was paid in advance and is not included in this total.{bill.notes ? ` Note: ${bill.notes}` : ''}</p>
    {showEarning && <p className="mt-2 rounded-xl bg-[#e5f5ea] p-3 text-xs font-semibold text-[#388157]">Provider earning on this work: {money(bill.provider_earning)} · ProMajdoor service charge: {money(bill.service_charge)}</p>}
    <button onClick={() => printInvoice(bill, booking)} className={`${ghostBtn} mt-4`}><Printer className="mr-1.5 inline size-3.5" />Print / save as PDF</button>
  </div>
}

/* ───────────────────────── bill card used in "My bills" lists ───────────────────────── */

export function BookingBillCard({ booking, bill, who, showEarning }: { booking: Booking; bill?: Bill; who?: string; showEarning?: boolean }) {
  const [open, setOpen] = useState(false)
  const work = bill && bill.status !== 'draft' ? bill : undefined
  return <div className="rounded-2xl border border-[#edf0f1] p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-bold text-[#29434b]">{booking.service}</p><p className="mt-1 text-xs text-[#8a9a9e]">{booking.code} · {formatDay(booking.scheduledAt)}{who ? ` · ${who}` : ''}</p></div>
      <div className="text-left text-xs text-[#738288] sm:text-right">
        <p>Visit fee {money(booking.visitFee)} <span className="font-bold text-[#388157]">prepaid</span> · {work ? `Work bill ${money(work.total)}` : bill ? 'Bill being prepared' : 'No work bill yet'}</p>
        <p className="mt-1 flex items-center gap-2 sm:justify-end"><span className="text-base font-semibold text-[#173f4a]">{money(booking.visitFee + (work?.total ?? 0))}</span>{work && <BillStatusChip status={work.status} />}</p>
      </div>
    </div>
    {work && <button onClick={() => setOpen(!open)} className="mt-3 flex items-center gap-1 text-xs font-bold text-[#557179]"><ChevronRight className={`size-3.5 transition ${open ? 'rotate-90' : ''}`} />{open ? 'Hide invoice' : 'View invoice'}</button>}
    {open && work && <div className="mt-3"><InvoiceView bill={work} booking={booking} showEarning={showEarning} /></div>}
  </div>
}

/* ───────────────────────── the billing software (provider) ───────────────────────── */

type Row = { key: number; name: string; kind: LineKind; qty: string; price: string; tax: string }
let rowSeq = 0
const blankRow = (kind: LineKind = 'material', name = ''): Row => ({ key: ++rowSeq, name, kind, qty: '1', price: '', tax: '0' })
const num = (value: string) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const PRESETS = ['Labour charge', 'Installation charge', 'Repair charge', 'Spare part', 'Material']

export function BillingEditor({ booking, bill, settings, notify, reload, close }: { booking: Booking; bill?: Bill; settings: Settings; notify: Notify; reload: () => Promise<void>; close: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => bill && bill.items.length
    ? bill.items.map((item) => ({ key: ++rowSeq, name: item.name, kind: item.kind, qty: String(item.qty), price: String(item.price), tax: String(item.tax_percent) }))
    : [blankRow('material'), blankRow('labour', 'Labour charge')])
  const [notes, setNotes] = useState(bill?.notes ?? '')
  const [remember, setRemember] = useState(true)
  const [catalog, setCatalog] = useState<ProviderItem[]>([])
  const [busy, setBusy] = useState(false)
  const [method, setMethod] = useState('cash')

  const locked = bill?.status === 'paid'
  const canBill = booking.status === 'in_progress' || booking.status === 'completed'
  const percent = bill && bill.status !== 'draft' ? bill.service_charge_percent : settings.service_charge_percent

  useEffect(() => {
    supabase.from('provider_items').select('*').order('name').then(({ data }) => setCatalog((data ?? []) as ProviderItem[]))
  }, [])

  const filled = rows.filter((row) => row.name.trim() !== '')
  const items: BillItem[] = filled.map((row) => ({ name: row.name.trim(), kind: row.kind, qty: num(row.qty), price: num(row.price), tax_percent: num(row.tax) }))
  const totals = computeBill(items, percent)

  const update = (key: number, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const rename = (key: number, name: string) => {
    const hit = catalog.find((item) => item.name.toLowerCase() === name.trim().toLowerCase())
    const row = rows.find((r) => r.key === key)
    if (hit && row && row.price === '') update(key, { name, kind: hit.kind, price: String(hit.unit_price), tax: String(hit.tax_percent) })
    else update(key, { name })
  }

  const validate = (): string | null => {
    if (!filled.length) return 'Add at least one item or labour charge'
    for (const row of filled) {
      if (!(num(row.qty) > 0)) return `Enter a quantity for "${row.name}"`
      if (row.price.trim() === '' || num(row.price) < 0) return `Enter a price for "${row.name}"`
    }
    return null
  }

  const save = async (send: boolean) => {
    const problem = validate()
    if (problem) { notify(problem); return }
    if (send && !window.confirm(`Send this bill of ${money(totals.total)} to ${booking.customerName || 'the customer'}?`)) return
    setBusy(true)
    const { error } = await supabase.rpc('provider_save_bill', { p_booking: booking.rid, p_items: items.map(({ name, kind, qty, price, tax_percent }) => ({ name, kind, qty, price, tax_percent })), p_notes: notes, p_send: send })
    if (error) { notify(error.message); setBusy(false); return }
    if (remember) {
      const known = new Set(catalog.map((item) => item.name.toLowerCase()))
      for (const item of items) if (!known.has(item.name.toLowerCase())) await callRpc('provider_save_item', { p_name: item.name, p_kind: item.kind, p_price: item.price, p_tax: item.tax_percent })
    }
    notify(send ? 'Bill sent to the customer' : 'Draft saved')
    await reload()
    setBusy(false)
    if (send) close()
  }

  const discard = async () => {
    if (!window.confirm('Delete this draft bill?')) return
    setBusy(true)
    const error = await callRpc('provider_delete_draft_bill', { p_booking: booking.rid })
    setBusy(false)
    if (error) { notify(error); return }
    notify('Draft deleted')
    await reload()
    close()
  }

  const markPaid = async () => {
    if (!window.confirm(`Confirm that ${booking.customerName || 'the customer'} has paid ${money(bill?.total ?? 0)} by ${methodLabel(method)}?`)) return
    setBusy(true)
    const error = await callRpc('mark_bill_paid', { p_booking: booking.rid, p_method: method })
    setBusy(false)
    if (error) { notify(error); return }
    notify('Payment recorded')
    await reload()
  }

  const label = 'text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9a9e]'
  const cell = 'flex min-w-0 flex-col gap-1'
  const mobileLabel = (text: string) => <span className={`${label} sm:hidden`}>{text}</span>
  const grid = 'sm:grid-cols-[1.7fr_.9fr_.55fr_.8fr_.7fr_.9fr_auto]'

  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#102f36]/60 p-0 backdrop-blur-sm sm:items-center sm:p-5">
    <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8a9a9e]">Billing · {booking.code}</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#173f4a]">{bill ? billNumber(bill) : 'New bill'} for {booking.customerName || 'customer'}</h2>
          <p className="mt-1 text-xs text-[#819096]">{booking.service} · {booking.address} · {booking.phone}</p>
        </div>
        <button onClick={close} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f2f5f5]" aria-label="Close billing"><X className="size-4" /></button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-[#f7f8fa] p-4 text-xs text-[#607078]">
        <span>Visit fee <b className="text-[#173f4a]">{money(booking.visitFee)}</b> was prepaid by the customer — you earn <b className="text-[#388157]">{money(booking.visitProviderShare)}</b> of it. It is <b>not</b> part of this bill.</span>
        {bill && <span className="ml-auto"><BillStatusChip status={bill.status} /></span>}
      </div>

      {!canBill && <p className="mt-5 rounded-2xl bg-[#fff0be] p-4 text-sm font-semibold text-[#9d6e00]">Start the job first (status “In progress”) — then you can create the bill for the work.</p>}

      {locked && bill ? <div className="mt-6"><InvoiceView bill={bill} booking={booking} showEarning /></div> : canBill && <div className="mt-6 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div>
          <datalist id="kw-items">{[...catalog.map((item) => item.name), ...PRESETS.filter((p) => !catalog.some((item) => item.name.toLowerCase() === p.toLowerCase()))].map((name) => <option key={name} value={name} />)}</datalist>
          <div className={`mb-2 hidden gap-2 px-1 sm:grid ${grid}`}>{['Item / work', 'Type', 'Qty', 'Rate (₹)', 'GST %', 'Amount', ''].map((h) => <span key={h} className={label}>{h}</span>)}</div>
          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              const amount = Math.round(num(row.qty) * num(row.price) * 100) / 100
              return <div key={row.key} className={`grid gap-2 rounded-2xl border border-[#edf0f1] p-3 sm:items-center sm:border-0 sm:p-0 ${grid}`}>
                <label className={cell}>{mobileLabel('Item / work')}<input list="kw-items" value={row.name} onChange={(e) => rename(row.key, e.target.value)} placeholder="Type or pick an item" className={`${inputCls} w-full py-2.5`} /></label>
                <label className={cell}>{mobileLabel('Type')}<select value={row.kind} onChange={(e) => update(row.key, { kind: e.target.value as LineKind })} className={`${inputCls} w-full py-2.5`}><option value="material">Material</option><option value="labour">Labour</option><option value="other">Other</option></select></label>
                <label className={cell}>{mobileLabel('Qty')}<input type="number" min="0" step="any" inputMode="decimal" value={row.qty} onChange={(e) => update(row.key, { qty: e.target.value })} className={`${inputCls} w-full py-2.5`} /></label>
                <label className={cell}>{mobileLabel('Rate (₹)')}<input type="number" min="0" step="any" inputMode="decimal" value={row.price} onChange={(e) => update(row.key, { price: e.target.value })} placeholder="0" className={`${inputCls} w-full py-2.5`} /></label>
                <label className={cell}>{mobileLabel('GST %')}<select value={GST_RATES.includes(num(row.tax)) ? row.tax : '0'} onChange={(e) => update(row.key, { tax: e.target.value })} className={`${inputCls} w-full py-2.5`}>{GST_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
                <div className={cell}>{mobileLabel('Amount')}<span className="py-2 text-sm font-bold text-[#173f4a] sm:text-right">{money(amount)}</span></div>
                <button type="button" onClick={() => setRows((current) => current.length > 1 ? current.filter((r) => r.key !== row.key) : current)} className="flex size-9 items-center justify-center self-end rounded-full text-[#a24a4a] hover:bg-[#fbeeee] sm:self-center" aria-label="Remove line"><Trash2 className="size-4" /></button>
              </div>
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setRows((current) => [...current, blankRow('material')])} className={ghostBtn}><Plus className="mr-1 inline size-3.5" />Add item</button>
            <button type="button" onClick={() => setRows((current) => [...current, blankRow('labour', 'Labour charge')])} className={ghostBtn}><Plus className="mr-1 inline size-3.5" />Add labour</button>
          </div>
          <label className="mt-5 flex flex-col gap-2 text-sm font-semibold text-[#29434b]">Notes for the customer (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. 3 months warranty on the replaced part" className={`${inputCls} min-h-20`} /></label>
          <label className="mt-3 flex items-center gap-2 text-xs text-[#607078]"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[#397f68]" />Remember new items and rates in my catalogue for next time</label>
        </div>

        <aside className="h-fit rounded-2xl border border-[#e8edef] bg-[#f7f8fa] p-5 lg:sticky lg:top-0">
          <p className="text-sm font-bold text-[#173f4a]">Bill summary</p>
          <dl className="mt-3 flex flex-col gap-2 text-sm text-[#607078]">
            <div className="flex justify-between"><dt>Items & materials</dt><dd>{money(totals.materials)}</dd></div>
            <div className="flex justify-between"><dt>Labour</dt><dd>{money(totals.labour)}</dd></div>
            <div className="flex justify-between border-t border-[#e2e8e9] pt-2"><dt>Subtotal</dt><dd className="font-semibold">{money(totals.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>GST</dt><dd>{money(totals.tax)}</dd></div>
            <div className="flex justify-between"><dt>ProMajdoor service charge ({percent}%)</dt><dd>{money(totals.service)}</dd></div>
            <div className="mt-1 flex justify-between border-t-2 border-[#173f4a] pt-3 text-lg font-bold text-[#173f4a]"><dt>Customer pays</dt><dd>{money(totals.total)}</dd></div>
          </dl>
          <div className="mt-4 rounded-xl bg-[#e5f5ea] p-3 text-xs leading-5 text-[#388157]"><b>Your earning for this work: {money(totals.providerEarning)}</b><br />Items + labour + GST. The {percent}% service charge is added on top for ProMajdoor — it is not taken from you.</div>
          <div className="mt-5 flex flex-col gap-2">
            {bill?.status === 'sent'
              ? <button disabled={busy} onClick={() => save(true)} className="rounded-2xl bg-[#173f4a] py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Update bill'}</button>
              : <><button disabled={busy} onClick={() => save(true)} className="rounded-2xl bg-[#173f4a] py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Send bill to customer'}</button><button disabled={busy} onClick={() => save(false)} className="rounded-2xl border border-[#dce3e4] bg-white py-3 text-sm font-bold text-[#29434b] disabled:opacity-60">Save as draft</button></>}
            {bill?.status === 'draft' && <button disabled={busy} onClick={discard} className="py-2 text-xs font-bold text-[#a24a4a]">Delete draft</button>}
          </div>
          {bill?.status === 'sent' && <div className="mt-5 border-t border-[#e2e8e9] pt-4">
            <p className="text-xs font-bold text-[#173f4a]">Customer paid you directly?</p>
            <div className="mt-2 flex gap-2"><select value={method} onChange={(e) => setMethod(e.target.value)} className={`${inputCls} flex-1 py-2 text-xs`}>{PAYMENT_METHODS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><button disabled={busy} onClick={markPaid} className={solidBtn}>Mark paid</button></div>
            <p className="mt-2 text-[11px] leading-4 text-[#819096]">Money you collect yourself is settled against your earnings — ProMajdoor&apos;s share is deducted from your balance.</p>
          </div>}
        </aside>
      </div>}
    </div>
  </div>
}
