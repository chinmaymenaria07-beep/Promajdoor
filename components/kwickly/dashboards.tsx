'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, ChevronRight, FileText, Headphones, IndianRupee, MessageCircle, Plus, ShieldCheck, Siren, Star, UserRound, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import {
  DEFAULT_SETTINGS,
  PAYMENT_METHODS,
  STATUSES,
  average,
  billTotal,
  bookingEarnings,
  callRpc,
  detailValue,
  formatDay,
  formatWhen,
  helplineWhatsapp,
  isHttpUrl,
  isOpen,
  lastDays,
  methodLabel,
  money,
  providerLabel,
  providerLedger,
  round2,
  sameDay,
  statusInfo,
} from '@/lib/kwickly'
import type { Application, Bill, Booking, BookingStatus, Payout, Profile, ProviderItem, Role, Screen, ServiceRow, Settings } from '@/lib/kwickly'
import { Action, AlertRow, BarChart, DashboardShell, Empty, MiniFeature, Panel, Stars, Stat, StatusChip, Tabs, ghostBtn, inputCls, limeBtn, solidBtn } from './ui'
import { BillStatusChip, BillingEditor, BookingBillCard, InvoiceView } from './billing'
import { AdminEarnings, ProviderEarnings } from './earnings'
import { HelplineCard } from './helpline'
import { AdminServices } from './service-admin'

type Notify = (message: string) => void

function BookingTimeline({ booking }: { booking: Booking }) {
  if (booking.status === 'cancelled') {
    return <div><div className="flex items-start justify-between"><div><p className="font-bold text-[#29434b]">{booking.service}</p><p className="mt-1 text-xs text-[#819096]">{booking.code} · {formatWhen(booking.scheduledAt)}</p></div><StatusChip status={booking.status} /></div><p className="mt-6 rounded-2xl bg-[#f7f8fa] p-4 text-sm text-[#738288]">This booking was cancelled.</p></div>
  }
  const assigned = booking.status === 'assigned' || booking.status === 'in_progress' || booking.status === 'completed'
  const done = booking.status === 'completed'
  const dot = (on: boolean) => (on ? 'size-3 rounded-full bg-[#397f68] ring-4 ring-[#e5f5ea]' : 'size-3 rounded-full bg-[#dce3e4]')
  const line = (on: boolean) => `h-0.5 flex-1 ${on ? 'bg-[#397f68]' : 'bg-[#dce3e4]'}`
  return <div><div className="flex items-start justify-between"><div><p className="font-bold text-[#29434b]">{booking.service}</p><p className="mt-1 text-xs text-[#819096]">{booking.code} · {formatWhen(booking.scheduledAt)}</p></div><StatusChip status={booking.status} /></div><div className="mt-7 flex items-center"><span className={dot(true)} /><span className={line(assigned)} /><span className={dot(assigned)} /><span className={line(done)} /><span className={dot(done)} /></div><div className="mt-3 flex justify-between text-[10px] font-semibold text-[#819096]"><span>Booked</span><span>{booking.status === 'in_progress' ? 'In progress' : 'Pro assigned'}</span><span>Completed</span></div><div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#f7f8fa] p-4"><span className="flex size-10 items-center justify-center rounded-full bg-[#dceab2] text-xs font-bold text-[#173f4a]">{booking.providerName ? booking.providerName.slice(0, 2).toUpperCase() : '··'}</span><div><p className="text-sm font-bold text-[#29434b]">{providerLabel(booking)}</p><p className="text-xs text-[#819096]">{booking.providerName ? 'Verified service provider' : 'We are matching you with a verified pro'}</p></div></div></div>
}

