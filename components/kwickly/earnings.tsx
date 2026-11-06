'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, Download } from 'lucide-react'
import { PAYOUT_METHODS, bookingEarnings, callRpc, downloadCsv, formatDay, methodLabel, money, providerLedger, round2 } from '@/lib/kwickly'
import type { Application, Bill, Booking, Payout, Profile, Settings } from '@/lib/kwickly'
import { Empty, Panel, Stat, StatusChip, ghostBtn, inputCls, solidBtn } from './ui'

type Notify = (message: string) => void

const balanceLabel = (balance: number) => (balance < 0 ? 'Owed to ProMajdoor' : 'Payable to provider')

/* ───────────────────────── provider: "Earnings" tab ───────────────────────── */

export function ProviderEarnings({ userId, bookings, bills, payouts, settings }: { userId: string; bookings: Booking[]; bills: Bill[]; payouts: Payout[]; settings: Settings }) {
  const ledger = useMemo(() => providerLedger(userId, bookings, bills, payouts), [userId, bookings, bills, payouts])
  const mine = payouts.filter((p) => p.provider_id === userId)
  const now = new Date()
  const thisMonth = round2(ledger.jobs.filter((job) => { const d = new Date(job.booking.completedAt ?? job.booking.scheduledAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }).reduce((sum, job) => sum + job.provider, 0))
  const earningJobs = ledger.jobs.filter((job) => job.provider > 0)
  const share = Math.ceil(settings.visit_fee / 2)

  return <>
    <div className="mt-6 grid gap-4 sm:grid-cols-4">
      <Stat label="Total earned" value={money(ledger.earned)} />
      <Stat label="This month" value={money(thisMonth)} />
      <Stat label="Paid to you" value={money(ledger.paidOut)} />
      <Stat label={ledger.balance < 0 ? 'You owe ProMajdoor' : 'Balance to receive'} value={money(Math.abs(ledger.balance))} />
    </div>
    {ledger.balance < 0 && <p className="mt-4 rounded-2xl bg-[#fff0be] p-4 text-sm text-[#9d6e00]">You collected {money(ledger.held)} from customers directly. After your earnings and payouts, {money(Math.abs(ledger.balance))} is ProMajdoor&apos;s share and will be settled by our team.</p>}
    <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
      <Panel title="Earnings by job">{earningJobs.length ? <div className="flex flex-col gap-3">{earningJobs.map(({ booking, bill, visitProvider, workProvider, provider }) => <div key={booking.rid} className="rounded-2xl border border-[#edf0f1] p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#29434b]">{booking.service} <span className="font-normal text-[#8a9a9e]">· {booking.code}</span></p><p className="mt-1 text-xs text-[#8a9a9e]">{booking.customerName || 'Customer'} · {formatDay(booking.scheduledAt)}</p></div><div className="text-right"><p className="text-lg font-semibold text-[#173f4a]">{money(provider)}</p><StatusChip status={booking.status} /></div></div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[#f7f8fa] px-3 py-1.5 text-[#607078]">Visit share {money(visitProvider)}</span><span className="rounded-full bg-[#f7f8fa] px-3 py-1.5 text-[#607078]">Work {workProvider ? money(workProvider) : bill?.status === 'draft' ? 'draft bill not sent' : 'no bill yet'}</span>{bill?.status === 'paid' && <span className="rounded-full bg-[#e5f5ea] px-3 py-1.5 font-bold text-[#388157]">Customer paid</span>}</div>
      </div>)}</div> : <Empty text="Your earnings appear here once you start a job." />}</Panel>
      <div>
        <Panel title="How you earn"><ul className="flex flex-col gap-3 text-sm leading-6 text-[#607078]">
          <li><b className="text-[#173f4a]">Visit fee {money(settings.visit_fee)}</b> is prepaid by the customer. You get {money(share)}, ProMajdoor keeps {money(settings.visit_fee - share)}.</li>
          <li><b className="text-[#173f4a]">Work bill:</b> you get items + labour + GST. ProMajdoor adds a {settings.service_charge_percent}% service charge on top for the customer — never taken from your share.</li>
          <li>ProMajdoor pays your balance to your bank / UPI. See payouts below.</li>
        </ul></Panel>
        <Panel title="Payouts received">{mine.length ? <div className="flex flex-col gap-2">{mine.map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-[#f7f8fa] p-3 text-sm"><span><b className="text-[#29434b]">{money(p.amount)}</b><span className="ml-2 text-xs text-[#8a9a9e]">{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ''}</span></span><span className="text-xs text-[#8a9a9e]">{formatDay(p.created_at)}</span></div>)}</div> : <Empty text="No payouts yet." />}</Panel>
      </div>
    </div>
  </>
}

/* ───────────────────────── admin: pricing + all provider income ───────────────────────── */

type AdminEarningsProps = { bookings: Booking[]; bills: Bill[]; payouts: Payout[]; providers: Profile[]; applications: Application[]; settings: Settings; notify: Notify; reload: () => Promise<void>; reloadSettings: () => Promise<void> }

function PricingPanel({ settings, notify, reloadSettings }: Pick<AdminEarningsProps, 'settings' | 'notify' | 'reloadSettings'>) {
  const [fee, setFee] = useState(String(settings.visit_fee))
  const [pct, setPct] = useState(String(settings.service_charge_percent))
  const [busy, setBusy] = useState(false)
  const feeN = Math.round(Number(fee))
  const providerShare = Number.isFinite(feeN) ? Math.ceil(feeN / 2) : 0
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const error = await callRpc('admin_update_settings', { p_visit_fee: feeN, p_service_percent: Number(pct) })
    setBusy(false)
    notify(error ?? 'Pricing updated — it applies to new bookings and new bills')
    if (!error) await reloadSettings()
  }
  return <Panel title="Pricing & commission">
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#29434b]">Visit fee (₹, prepaid)<input type="number" min={0} step={1} required value={fee} onChange={(e) => setFee(e.target.value)} className={inputCls} /></label>
      <label className="flex flex-col gap-2 text-sm font-semibold text-[#29434b]">Service charge on work bills (%)<input type="number" min={0} max={100} step="0.5" required value={pct} onChange={(e) => setPct(e.target.value)} className={inputCls} /></label>
      <button disabled={busy} className="rounded-2xl bg-[#173f4a] px-6 py-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save pricing'}</button>
    </form>
    <p className="mt-3 text-xs leading-5 text-[#819096]">Visit fee {money(feeN || 0)} splits into <b>{money(providerShare)}</b> for the provider and <b>{money((feeN || 0) - providerShare)}</b> for ProMajdoor. On a work bill, the {pct || 0}% service charge is added on top of items + labour and goes to ProMajdoor. Existing bookings and sent bills keep the amounts they were created with.</p>
  </Panel>
}

function ProviderRow({ provider, props }: { provider: Profile; props: AdminEarningsProps }) {
  const { bookings, bills, payouts, applications, notify, reload } = props
  const [open, setOpen] = useState(false)
  const ledger = useMemo(() => providerLedger(provider.id, bookings, bills, payouts), [provider.id, bookings, bills, payouts])
  const application = applications.find((a) => a.user_id === provider.id && a.status === 'approved')
  const mine = payouts.filter((p) => p.provider_id === provider.id)
  const [form, setForm] = useState({ amount: '', method: 'bank_transfer', reference: '', note: '' })
  const [busy, setBusy] = useState(false)
  const due = Math.max(0, ledger.balance)

  const pay = async (event: React.FormEvent) => {
    event.preventDefault()
    const amount = Number(form.amount)
    if (!(amount > 0)) { notify('Enter the amount you paid'); return }
    if (amount > due && !window.confirm(`This is more than the ${money(due)} currently due. Record it anyway?`)) return
    setBusy(true)
    const error = await callRpc('admin_record_payout', { p_provider: provider.id, p_amount: amount, p_method: form.method, p_reference: form.reference, p_note: form.note })
    setBusy(false)
    notify(error ?? 'Payout recorded')
    if (!error) { setForm({ amount: '', method: 'bank_transfer', reference: '', note: '' }); await reload() }
  }
  const removePayout = async (p: Payout) => {
    if (!window.confirm(`Delete the ${money(p.amount)} payout from ${formatDay(p.created_at)}?`)) return
    const error = await callRpc('admin_delete_payout', { p_payout: p.id })
    notify(error ?? 'Payout deleted')
    if (!error) await reload()
  }
  const detail = (label: string, value: string | null | undefined) => <div className="rounded-2xl bg-[#f7f8fa] p-3"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-[#29434b]">{value || '—'}</dd></div>

  return <div className="rounded-2xl border border-[#edf0f1] p-4">
    <button onClick={() => setOpen(!open)} className="grid w-full gap-2 text-left sm:grid-cols-[1.4fr_repeat(4,1fr)_auto] sm:items-center">
      <span><span className="block font-bold text-[#29434b]">{provider.full_name || provider.email}</span><span className="mt-0.5 block text-xs text-[#8a9a9e]">{application?.business_name || provider.email}</span></span>
      <span className="text-xs text-[#738288]"><span className="block text-[10px] font-bold uppercase text-[#8a9a9e]">Jobs</span>{ledger.jobs.filter((j) => j.visited).length}</span>
      <span className="text-xs text-[#738288]"><span className="block text-[10px] font-bold uppercase text-[#8a9a9e]">Earned</span><b className="text-sm text-[#173f4a]">{money(ledger.earned)}</b></span>
      <span className="text-xs text-[#738288]"><span className="block text-[10px] font-bold uppercase text-[#8a9a9e]">Paid out</span>{money(ledger.paidOut)}</span>
      <span className="text-xs text-[#738288]"><span className="block text-[10px] font-bold uppercase text-[#8a9a9e]">{balanceLabel(ledger.balance)}</span><b className={`text-sm ${ledger.balance < 0 ? 'text-[#a24a4a]' : 'text-[#388157]'}`}>{money(Math.abs(ledger.balance))}</b></span>
      <ChevronRight className={`size-4 text-[#a7b3b6] transition ${open ? 'rotate-90' : ''}`} />
    </button>

    {open && <div className="mt-4 border-t border-[#edf0f1] pt-4">
      <dl className="grid gap-3 sm:grid-cols-4">
        {detail('Email', provider.email)}{detail('Phone', application?.phone)}{detail('City', application?.city)}{detail('Service', application?.service)}
        {detail('Business', application?.business_name)}{detail('GSTIN', application?.gst_number)}{detail('Bank account', application?.bank_account ? `${application.bank_holder} · ${application.bank_account} · ${application.bank_ifsc}` : null)}{detail('UPI', application?.upi_id)}
        {detail('Invoiced to customers', money(ledger.invoiced))}{detail('ProMajdoor income from this provider', money(ledger.platform))}{detail('Collected directly by provider', money(ledger.held))}{detail('Joined', formatDay(provider.created_at))}
      </dl>

      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Every job</p>
      {ledger.jobs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="text-[10px] uppercase tracking-[.1em] text-[#8a9a9e]"><th className="p-2">Job</th><th className="p-2">Status</th><th className="p-2 text-right">Visit share</th><th className="p-2 text-right">Work (provider)</th><th className="p-2 text-right">ProMajdoor</th><th className="p-2 text-right">Provider total</th></tr></thead><tbody>
        {ledger.jobs.map(({ booking, bill, visitProvider, workProvider, platform, provider: total }) => <tr key={booking.rid} className="border-t border-[#edf0f1]"><td className="p-2"><span className="font-semibold text-[#29434b]">{booking.service}</span><span className="block text-xs text-[#8a9a9e]">{booking.code} · {booking.customerName || 'Customer'}{bill ? ` · ${bill.status}` : ''}</span></td><td className="p-2"><StatusChip status={booking.status} /></td><td className="p-2 text-right">{money(visitProvider)}</td><td className="p-2 text-right">{money(workProvider)}</td><td className="p-2 text-right text-[#738288]">{money(platform)}</td><td className="p-2 text-right font-bold text-[#173f4a]">{money(total)}</td></tr>)}
      </tbody></table></div> : <Empty text="No jobs yet." />}

      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-[.14em] text-[#8a9a9e]">Payouts</p>
      {mine.length ? <div className="mb-3 flex flex-col gap-2">{mine.map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-[#f7f8fa] p-3 text-sm"><span><b className="text-[#29434b]">{money(p.amount)}</b><span className="ml-2 text-xs text-[#8a9a9e]">{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ''}{p.note ? ` · ${p.note}` : ''}</span></span><span className="flex items-center gap-3 text-xs text-[#8a9a9e]">{formatDay(p.created_at)}<button onClick={() => removePayout(p)} className="font-bold text-[#a24a4a]">Delete</button></span></div>)}</div> : <Empty text="No payouts recorded." />}

      <form onSubmit={pay} className="mt-3 grid gap-2 rounded-2xl border border-[#e8edef] p-4 sm:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]">
        <input type="number" min={0} step="0.01" placeholder={due ? `Amount (due ${money(due)})` : 'Amount (₹)'} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
        <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inputCls}>{PAYOUT_METHODS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
        <input placeholder="Reference / UTR" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={inputCls} />
        <input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} />
        <button disabled={busy} className={solidBtn}>{busy ? 'Saving…' : 'Record payout'}</button>
      </form>
      {due > 0 && <button type="button" onClick={() => setForm({ ...form, amount: String(due) })} className="mt-2 text-xs font-bold text-[#557179]">Fill full amount due ({money(due)})</button>}
    </div>}
  </div>
}

export function AdminEarnings(props: AdminEarningsProps) {
  const { bookings, bills, payouts, providers, settings, notify, reloadSettings } = props
  const totals = useMemo(() => {
    const billByBooking = new Map(bills.map((b) => [b.booking_id, b]))
    const all = bookings.map((b) => bookingEarnings(b, billByBooking.get(b.rid)))
    const sum = (pick: (e: (typeof all)[number]) => number) => round2(all.reduce((s, e) => s + pick(e), 0))
    const ledgers = providers.map((p) => providerLedger(p.id, bookings, bills, payouts))
    return {
      gross: sum((e) => e.gross),
      platform: sum((e) => e.platform),
      visitPlatform: sum((e) => e.visitPlatform),
      service: sum((e) => e.workPlatform),
      providers: sum((e) => e.provider),
      paidOut: round2(payouts.reduce((s, p) => s + p.amount, 0)),
      payable: round2(ledgers.reduce((s, l) => s + Math.max(0, l.balance), 0)),
      owed: round2(ledgers.reduce((s, l) => s + Math.max(0, -l.balance), 0)),
      unpaidBills: round2(bills.filter((b) => b.status === 'sent').reduce((s, b) => s + b.total, 0)),
    }
  }, [bookings, bills, payouts, providers])

  const exportCsv = () => {
    const rows: (string | number)[][] = [['Provider', 'Email', 'Jobs', 'Earned', 'Paid out', 'Collected by provider', 'Balance', 'ProMajdoor income']]
    providers.forEach((p) => { const l = providerLedger(p.id, bookings, bills, payouts); rows.push([p.full_name || p.email, p.email, l.jobs.filter((j) => j.visited).length, l.earned, l.paidOut, l.held, l.balance, l.platform]) })
    downloadCsv(`ProMajdoor-provider-earnings-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const ranked = [...providers].sort((a, b) => providerLedger(b.id, bookings, bills, payouts).earned - providerLedger(a.id, bookings, bills, payouts).earned)

  return <>
    <PricingPanel settings={settings} notify={notify} reloadSettings={reloadSettings} />
    <div className="mt-6 grid gap-4 sm:grid-cols-4">
      <Stat label="Gross billed" value={money(totals.gross)} />
      <Stat label="ProMajdoor income" value={money(totals.platform)} />
      <Stat label="Provider earnings" value={money(totals.providers)} />
      <Stat label="Paid to providers" value={money(totals.paidOut)} />
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-4">
      <Stat label="Visit-fee share" value={money(totals.visitPlatform)} />
      <Stat label="Service charges" value={money(totals.service)} />
      <Stat label="Payable to providers" value={money(totals.payable)} />
      <Stat label="Unpaid customer bills" value={money(totals.unpaidBills)} />
    </div>
    {totals.owed > 0 && <p className="mt-4 rounded-2xl bg-[#fff0be] p-4 text-sm text-[#9d6e00]">Providers who collected cash/UPI directly owe ProMajdoor {money(totals.owed)} in total (already netted off in each balance below).</p>}
    <Panel title={`Provider earnings (${providers.length})`} action={<button onClick={exportCsv} className={ghostBtn}><Download className="mr-1 inline size-3.5" />Export CSV</button>}>
      {ranked.length ? <div className="flex flex-col gap-3">{ranked.map((p) => <ProviderRow key={p.id} provider={p} props={props} />)}</div> : <Empty text="No providers yet. Approve an application to add one." />}
    </Panel>
  </>
}