function OrderRow({ booking, onOpen, showCustomer, actions }: { booking: Booking; onOpen: () => void; showCustomer?: boolean; actions?: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-[#edf0f1] p-4 lg:flex-row lg:items-center lg:justify-between"><button onClick={onOpen} className="text-left"><span className="flex items-center gap-2 font-bold text-[#29434b]">{booking.service}{booking.isFlash && <span className="flash-dot-badge inline-flex items-center gap-1 rounded-full bg-[#c0392b] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white"><Siren className="size-3" />Flash</span>}</span><span className="mt-1 block text-xs text-[#8a9a9e]">{booking.code} · {showCustomer ? `${booking.customerName || 'Customer'} · ` : ''}{booking.address} · {providerLabel(booking)}</span></button><div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">{actions}<div className="text-left lg:text-right"><p className="text-xs text-[#738288]">{formatWhen(booking.scheduledAt)}</p><span className="mt-1 block"><StatusChip status={booking.status} /></span></div><button onClick={onOpen} className="rounded-full border border-[#dce3e4] p-2" aria-label="Open details"><ChevronRight className="size-4" /></button></div></div>
}

function RatingForm({ booking, notify, reload }: { booking: Booking; notify: Notify; reload: () => Promise<void> }) {
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  if (booking.rating != null) {
    return <div><Stars value={booking.rating} />{booking.feedback && <p className="mt-2 text-sm text-[#607078]">{booking.feedback}</p>}</div>
  }

  const submit = async () => {
    if (rating < 1) { notify('Please choose a star rating'); return }
    setSaving(true)
    const error = await callRpc('customer_rate_booking', { p_booking: booking.rid, p_rating: rating, p_feedback: text })
    setSaving(false)
    if (error) { notify(error); return }
    notify('Thanks for your feedback')
    await reload()
  }

  return <div className="flex flex-col gap-3"><Stars value={rating} onChange={setRating} /><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Tell us how it went (optional)" className={`${inputCls} min-h-20`} /><button disabled={saving} onClick={submit} className={`${solidBtn} self-start`}>{saving ? 'Sending…' : 'Submit feedback'}</button></div>
}

/* ───────────────────────── booking details (all roles) ───────────────────────── */

function BookingDetailModal({ booking, bill, viewer, userId, providers, settings = DEFAULT_SETTINGS, notify, reload, close }: { booking: Booking; bill?: Bill; viewer: Role; userId: string; providers: Profile[]; settings?: Settings; notify: Notify; reload: () => Promise<void>; close: () => void }) {
  const [status, setStatus] = useState<BookingStatus>(booking.status)
  const [providerId, setProviderId] = useState(booking.providerId ?? '')
  const [busy, setBusy] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [payMethod, setPayMethod] = useState('upi')
  const closed = !isOpen(booking)

  const run = async (steps: Array<[string, Record<string, unknown>]>, success: string) => {
    setBusy(true)
    for (const [name, args] of steps) {
      const error = await callRpc(name, args)
      if (error) { notify(error); setBusy(false); await reload(); return }
    }
    notify(success)
    await reload()
    setBusy(false)
  }

  const saveAdmin = () => {
    const steps: Array<[string, Record<string, unknown>]> = []
    if (providerId !== (booking.providerId ?? '')) steps.push(['admin_assign_booking', { p_booking: booking.rid, p_provider: providerId || null }])
    if (status !== booking.status) steps.push(['admin_set_booking_status', { p_booking: booking.rid, p_status: status }])
    if (!steps.length) { notify('No changes to save'); return }
    run(steps, 'Booking updated')
  }

  const details: [string, string][] = [
    ['Booking', booking.code],
    ['Scheduled', formatWhen(booking.scheduledAt)],
    ['Address', booking.address],
    ['Phone', booking.phone],
    ...(viewer !== 'customer' ? ([['Customer', booking.customerName || '—']] as [string, string][]) : []),
    ['Provider', providerLabel(booking)],
    ['Visit fee (prepaid)', money(booking.visitFee)],
    ...(viewer !== 'customer' ? ([['Visit fee split', `Provider ${money(booking.visitProviderShare)} · ProMajdoor ${money(booking.visitPlatformShare)}`]] as [string, string][]) : []),
    ['Work bill', bill && bill.status !== 'draft' ? `${money(bill.total)} · ${bill.status === 'paid' ? 'paid' : 'awaiting payment'}` : bill ? 'Draft (not sent)' : 'Not billed yet'],
    ['Requested', formatWhen(booking.createdAt)],
  ]

  const providerOptions = providers.filter((p) => p.role === 'provider')
  const isAssignedProvider = viewer === 'provider' && booking.providerId === userId
  const started = booking.status === 'in_progress' || booking.status === 'completed'

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102f36]/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px] sm:p-8">
    <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8a9a9e]">Booking details</p><h2 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold text-[#173f4a]">{booking.service}{booking.isFlash && <span className="inline-flex items-center gap-1 rounded-full bg-[#c0392b] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white"><Siren className="size-3" />Flash · urgent</span>}</h2></div><button onClick={close} className="flex size-9 items-center justify-center rounded-full bg-[#f2f5f5]" aria-label="Close details"><X className="size-4" /></button></div>

    <div className="mt-6"><BookingTimeline booking={booking} /></div>

    <dl className="mt-6 grid gap-3 sm:grid-cols-2">{details.map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f7f8fa] p-3"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{label}</dt><dd className="mt-1 text-sm font-semibold text-[#29434b]">{value}</dd></div>)}</dl>
    {booking.details.length > 0 ? <div className="mt-3 rounded-2xl bg-[#f7f8fa] p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Service details</p><dl className="mt-2 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">{booking.details.map((d) => <div key={d.key} className={d.key === 'description' ? 'sm:col-span-2' : ''}><dt className="text-[11px] text-[#8a9a9e]">{d.label}</dt><dd className="whitespace-pre-wrap text-sm font-semibold text-[#29434b]">{detailValue(d)}</dd></div>)}</dl></div>
      : <div className="mt-3 rounded-2xl bg-[#f7f8fa] p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Issue described</p><p className="mt-1 whitespace-pre-wrap text-sm text-[#29434b]">{booking.description}</p></div>}
    {(booking.contactName || booking.altPhone || booking.mapsLink) && <div className="mt-3 rounded-2xl bg-[#f7f8fa] p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Contact for this booking</p><div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-[#29434b]">{booking.contactName && <span>{booking.contactName}</span>}<a href={`tel:+91${booking.phone.replace(/\D/g, '').slice(-10)}`} className="text-[#34788b] underline">{booking.phone}</a>{booking.altPhone && <a href={`tel:+91${booking.altPhone}`} className="text-[#34788b] underline">{booking.altPhone} (alternate)</a>}{booking.mapsLink && isHttpUrl(booking.mapsLink) && <a href={booking.mapsLink} target="_blank" rel="noopener noreferrer" className="text-[#34788b] underline">Open location on map</a>}</div></div>}

    {booking.rating != null && <div className="mt-3 rounded-2xl bg-[#f7f8fa] p-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Customer feedback</p><div className="mt-2"><Stars value={booking.rating} /></div>{booking.feedback && <p className="mt-2 text-sm text-[#29434b]">{booking.feedback}</p>}</div>}

    {viewer === 'customer' && <div className="mt-6">
      {bill && bill.status !== 'draft' ? <>
        <p className="mb-3 text-sm font-bold text-[#173f4a]">Your bill</p>
        <InvoiceView bill={bill} booking={booking} />
        {bill.status === 'sent' && <p className="mt-3 rounded-2xl bg-[#fff0be] p-4 text-sm leading-6 text-[#9d6e00]">Please pay <b>{money(bill.total)}</b> to your pro (cash or UPI). Once they confirm the payment, this bill turns to Paid.</p>}
      </> : started && <p className="rounded-2xl bg-[#f7f8fa] p-4 text-sm leading-6 text-[#738288]">Your pro will send an itemised bill for the work here. The visit fee you already paid is not charged again.</p>}
    </div>}

    {viewer === 'admin' && bill && <div className="mt-6">
      <p className="mb-3 text-sm font-bold text-[#173f4a]">Bill</p>
      <InvoiceView bill={bill} booking={booking} showEarning />
      {bill.status === 'sent' && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e8edef] p-3"><span className="text-xs font-bold text-[#29434b]">Payment received by ProMajdoor?</span><select value={payMethod} onChange={(event) => setPayMethod(event.target.value)} className={`${inputCls} py-2 text-xs`}>{PAYMENT_METHODS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><button disabled={busy} onClick={() => run([['mark_bill_paid', { p_booking: booking.rid, p_method: payMethod }]], 'Payment recorded')} className={solidBtn}>Mark as paid</button></div>}
    </div>}

    {viewer === 'admin' && <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#e8edef] p-4">
      <p className="text-sm font-bold text-[#173f4a]">Manage this request</p>
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#29434b]">Assigned provider<select value={providerId} disabled={closed || busy} onChange={(event) => setProviderId(event.target.value)} className={inputCls}><option value="">Unassigned</option>{providerOptions.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}{p.available ? '' : ' (unavailable)'}</option>)}{providerId && !providerOptions.some((p) => p.id === providerId) && <option value={providerId}>{booking.providerName ?? 'Current provider'}</option>}</select></label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#29434b]">Status<select value={status} disabled={busy} onChange={(event) => setStatus(event.target.value as BookingStatus)} className={inputCls}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      {closed && <p className="text-xs text-[#819096]">This booking is closed. Change its status to reopen it before reassigning a provider.</p>}
      <button disabled={busy} onClick={saveAdmin} className="rounded-2xl bg-[#173f4a] py-3.5 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button>
    </div>}

    {isAssignedProvider && <div className="mt-6 rounded-2xl border border-[#b8ce64] bg-[#fbfdf1] p-4">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-[#173f4a]">Billing</p>{bill && <BillStatusChip status={bill.status} />}</div>
      <p className="mt-2 text-xs leading-5 text-[#738288]">The {money(booking.visitFee)} visit fee is prepaid — you earn {money(booking.visitProviderShare)} of it. Bill the customer for the work (items, labour, GST); ProMajdoor adds its {bill && bill.status !== 'draft' ? bill.service_charge_percent : settings.service_charge_percent}% service charge on top.</p>
      {bill && <p className="mt-2 text-sm font-semibold text-[#29434b]">Customer total {money(bill.total)} · Your earning {money(bill.provider_earning)}</p>}
      <button onClick={() => setBillingOpen(true)} className={`${solidBtn} mt-3`}>{bill ? (bill.status === 'paid' ? 'View bill' : bill.status === 'sent' ? 'Open billing' : 'Continue draft') : 'Create bill'}</button>
      {!started && <p className="mt-2 text-xs text-[#9d6e00]">Start the job first to create the bill.</p>}
    </div>}

    {isAssignedProvider && <div className="mt-4 rounded-2xl border border-[#e8edef] p-4">
      <p className="text-sm font-bold text-[#173f4a]">Update job status</p>
      <div className="mt-3 grid grid-cols-3 gap-2">{(['assigned', 'in_progress', 'completed'] as BookingStatus[]).map((s) => <button key={s} disabled={busy || closed || s === booking.status} onClick={() => run([['provider_set_booking_status', { p_booking: booking.rid, p_status: s }]], 'Status updated')} className={`rounded-xl border px-2 py-3 text-xs font-bold disabled:opacity-60 ${s === booking.status ? 'border-[#173f4a] bg-[#173f4a] text-white' : 'border-[#dce3e4] text-[#40525a]'}`}>{statusInfo(s).label}</button>)}</div>
      {closed && <p className="mt-3 text-xs text-[#819096]">This job is closed. Ask an admin if it needs to change.</p>}
    </div>}

    {viewer === 'customer' && <div className="mt-6 flex flex-col gap-4">
      {booking.status === 'completed' && booking.rating == null && <div className="rounded-2xl border border-[#e8edef] p-4"><p className="mb-3 text-sm font-bold text-[#173f4a]">How was the service?</p><RatingForm booking={booking} notify={notify} reload={reload} /></div>}
      {(booking.status === 'awaiting_assignment' || booking.status === 'assigned') && <button disabled={busy} onClick={() => { if (window.confirm('Cancel this booking?')) run([['customer_cancel_booking', { p_booking: booking.rid }]], 'Booking cancelled') }} className="rounded-2xl border border-[#e7c5c5] py-3.5 text-sm font-bold text-[#a24a4a] disabled:opacity-60">Cancel booking</button>}
    </div>}

    <div className="mt-6"><HelplineCard compact title="Questions about this booking?" message={`Hi ProMajdoor, regarding booking ${booking.code} (${booking.service}).`} /></div>
  </div>
  {billingOpen && <BillingEditor key={`${bill?.id ?? 'new'}-${bill?.updated_at ?? ''}`} booking={booking} bill={bill} settings={settings} notify={notify} reload={reload} close={() => setBillingOpen(false)} />}
  </div>
}

/* ───────────────────────── customer ───────────────────────── */

type CustomerTab = 'overview' | 'bookings' | 'bills' | 'feedback' | 'help'

const faqs: [string, string][] = [
  ['How does a booking work?', 'Pick a service, tell us what needs attention and choose a time. Our team assigns a verified pro and you can follow every step here.'],
  ['When do I pay?', 'The visit fee is paid up front when you book. After inspecting the job, your pro sends an itemised bill (materials, labour, GST and ProMajdoor’s service charge). You will find it in My bills and on the booking itself. The visit fee is never charged twice.'],
  ['Can I cancel?', 'Yes. Open the booking and choose Cancel booking. Once work has started, cancellation is handled by our team.'],
  ['How do I rate a pro?', 'When a booking is completed, open it (or use Give feedback) and leave a star rating.'],
]

export function CustomerDashboard({ name, userId, bookings, bills, go, openBooking, notify, reload }: { name: string; userId: string; bookings: Booking[]; bills: Bill[]; go: (screen: Screen) => void; openBooking: (service?: string) => void; notify: Notify; reload: () => Promise<void> }) {
  const mine = useMemo(() => bookings.filter((b) => b.customerId === userId), [bookings, userId])
  const billMap = useMemo(() => new Map(bills.map((bill) => [bill.booking_id, bill])), [bills])
  const [tab, setTab] = useState<CustomerTab>('overview')
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all')
  const [openId, setOpenId] = useState<number | null>(null)
  const opened = mine.find((b) => b.rid === openId)
  const current = mine.find(isOpen) ?? mine[0]
  const active = mine.filter(isOpen).length
  const completed = mine.filter((b) => b.status === 'completed')
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL

  const listed = mine.filter((b) => filter === 'all' || (filter === 'active' ? isOpen(b) : b.status === filter))
  const billable = mine.filter((b) => b.status !== 'cancelled')
  const unpaid = mine.filter((b) => b.status !== 'cancelled' && billMap.get(b.rid)?.status === 'sent')
  const unpaidAmount = round2(unpaid.reduce((sum, b) => sum + (billMap.get(b.rid)?.total ?? 0), 0))

  return <DashboardShell eyebrow="Customer dashboard" title={name ? `Welcome back, ${name}.` : 'Welcome back.'} subtitle="Everything you need to keep home moving, in one place." actions={<button onClick={() => openBooking('')} className={limeBtn}>Book a service <Plus className="ml-1 inline size-4" /></button>}>
    <Tabs<CustomerTab> tabs={[{ id: 'overview', label: 'Overview' }, { id: 'bookings', label: 'My bookings', badge: active }, { id: 'bills', label: 'My bills', badge: unpaid.length }, { id: 'feedback', label: 'Feedback' }, { id: 'help', label: 'Help' }]} value={tab} onChange={setTab} />

    {tab === 'overview' && <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><Stat label="Active bookings" value={String(active).padStart(2, '0')} /><Stat label="Completed jobs" value={String(completed.length).padStart(2, '0')} /><Stat label="Bills to pay" value={money(unpaidAmount)} /></div>
      {unpaid.length > 0 && <div className="mt-4"><AlertRow icon={FileText} text={`${unpaid.length} bill${unpaid.length === 1 ? '' : 's'} waiting for payment (${money(unpaidAmount)})`} onClick={() => setTab('bills')} /></div>}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <div><Panel title={current && isOpen(current) ? 'Your active booking' : 'Latest booking'} action={current && <button onClick={() => setOpenId(current.rid)} className="text-xs font-bold text-[#557179]">View details</button>}>{current ? <BookingTimeline booking={current} /> : <p className="text-sm text-[#819096]">No bookings yet. Pick a service on the home page to get started.</p>}</Panel></div>
        <Panel title="Quick actions"><div className="grid grid-cols-2 gap-3"><Action icon={CalendarDays} text="My bookings" onClick={() => setTab('bookings')} /><Action icon={FileText} text="My bills" onClick={() => setTab('bills')} /><Action icon={Headphones} text="Get help" onClick={() => setTab('help')} /><Action icon={Star} text="Give feedback" onClick={() => setTab('feedback')} /><Action icon={UserRound} text="My profile" onClick={() => go('profile')} /><Action icon={MessageCircle} text="WhatsApp helpline" onClick={() => window.open(helplineWhatsapp('Hi ProMajdoor, I need help.'), '_blank', 'noopener')} /></div></Panel>
      </div>
      <Panel title="Recent orders" action={<button onClick={() => setTab('bookings')} className="text-xs font-bold text-[#557179]">View all</button>}>{mine.length ? <div className="flex flex-col gap-3">{mine.slice(0, 5).map((b) => <OrderRow key={b.rid} booking={b} onOpen={() => setOpenId(b.rid)} />)}</div> : <Empty text="Your bookings will appear here." />}</Panel>
    </>}

    {tab === 'bookings' && <Panel title="My bookings" action={<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className={`${inputCls} py-2 text-xs`}><option value="all">All</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>}>{listed.length ? <div className="flex flex-col gap-3">{listed.map((b) => <OrderRow key={b.rid} booking={b} onOpen={() => setOpenId(b.rid)} />)}</div> : <Empty text="No bookings match this filter." />}</Panel>}

    {tab === 'bills' && <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><Stat label="Total billed" value={money(billable.reduce((sum, b) => sum + billTotal(b, billMap.get(b.rid)), 0))} /><Stat label="Waiting for payment" value={money(unpaidAmount)} /><Stat label="Completed jobs value" value={money(completed.reduce((sum, b) => sum + billTotal(b, billMap.get(b.rid)), 0))} /></div>
      <Panel title="My bills">{billable.length ? <div className="flex flex-col gap-3">{billable.map((b) => <BookingBillCard key={b.rid} booking={b} bill={billMap.get(b.rid)} who={b.providerName ?? undefined} />)}</div> : <Empty text="No bills yet." />}</Panel>
    </>}

    {tab === 'feedback' && <Panel title="Give feedback">{completed.length ? <div className="flex flex-col gap-4">{completed.map((b) => <div key={b.rid} className="rounded-2xl border border-[#edf0f1] p-4"><p className="font-bold text-[#29434b]">{b.service}</p><p className="mb-3 mt-1 text-xs text-[#8a9a9e]">{b.code} · {providerLabel(b)} · {formatDay(b.scheduledAt)}</p><RatingForm booking={b} notify={notify} reload={reload} /></div>)}</div> : <Empty text="Once a booking is completed you can rate it here." />}</Panel>}

    {tab === 'help' && <Panel title="Get help"><HelplineCard /><div className="mt-4 flex flex-col gap-3">{faqs.map(([question, answer]) => <details key={question} className="rounded-2xl border border-[#edf0f1] p-4"><summary className="cursor-pointer text-sm font-bold text-[#29434b]">{question}</summary><p className="mt-2 text-sm leading-6 text-[#738288]">{answer}</p></details>)}</div>{supportEmail ? <a href={`mailto:${supportEmail}`} className={`${solidBtn} mt-5 inline-block`}>Email support</a> : <p className="mt-5 text-xs text-[#819096]">Need more help? Open the booking in question and our team will see its status and notes.</p>}</Panel>}

    <button onClick={() => go('home')} className="mt-6 text-sm font-bold text-[#557179]">← Back to ProMajdoor home</button>
    {opened && <BookingDetailModal key={`${opened.rid}-${opened.updatedAt}`} booking={opened} bill={billMap.get(opened.rid)} viewer="customer" userId={userId} providers={[]} notify={notify} reload={reload} close={() => setOpenId(null)} />}
  </DashboardShell>
}

/* ───────────────────────── provider ───────────────────────── */

type ProviderTab = 'jobs' | 'earnings' | 'bills' | 'profile'

function ItemCatalogue({ notify }: { notify: Notify }) {
  const [items, setItems] = useState<ProviderItem[]>([])
  const [form, setForm] = useState({ name: '', kind: 'material', price: '', tax: '0' })
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('provider_items').select('*').order('name')
    setItems((data ?? []) as ProviderItem[])
  }, [])
  useEffect(() => { load() }, [load])

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const error = await callRpc('provider_save_item', { p_name: form.name, p_kind: form.kind, p_price: Number(form.price), p_tax: Number(form.tax) })
    setBusy(false)
    notify(error ?? 'Saved to your catalogue')
    if (!error) { setForm({ name: '', kind: 'material', price: '', tax: '0' }); await load() }
  }
  const remove = async (item: ProviderItem) => {
    const { error } = await supabase.from('provider_items').delete().eq('id', item.id)
    notify(error ? error.message : 'Removed')
    await load()
  }

  return <Panel title="My item catalogue">
    <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1.6fr_.8fr_.7fr_.6fr_auto]">
      <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Item or work (e.g. 6A switch)" className={inputCls} />
      <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputCls}><option value="material">Material</option><option value="labour">Labour</option><option value="other">Other</option></select>
      <input required type="number" min={0} step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Rate ₹" className={inputCls} />
      <select value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} className={inputCls}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}% GST</option>)}</select>
      <button disabled={busy} className={solidBtn}>Save</button>
    </form>
    <p className="mt-2 text-xs text-[#819096]">Saved items autocomplete in the billing screen with their rate and GST filled in. New items you bill are saved here automatically.</p>
    <div className="mt-4">{items.length ? <div className="flex flex-col gap-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-[#f7f8fa] p-3 text-sm"><span><b className="text-[#29434b]">{item.name}</b><span className="ml-2 text-xs capitalize text-[#8a9a9e]">{item.kind} · GST {item.tax_percent}%</span></span><span className="flex items-center gap-3"><b className="text-[#173f4a]">{money(item.unit_price)}</b><button onClick={() => remove(item)} className="text-xs font-bold text-[#a24a4a]">Remove</button></span></div>)}</div> : <Empty text="No saved items yet." />}</div>
  </Panel>
}

function ProviderProfile({ userId }: { userId: string }) {
  const [app, setApp] = useState<Application | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    supabase.from('provider_applications').select('*').eq('user_id', userId).eq('status', 'approved').order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => { setApp((data as Application | null) ?? null); setLoaded(true) })
  }, [userId])
  if (!loaded) return <Panel title="Your profile"><Empty text="Loading…" /></Panel>
  if (!app) return <Panel title="Your profile"><Empty text="No application details found for this account." /></Panel>
  const last4 = (value: string | null) => (value ? `•••• ${value.slice(-4)}` : '—')
  const rows: [string, string][] = [
    ['Name', app.full_name], ['Phone', app.phone], ['Email', app.email], ['City', app.city], ['Service', app.service], ['Experience', app.years_experience != null ? `${app.years_experience} years` : '—'],
    ['Business', app.business_name ?? '—'], ['Business type', app.business_type ?? '—'], ['Business address', app.business_address ?? '—'], ['GSTIN', app.gst_number ?? '—'],
    ['ID proof', app.id_proof_type ? `${app.id_proof_type} ${last4(app.id_proof_number)}` : '—'], ['Business proof', app.business_proof_type ?? '—'],
    ['Payout account', app.bank_account ? `${app.bank_holder} · ${last4(app.bank_account)} · ${app.bank_ifsc}` : '—'], ['UPI', app.upi_id ?? '—'],
  ]
  return <Panel title="Your profile" action={<span className="rounded-full bg-[#e5f5ea] px-3 py-1 text-[10px] font-bold text-[#388157]">Verified{app.reviewed_at ? ` · ${formatDay(app.reviewed_at)}` : ''}</span>}>
    <dl className="grid gap-3 sm:grid-cols-2">{rows.map(([k, v]) => <div key={k} className="rounded-2xl bg-[#f7f8fa] p-3"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{k}</dt><dd className="mt-1 break-words text-sm font-semibold text-[#29434b]">{v}</dd></div>)}</dl>
    <p className="mt-4 text-xs leading-5 text-[#819096]">Your business name and GSTIN appear on the bills you send. To change verified details or payout account, contact the ProMajdoor team.</p>
  </Panel>
}

export function ProviderDashboard({ userId, bookings, bills, payouts, settings, available, onAvailability, go, notify, reload }: { userId: string; bookings: Booking[]; bills: Bill[]; payouts: Payout[]; settings: Settings; available: boolean; onAvailability: (next: boolean) => Promise<void>; go: (screen: Screen) => void; notify: Notify; reload: () => Promise<void> }) {
  const jobs = useMemo(() => bookings.filter((b) => b.providerId === userId), [bookings, userId])
  const billMap = useMemo(() => new Map(bills.map((bill) => [bill.booking_id, bill])), [bills])
  const [tab, setTab] = useState<ProviderTab>('jobs')
  const [filter, setFilter] = useState<'all' | BookingStatus>('all')
  const [openId, setOpenId] = useState<number | null>(null)
  const [billingId, setBillingId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const opened = jobs.find((b) => b.rid === openId)
  const billing = jobs.find((b) => b.rid === billingId)

  const now = new Date()
  const doneJobs = jobs.filter((b) => b.status === 'completed')
  const doneThisMonth = doneJobs.filter((b) => b.completedAt && new Date(b.completedAt).getMonth() === now.getMonth() && new Date(b.completedAt).getFullYear() === now.getFullYear())
  const earnedThisMonth = round2(doneThisMonth.reduce((sum, b) => sum + bookingEarnings(b, billMap.get(b.rid)).provider, 0))
  const rating = average(doneJobs.map((b) => b.rating))
  const days = lastDays(7)
  const chart = days.map((day) => doneJobs.filter((b) => sameDay(b.completedAt, day)).length)
  const listed = jobs.filter((b) => filter === 'all' || b.status === filter).sort((a, b) => Number(b.isFlash && isOpen(b)) - Number(a.isFlash && isOpen(a)))
  const billable = jobs.filter((b) => b.status === 'in_progress' || b.status === 'completed')
  const needsBill = billable.filter((b) => { const bill = billMap.get(b.rid); return !bill || bill.status === 'draft' })

  const advance = async (booking: Booking, next: BookingStatus) => {
    setBusyId(booking.rid)
    const error = await callRpc('provider_set_booking_status', { p_booking: booking.rid, p_status: next })
    setBusyId(null)
    if (error) notify(error)
    else notify(next === 'completed' ? 'Job marked as completed' : 'Job started — you can now create the bill')
    await reload()
  }

  const rowActions = (b: Booking) => <>
    {b.status === 'assigned' && <button disabled={busyId === b.rid} onClick={() => advance(b, 'in_progress')} className={solidBtn}>Start job</button>}
    {(b.status === 'in_progress' || b.status === 'completed') && <button onClick={() => setBillingId(b.rid)} className={b.status === 'in_progress' ? ghostBtn : solidBtn}><IndianRupee className="mr-1 inline size-3" />{billMap.get(b.rid) ? 'Billing' : 'Create bill'}</button>}
    {b.status === 'in_progress' && <button disabled={busyId === b.rid} onClick={() => advance(b, 'completed')} className={solidBtn}>Mark completed</button>}
  </>

  return <DashboardShell eyebrow="Provider workspace" title="Your work, in one place." subtitle="See the jobs assigned to you, bill customers and track what you earn." actions={<button onClick={() => onAvailability(!available)} className={limeBtn}>{available ? 'Available for work' : 'Not available'} <span className={`ml-2 inline-block size-2 rounded-full ${available ? 'bg-[#397f68]' : 'bg-[#8a9a9e]'}`} /></button>}>
    <Tabs<ProviderTab> tabs={[{ id: 'jobs', label: 'My jobs', badge: jobs.filter(isOpen).length }, { id: 'earnings', label: 'Earnings' }, { id: 'bills', label: 'Bills', badge: needsBill.length }, { id: 'profile', label: 'Profile' }]} value={tab} onChange={setTab} />

    {tab === 'jobs' && <>
      <div className="mt-6 grid gap-4 sm:grid-cols-4"><Stat label="Open jobs" value={String(jobs.filter(isOpen).length).padStart(2, '0')} /><Stat label="Done this month" value={String(doneThisMonth.length).padStart(2, '0')} /><Stat label="Earned this month" value={money(earnedThisMonth)} /><Stat label="Average rating" value={rating != null ? rating.toFixed(1) : '—'} /></div>
      {needsBill.length > 0 && <div className="mt-4"><AlertRow icon={FileText} text={`${needsBill.length} job${needsBill.length === 1 ? '' : 's'} still need a bill for the customer`} onClick={() => setTab('bills')} /></div>}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <Panel title="Assigned to you" action={<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className={`${inputCls} py-2 text-xs`}><option value="all">All</option>{STATUSES.filter((s) => s.value !== 'awaiting_assignment' && s.value !== 'cancelled').map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}>{listed.length ? <div className="flex flex-col gap-3">{listed.map((b) => <OrderRow key={b.rid} booking={b} showCustomer onOpen={() => setOpenId(b.rid)} actions={rowActions(b)} />)}</div> : <Empty text={jobs.length ? 'No jobs match this filter.' : 'No jobs assigned yet. The ProMajdoor team will assign requests to you.'} />}</Panel>
        <Panel title="Last 7 days"><div className="flex items-end gap-2"><span className="text-4xl font-semibold text-[#173f4a]">{doneThisMonth.length}</span><span className="pb-1 text-sm text-[#738288]">jobs this month</span></div><p className="mb-6 mt-1 text-xs text-[#819096]">Tap a customer to open the job and the billing section.</p><BarChart values={chart} labels={days.map((d) => d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2))} /><p className="mt-3 text-xs text-[#819096]">Jobs completed per day</p></Panel>
      </div>
    </>}

    {tab === 'earnings' && <ProviderEarnings userId={userId} bookings={bookings} bills={bills} payouts={payouts} settings={settings} />}

    {tab === 'bills' && <>
      <Panel title="Customer bills" action={<span className="text-xs text-[#819096]">{billable.length} billable job{billable.length === 1 ? '' : 's'}</span>}>
        {billable.length ? <div className="flex flex-col gap-3">{billable.map((b) => <div key={b.rid}><BookingBillCard booking={b} bill={billMap.get(b.rid)} who={b.customerName || 'Customer'} showEarning /><div className="mt-2 flex justify-end"><button onClick={() => setBillingId(b.rid)} className={solidBtn}>{billMap.get(b.rid) ? (billMap.get(b.rid)?.status === 'paid' ? 'View bill' : 'Open billing') : 'Create bill'}</button></div></div>)}</div> : <Empty text="Start a job to create its bill. Bills for completed work will be listed here." />}
      </Panel>
      <ItemCatalogue notify={notify} />
    </>}

    {tab === 'profile' && <><div className="mt-6"><button onClick={() => go('profile')} className={solidBtn}><UserRound className="mr-1.5 inline size-3.5" />Edit my name, mobile, address & photo</button></div><ProviderProfile userId={userId} /></>}

    <div className="mt-6"><HelplineCard compact title="Questions about a job, bill or payout?" message="Hi ProMajdoor, I'm a service provider and need help." /></div>

    <button onClick={() => go('home')} className="mt-6 text-sm font-bold text-[#557179]">← Back to ProMajdoor home</button>
    {opened && <BookingDetailModal key={`${opened.rid}-${opened.updatedAt}`} booking={opened} bill={billMap.get(opened.rid)} viewer="provider" userId={userId} providers={[]} settings={settings} notify={notify} reload={reload} close={() => setOpenId(null)} />}
    {billing && <BillingEditor key={`${billing.rid}-${billMap.get(billing.rid)?.id ?? 'new'}-${billMap.get(billing.rid)?.updated_at ?? ''}`} booking={billing} bill={billMap.get(billing.rid)} settings={settings} notify={notify} reload={reload} close={() => setBillingId(null)} />}
  </DashboardShell>
}

/* ───────────────────────── admin ───────────────────────── */

type AdminTab = 'overview' | 'orders' | 'people' | 'applications' | 'earnings' | 'services' | 'reports' | 'quality'
type OrdersFilter = { q: string; status: string; provider: string; flash: boolean }

type AdminCtx = {
  bookings: Booking[]
  bills: Bill[]
  payouts: Payout[]
  settings: Settings
  profiles: Profile[]
  applications: Application[]
  providers: Profile[]
  services: ServiceRow[]
  notify: Notify
  reload: () => Promise<void>
  loadPeople: () => Promise<void>
  reloadServices: () => Promise<void>
  reloadSettings: () => Promise<void>
  openOrder: (rid: number) => void
  setTab: (tab: AdminTab) => void
  jumpToOrders: (status: string, flash?: boolean) => void
}

function QuickAssign({ booking, ctx }: { booking: Booking; ctx: AdminCtx }) {
  const [busy, setBusy] = useState(false)
  const known = ctx.providers.some((p) => p.id === booking.providerId)
  return <select disabled={busy || !isOpen(booking)} value={booking.providerId ?? ''} aria-label="Assign provider" onChange={async (event) => {
    setBusy(true)
    const error = await callRpc('admin_assign_booking', { p_booking: booking.rid, p_provider: event.target.value || null })
    setBusy(false)
    ctx.notify(error ?? (event.target.value ? 'Provider assigned' : 'Provider removed'))
    await ctx.reload()
  }} className={`${inputCls} py-2 text-xs`}><option value="">{booking.providerId ? 'Unassign' : 'Assign provider…'}</option>{ctx.providers.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}{p.available ? '' : ' (unavailable)'}</option>)}{booking.providerId && !known && <option value={booking.providerId}>{booking.providerName ?? 'Current provider'}</option>}</select>
}

function QuickStatus({ booking, ctx }: { booking: Booking; ctx: AdminCtx }) {
  const [busy, setBusy] = useState(false)
  return <select disabled={busy} value={booking.status} aria-label="Change status" onChange={async (event) => {
    setBusy(true)
    const error = await callRpc('admin_set_booking_status', { p_booking: booking.rid, p_status: event.target.value })
    setBusy(false)
    ctx.notify(error ?? 'Status updated')
    await ctx.reload()
  }} className={`${inputCls} py-2 text-xs`}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
}

function AdminOverview({ ctx }: { ctx: AdminCtx }) {
  const { bookings, profiles, applications, bills } = ctx
  const billMap = new Map(bills.map((bill) => [bill.booking_id, bill]))
  const today = new Date()
  const incomeToday = round2(bookings.filter((b) => b.status === 'completed' && sameDay(b.completedAt, today)).reduce((sum, b) => sum + bookingEarnings(b, billMap.get(b.rid)).platform, 0))
  const rating = average(bookings.map((b) => b.rating))
  const pending = applications.filter((a) => a.status === 'pending').length
  const awaiting = bookings.filter((b) => b.status === 'awaiting_assignment').length
  const cancelled = bookings.filter((b) => b.status === 'cancelled').length
  const unpaid = bills.filter((b) => b.status === 'sent')
  const flashOpen = bookings.filter((b) => b.isFlash && b.status === 'awaiting_assignment').length
  return <>
    <div className="mt-6 grid gap-4 sm:grid-cols-4"><Stat label="ProMajdoor income today" value={money(incomeToday)} /><Stat label="Live orders" value={String(bookings.filter(isOpen).length)} /><Stat label="Providers" value={String(profiles.filter((p) => p.role === 'provider').length)} /><Stat label="Avg rating" value={rating != null ? `${rating.toFixed(1)}/5` : '—'} /></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
      <div><Panel title="Recent orders" action={<button onClick={() => ctx.setTab('orders')} className={ghostBtn}>View all</button>}>{bookings.length ? <div className="flex flex-col gap-3">{bookings.slice(0, 5).map((b) => <OrderRow key={b.rid} booking={b} showCustomer onOpen={() => ctx.openOrder(b.rid)} />)}</div> : <Empty text="No orders yet." />}</Panel></div>
      <Panel title="Needs your attention"><div className="flex flex-col gap-3">{flashOpen > 0 && <AlertRow icon={Siren} text={`${flashOpen} flash request${flashOpen === 1 ? '' : 's'} need urgent review`} onClick={() => ctx.jumpToOrders('awaiting_assignment', true)} />}<AlertRow icon={Users} text={`${pending} provider application${pending === 1 ? '' : 's'} to review`} onClick={() => ctx.setTab('applications')} /><AlertRow icon={FileText} text={`${awaiting} order${awaiting === 1 ? '' : 's'} awaiting a provider`} onClick={() => ctx.jumpToOrders('awaiting_assignment')} /><AlertRow icon={IndianRupee} text={`${unpaid.length} customer bill${unpaid.length === 1 ? '' : 's'} unpaid (${money(unpaid.reduce((sum, b) => sum + b.total, 0))})`} onClick={() => ctx.setTab('earnings')} /><AlertRow icon={Star} text={`${cancelled} cancelled order${cancelled === 1 ? '' : 's'}`} onClick={() => ctx.jumpToOrders('cancelled')} /></div></Panel>
    </div>
    <div className="mt-6 grid gap-5 sm:grid-cols-4"><MiniFeature icon={Users} label="Manage providers" onClick={() => ctx.setTab('people')} /><MiniFeature icon={IndianRupee} label="Earnings & payouts" onClick={() => ctx.setTab('earnings')} /><MiniFeature icon={BarChart3} label="Revenue reports" onClick={() => ctx.setTab('reports')} /><MiniFeature icon={ShieldCheck} label="Quality & safety" onClick={() => ctx.setTab('quality')} /></div>
  </>
}

function AdminOrders({ ctx, filter, setFilter }: { ctx: AdminCtx; filter: OrdersFilter; setFilter: (filter: OrdersFilter) => void }) {
  const query = filter.q.trim().toLowerCase()
  const listed = ctx.bookings.filter((b) =>
    (!filter.flash || b.isFlash) &&
    (filter.status === 'all' || b.status === filter.status) &&
    (filter.provider === 'all' || (filter.provider === 'none' ? !b.providerId : b.providerId === filter.provider)) &&
    (query === '' || [b.code, b.service, b.customerName, b.address, b.providerName ?? ''].join(' ').toLowerCase().includes(query))).sort((a, b) => Number(b.isFlash && isOpen(b)) - Number(a.isFlash && isOpen(a)))
  return <Panel title={`All orders (${listed.length})`}>
    <div className="mb-5 grid gap-3 sm:grid-cols-4"><input value={filter.q} onChange={(event) => setFilter({ ...filter, q: event.target.value })} placeholder="Search order, customer, address…" className={inputCls} /><select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })} className={inputCls}><option value="all">All statuses</option>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select><select value={filter.provider} onChange={(event) => setFilter({ ...filter, provider: event.target.value })} className={inputCls}><option value="all">All providers</option><option value="none">Unassigned</option>{ctx.providers.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select><label className="flex items-center gap-2 rounded-2xl border border-[#f2b8b0] bg-[#fff5f3] px-4 py-3 text-sm font-bold text-[#8a1f17]"><input type="checkbox" checked={filter.flash} onChange={(event) => setFilter({ ...filter, flash: event.target.checked })} className="size-4 accent-[#c0392b]" />⚡ Flash only</label></div>
    {listed.length ? <div className="flex flex-col gap-3">{listed.map((b) => <OrderRow key={b.rid} booking={b} showCustomer onOpen={() => ctx.openOrder(b.rid)} actions={<div className="flex flex-wrap gap-2"><QuickAssign booking={b} ctx={ctx} /><QuickStatus booking={b} ctx={ctx} /></div>} />)}</div> : <Empty text="No orders match these filters." />}
  </Panel>
}

function PersonRow({ person, ctx, expanded, onToggle }: { person: Profile; ctx: AdminCtx; expanded: boolean; onToggle: () => void }) {
  const [busy, setBusy] = useState(false)
  const isProvider = person.role === 'provider'
  const mine = ctx.bookings.filter((b) => (isProvider ? b.providerId === person.id : b.customerId === person.id))
  const done = mine.filter((b) => b.status === 'completed')
  const rating = average(done.map((b) => b.rating))
  const application = ctx.applications.find((a) => a.user_id === person.id && a.status === 'approved') ?? ctx.applications.find((a) => a.user_id === person.id)
  const phone = (isProvider ? application?.phone : undefined) ?? mine[0]?.phone ?? application?.phone ?? '—'
  const roleTone = person.role === 'admin' ? 'bg-[#ebe3fa] text-[#7655a5]' : isProvider ? 'bg-[#e5f5ea] text-[#388157]' : 'bg-[#f0f2f3] text-[#738288]'
  const billMap = new Map(ctx.bills.map((bill) => [bill.booking_id, bill]))
  const ledger = isProvider ? providerLedger(person.id, ctx.bookings, ctx.bills, ctx.payouts) : null
  const summary = isProvider
    ? `${mine.length} job${mine.length === 1 ? '' : 's'} · ${done.length} done${rating != null ? ` · ${rating.toFixed(1)}★` : ''} · ${money(ledger?.earned ?? 0)} earned`
    : `${mine.length} booking${mine.length === 1 ? '' : 's'} · ${money(mine.filter((b) => b.status !== 'cancelled').reduce((sum, b) => sum + billTotal(b, billMap.get(b.rid)), 0))} billed`

  const changeRole = async (next: 'customer' | 'provider') => {
    if (!window.confirm(next === 'provider' ? `Make ${person.full_name || person.email} a provider?` : `Remove provider access for ${person.full_name || person.email}? Their open jobs return to "Awaiting assignment".`)) return
    setBusy(true)
    const error = await callRpc('admin_set_role', { p_user: person.id, p_role: next })
    setBusy(false)
    ctx.notify(error ?? 'Role updated')
    await Promise.all([ctx.loadPeople(), ctx.reload()])
  }

  return <div className="rounded-2xl border border-[#edf0f1] p-4">
    <button onClick={onToggle} className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"><span><span className="block font-bold text-[#29434b]">{person.full_name || 'Unnamed user'}</span><span className="mt-1 block text-xs text-[#8a9a9e]">{person.email || 'No email'} · {summary}</span></span><span className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${roleTone}`}>{person.role}</span>{isProvider && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${person.available ? 'bg-[#e5f5ea] text-[#388157]' : 'bg-[#f0f2f3] text-[#738288]'}`}>{person.available ? 'Available' : 'Unavailable'}</span>}<ChevronRight className={`size-4 text-[#a7b3b6] transition ${expanded ? 'rotate-90' : ''}`} /></span></button>
    {expanded && <div className="mt-4 border-t border-[#edf0f1] pt-4">
      <dl className="grid gap-3 sm:grid-cols-3">{([['Email', person.email || '—'], ['Phone', phone], ['Joined', formatDay(person.created_at)], ...(application ? ([['City', application.city], ['Service', application.service], ['Application', application.status]] as [string, string][]) : [])] as [string, string][]).map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f7f8fa] p-3"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-[#29434b]">{value}</dd></div>)}</dl>
      {application && isProvider && <p className="mt-3 rounded-2xl bg-[#f7f8fa] p-3 text-sm text-[#607078]">{application.experience}</p>}
      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{isProvider ? 'Assigned jobs' : 'Bookings'}</p>
      {mine.length ? <div className="flex flex-col gap-2">{mine.slice(0, 6).map((b) => <button key={b.rid} onClick={() => ctx.openOrder(b.rid)} className="flex items-center justify-between rounded-xl border border-[#edf0f1] p-3 text-left text-sm hover:bg-[#f7f8fa]"><span><span className="font-bold text-[#29434b]">{b.service}</span><span className="ml-2 text-xs text-[#8a9a9e]">{b.code} · {formatDay(b.scheduledAt)}</span></span><StatusChip status={b.status} /></button>)}</div> : <Empty text="Nothing here yet." />}
      {person.role !== 'admin' && <div className="mt-4">{isProvider ? <button disabled={busy} onClick={() => changeRole('customer')} className={ghostBtn}>Remove provider access</button> : <button disabled={busy} onClick={() => changeRole('provider')} className={solidBtn}>Make provider</button>}</div>}
    </div>}
  </div>
}

function AdminPeople({ ctx, initialRole }: { ctx: AdminCtx; initialRole: 'all' | Role }) {
  const [roleFilter, setRoleFilter] = useState<'all' | Role>(initialRole)
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const query = q.trim().toLowerCase()
  const listed = ctx.profiles.filter((p) => (roleFilter === 'all' || p.role === roleFilter) && `${p.full_name} ${p.email}`.toLowerCase().includes(query))
  const count = (role: Role) => ctx.profiles.filter((p) => p.role === role).length
  return <Panel title={`People (${listed.length})`}>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row"><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search by name or email…" className={`${inputCls} flex-1`} /><div className="flex gap-2 overflow-x-auto">{([['all', `All (${ctx.profiles.length})`], ['customer', `Customers (${count('customer')})`], ['provider', `Providers (${count('provider')})`], ['admin', `Admins (${count('admin')})`]] as ['all' | Role, string][]).map(([id, label]) => <button key={id} onClick={() => setRoleFilter(id)} className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-bold ${roleFilter === id ? 'bg-[#173f4a] text-white' : 'border border-[#dce3e4] text-[#40525a]'}`}>{label}</button>)}</div></div>
    {listed.length ? <div className="flex flex-col gap-3">{listed.map((p) => <PersonRow key={p.id} person={p} ctx={ctx} expanded={expanded === p.id} onToggle={() => setExpanded(expanded === p.id ? null : p.id)} />)}</div> : <Empty text="No people match your search." />}
  </Panel>
}

function DocButton({ path, label, notify }: { path: string | null; label: string; notify: Notify }) {
  if (!path) return <span className="rounded-full bg-[#f0f2f3] px-3 py-1.5 text-xs font-bold text-[#a7b3b6]">{label}: not provided</span>
  const open = async () => {
    const tab = window.open('', '_blank')
    const { data, error } = await supabase.storage.from('provider-docs').createSignedUrl(path, 120)
    if (error || !data) { tab?.close(); notify(`Could not open ${label}: ${error?.message ?? 'unknown error'}`); return }
    if (tab) tab.location.href = data.signedUrl
    else window.open(data.signedUrl, '_blank')
  }
  return <button onClick={open} className={ghostBtn}><FileText className="mr-1 inline size-3.5" />View {label}</button>
}

function ApplicationCard({ application: a, ctx, busyId, review }: { application: Application; ctx: AdminCtx; busyId: string | null; review: (application: Application, decision: 'approved' | 'rejected', note: string) => void }) {
  const [note, setNote] = useState('')
  const tone = a.status === 'approved' ? 'bg-[#e5f5ea] text-[#388157]' : a.status === 'rejected' ? 'bg-[#f0f2f3] text-[#738288]' : 'bg-[#fff0be] text-[#9d6e00]'
  const rows: [string, string | null][] = [
    ['Phone', a.phone], ['Email', a.email], ['City', a.city], ['Service', a.service],
    ['Experience', a.years_experience != null ? `${a.years_experience} years` : null], ['Business', a.business_name], ['Business type', a.business_type], ['GSTIN', a.gst_number],
    ['Business address', a.business_address], [a.id_proof_type ?? 'ID proof', a.id_proof_number], ['Business proof type', a.business_proof_type],
    ['Bank', a.bank_account ? `${a.bank_holder} · ${a.bank_account} · ${a.bank_ifsc}` : null], ['UPI', a.upi_id],
  ]
  return <div className="rounded-2xl border border-[#edf0f1] p-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold text-[#29434b]">{a.full_name}{a.business_name ? <span className="font-normal text-[#8a9a9e]"> · {a.business_name}</span> : null}</p><p className="mt-1 text-xs text-[#8a9a9e]">Applied {formatDay(a.created_at)}{a.reviewed_at ? ` · reviewed ${formatDay(a.reviewed_at)}` : ''}</p></div><span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${tone}`}>{a.status}</span></div>
    <dl className="mt-4 grid gap-2 sm:grid-cols-3">{rows.map(([k, v]) => <div key={k} className="rounded-xl bg-[#f7f8fa] p-3"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{k}</dt><dd className="mt-1 break-words text-sm font-semibold text-[#29434b]">{v || '—'}</dd></div>)}</dl>
    <p className="mt-3 rounded-2xl bg-[#f7f8fa] p-3 text-sm text-[#607078]">{a.experience}</p>
    <div className="mt-3 flex flex-wrap gap-2"><DocButton path={a.id_proof_path} label="ID proof" notify={ctx.notify} /><DocButton path={a.business_proof_path} label="business proof" notify={ctx.notify} /><DocButton path={a.photo_path} label="photo" notify={ctx.notify} /></div>
    {a.review_note && <p className="mt-3 rounded-xl bg-[#fff0be] p-3 text-xs text-[#9d6e00]"><b>Review note:</b> {a.review_note}</p>}
    {a.status !== 'approved' && <div className="mt-4 flex flex-col gap-2 border-t border-[#edf0f1] pt-4">
      {a.status === 'pending' && <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason (required to reject, shown to the applicant)" className={inputCls} />}
      <div className="flex gap-2"><button disabled={busyId === a.id} onClick={() => review(a, 'approved', note)} className={solidBtn}>Approve & activate dashboard</button>{a.status === 'pending' && <button disabled={busyId === a.id} onClick={() => { if (!note.trim()) { ctx.notify('Please write a reason before rejecting'); return } review(a, 'rejected', note) }} className={ghostBtn}>Reject</button>}</div>
    </div>}
  </div>
}

function AdminApplications({ ctx }: { ctx: AdminCtx }) {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const listed = ctx.applications.filter((a) => filter === 'all' || a.status === filter)
  const review = async (application: Application, decision: 'approved' | 'rejected', note: string) => {
    setBusyId(application.id)
    const error = await callRpc('admin_review_application', { p_app: application.id, p_decision: decision, p_note: note || null })
    setBusyId(null)
    ctx.notify(error ?? (decision === 'approved' ? `${application.full_name} is approved — their provider dashboard is now active` : 'Application rejected'))
    await ctx.loadPeople()
  }
  return <Panel title="Provider applications" action={<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className={`${inputCls} py-2 text-xs`}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></select>}>
    {listed.length ? <div className="flex flex-col gap-4">{listed.map((a) => <ApplicationCard key={a.id} application={a} ctx={ctx} busyId={busyId} review={review} />)}</div> : <Empty text={`No ${filter === 'all' ? '' : filter + ' '}applications.`} />}
  </Panel>
}

function AdminReports({ ctx }: { ctx: AdminCtx }) {
  const { bookings, providers, bills, payouts } = ctx
  const billMap = new Map(bills.map((bill) => [bill.booking_id, bill]))
  const completed = bookings.filter((b) => b.status === 'completed')
  const earnings = completed.map((b) => ({ b, e: bookingEarnings(b, billMap.get(b.rid)) }))
  const gross = round2(earnings.reduce((sum, { e }) => sum + e.gross, 0))
  const platform = round2(earnings.reduce((sum, { e }) => sum + e.platform, 0))
  const cancelled = bookings.filter((b) => b.status === 'cancelled').length
  const byService = Object.entries(earnings.reduce<Record<string, number>>((acc, { b, e }) => { acc[b.service] = (acc[b.service] ?? 0) + e.gross; return acc }, {})).sort((a, b) => b[1] - a[1])
  const maxService = Math.max(1, ...byService.map(([, value]) => value))
  const days = lastDays(7)
  const top = providers
    .map((p) => { const ledger = providerLedger(p.id, bookings, bills, payouts); const done = completed.filter((b) => b.providerId === p.id); return { p, done: done.length, earned: ledger.earned, rating: average(done.map((b) => b.rating)) } })
    .sort((a, b) => b.earned - a.earned)
    .slice(0, 5)
  return <>
    <div className="mt-6 grid gap-4 sm:grid-cols-4"><Stat label="Gross billed" value={money(gross)} /><Stat label="ProMajdoor income" value={money(platform)} /><Stat label="Avg order value" value={completed.length ? money(Math.round(gross / completed.length)) : '—'} /><Stat label="Cancel rate" value={bookings.length ? `${Math.round((cancelled / bookings.length) * 100)}%` : '—'} /></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <Panel title="Billed by service (completed jobs)">{byService.length ? <div className="flex flex-col gap-4">{byService.map(([service, value]) => <div key={service}><div className="flex justify-between text-sm"><span className="font-semibold text-[#29434b]">{service}</span><span className="text-[#738288]">{money(value)}</span></div><div className="mt-2 h-2 rounded-full bg-[#eef1f2]"><div className="h-2 rounded-full bg-[#d7f15e]" style={{ width: `${(value / maxService) * 100}%` }} /></div></div>)}</div> : <Empty text="Revenue appears here once jobs are completed." />}</Panel>
      <Panel title="New orders, last 7 days"><BarChart values={days.map((day) => bookings.filter((b) => sameDay(b.createdAt, day)).length)} labels={days.map((d) => d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2))} /></Panel>
      <Panel title="Orders by status"><div className="flex flex-col gap-3">{STATUSES.map((s) => <div key={s.value} className="flex items-center justify-between rounded-2xl bg-[#f7f8fa] p-3"><StatusChip status={s.value} /><span className="text-lg font-semibold text-[#173f4a]">{bookings.filter((b) => b.status === s.value).length}</span></div>)}</div></Panel>
      <Panel title="Top providers by earnings">{top.length ? <div className="flex flex-col gap-3">{top.map(({ p, done, earned, rating }) => <div key={p.id} className="flex items-center justify-between rounded-2xl bg-[#f7f8fa] p-3"><span className="text-sm font-bold text-[#29434b]">{p.full_name || p.email}</span><span className="text-xs text-[#738288]">{money(earned)} · {done} done{rating != null ? ` · ${rating.toFixed(1)}★` : ''}</span></div>)}</div> : <Empty text="No providers yet." />}</Panel>
    </div>
  </>
}

function AdminQuality({ ctx }: { ctx: AdminCtx }) {
  const { bookings } = ctx
  const low = bookings.filter((b) => b.rating != null && b.rating <= 2)
  const cancelled = bookings.filter((b) => b.status === 'cancelled')
  const stale = bookings.filter((b) => b.status === 'awaiting_assignment' && Date.now() - new Date(b.createdAt).getTime() > 24 * 60 * 60 * 1000)
  const list = (items: Booking[], empty: string) => items.length ? <div className="flex flex-col gap-3">{items.map((b) => <OrderRow key={b.rid} booking={b} showCustomer onOpen={() => ctx.openOrder(b.rid)} />)}</div> : <Empty text={empty} />
  return <>
    <Panel title={`Waiting over 24 hours for a provider (${stale.length})`}>{list(stale, 'Nothing is waiting too long. 🎉')}</Panel>
    <Panel title={`Low ratings, 1–2 stars (${low.length})`}>{list(low, 'No low ratings so far.')}</Panel>
    <Panel title={`Cancelled orders (${cancelled.length})`}>{list(cancelled, 'No cancelled orders.')}</Panel>
  </>
}

export function AdminDashboard({ userId, bookings, bills, payouts, settings, services, go, notify, reload, reloadServices, reloadSettings }: { userId: string; bookings: Booking[]; bills: Bill[]; payouts: Payout[]; settings: Settings; services: ServiceRow[]; go: (screen: Screen) => void; notify: Notify; reload: () => Promise<void>; reloadServices: () => Promise<void>; reloadSettings: () => Promise<void> }) {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilter>({ q: '', status: 'all', provider: 'all', flash: false })

  const loadPeople = useCallback(async () => {
    const [people, apps] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('provider_applications').select('*').order('created_at', { ascending: false }),
    ])
    if (people.error) notify(`Could not load people: ${people.error.message}`)
    else setProfiles((people.data ?? []) as Profile[])
    if (apps.error) notify(`Could not load applications: ${apps.error.message}`)
    else setApplications((apps.data ?? []) as Application[])
  }, [notify])

  useEffect(() => {
    loadPeople()
    const timer = window.setInterval(loadPeople, 30000)
    return () => window.clearInterval(timer)
  }, [loadPeople])

  const providers = useMemo(() => profiles.filter((p) => p.role === 'provider'), [profiles])
  const opened = bookings.find((b) => b.rid === openId)
  const openedBill = opened ? bills.find((b) => b.booking_id === opened.rid) : undefined

  const ctx: AdminCtx = {
    bookings,
    bills,
    payouts,
    settings,
    profiles,
    applications,
    providers,
    services,
    notify,
    reload,
    loadPeople,
    reloadServices,
    reloadSettings,
    openOrder: setOpenId,
    setTab,
    jumpToOrders: (status, flash = false) => { setOrdersFilter({ q: '', status, provider: 'all', flash }); setTab('orders') },
  }

  const pending = applications.filter((a) => a.status === 'pending').length
  const awaiting = bookings.filter((b) => b.status === 'awaiting_assignment').length
  const flashWaiting = bookings.filter((b) => b.isFlash && b.status === 'awaiting_assignment').length

  return <DashboardShell eyebrow="Admin control center" title="Keep every request moving." subtitle="Manage your marketplace, people, pricing and customer experience." actions={<button onClick={() => setTab('services')} className={limeBtn}><Plus className="mr-1 inline size-4" /> Add service</button>}>
    <Tabs<AdminTab> tabs={[{ id: 'overview', label: 'Overview' }, { id: 'orders', label: 'Orders', badge: awaiting }, { id: 'people', label: 'People' }, { id: 'applications', label: 'Applications', badge: pending }, { id: 'earnings', label: 'Earnings & payouts' }, { id: 'services', label: 'Services' }, { id: 'reports', label: 'Reports' }, { id: 'quality', label: 'Quality & safety' }]} value={tab} onChange={setTab} />
    {flashWaiting > 0 && <button onClick={() => ctx.jumpToOrders('awaiting_assignment', true)} className="flash-panel mt-6 flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left text-white"><span className="flex items-center gap-3 text-sm font-bold"><Siren className="size-5 text-[#ffd84a]" />{flashWaiting} flash request{flashWaiting === 1 ? '' : 's'} waiting for a provider — review now</span><ChevronRight className="size-5" /></button>}
    {tab === 'overview' && <AdminOverview ctx={ctx} />}
    {tab === 'orders' && <AdminOrders ctx={ctx} filter={ordersFilter} setFilter={setOrdersFilter} />}
    {tab === 'people' && <AdminPeople ctx={ctx} initialRole="all" />}
    {tab === 'applications' && <AdminApplications ctx={ctx} />}
    {tab === 'earnings' && <AdminEarnings bookings={bookings} bills={bills} payouts={payouts} providers={providers} applications={applications} settings={settings} notify={notify} reload={reload} reloadSettings={reloadSettings} />}
    {tab === 'services' && <AdminServices services={services} notify={notify} reloadServices={reloadServices} />}
    {tab === 'reports' && <AdminReports ctx={ctx} />}
    {tab === 'quality' && <AdminQuality ctx={ctx} />}
    <button onClick={() => go('home')} className="mt-6 text-sm font-bold text-[#557179]">← Back to ProMajdoor home</button>
    {opened && <BookingDetailModal key={`${opened.rid}-${opened.updatedAt}-${openedBill?.updated_at ?? ''}`} booking={opened} bill={openedBill} viewer="admin" userId={userId} providers={providers} settings={settings} notify={notify} reload={reload} close={() => setOpenId(null)} />}
  </DashboardShell>
}
