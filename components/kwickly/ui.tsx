'use client'

import type { LucideIcon } from 'lucide-react'
import { ChevronRight, Star } from 'lucide-react'
import { statusInfo } from '@/lib/kwickly'

export const inputCls = 'rounded-2xl border border-[#dce3e4] bg-white px-4 py-3 text-sm outline-none focus:border-[#397f68]'
export const ghostBtn = 'rounded-full border border-[#dce3e4] px-3 py-2 text-xs font-bold text-[#29434b] disabled:opacity-60'
export const solidBtn = 'rounded-full bg-[#173f4a] px-3 py-2 text-xs font-bold text-white disabled:opacity-60'
export const limeBtn = 'rounded-full bg-[#d7f15e] px-5 py-3 text-sm font-bold text-[#173f4a]'

/* ───────────────────────── shared building blocks ───────────────────────── */

export function DashboardShell({ eyebrow, title, subtitle, actions, children }: { eyebrow: string; title: string; subtitle: string; actions: React.ReactNode; children: React.ReactNode }) {
  return <section className="mt-3"><div className="rounded-[30px] bg-[#173f4a] p-7 text-white shadow-[0_20px_60px_rgba(23,63,74,.16)] sm:p-12"><div className="flex flex-col justify-between gap-7 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d7f15e]">{eyebrow}</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">{title}</h1><p className="mt-4 max-w-xl text-[#c2d3d3]">{subtitle}</p></div>{actions}</div></div>{children}</section>
}

export function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-[#e8edef] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#8a9a9e]">{label}</p><p className="mt-3 text-3xl font-semibold tracking-[-.05em] text-[#173f4a]">{value}</p></div>
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="mt-6 rounded-[26px] border border-[#e8edef] bg-white p-6 shadow-sm sm:p-7"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-[#173f4a]">{title}</h2>{action}</div>{children}</div>
}

export function Action({ icon: Icon, text, onClick }: { icon: LucideIcon; text: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex min-h-24 flex-col items-start justify-between rounded-2xl bg-[#f7f8fa] p-4 text-left transition hover:bg-[#eef5f3]"><Icon className="size-5 text-[#397f68]" /><span className="text-xs font-bold text-[#29434b]">{text}</span></button>
}

export function MiniFeature({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-[#e8edef] bg-white p-5 text-left shadow-sm hover:border-[#b8ce64]"><Icon className="size-5 text-[#397f68]" /><span className="text-sm font-bold text-[#29434b]">{label}</span></button>
}

export function AlertRow({ icon: Icon, text, onClick }: { icon: LucideIcon; text: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-[#f7f8fa] p-4 text-left hover:bg-[#eef5f3]"><span className="flex size-9 items-center justify-center rounded-xl bg-[#fff0be] text-[#9d6e00]"><Icon className="size-4" /></span><span className="text-sm font-semibold text-[#29434b]">{text}</span><ChevronRight className="ml-auto size-4 text-[#a7b3b6]" /></button>
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl bg-[#f7f8fa] p-5 text-sm text-[#819096]">{text}</p>
}

export function StatusChip({ status }: { status: string }) {
  const info = statusInfo(status)
  return <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${info.tone}`}>{info.label}</span>
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (id: T) => void }) {
  return <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{tabs.map((tab) => <button key={tab.id} onClick={() => onChange(tab.id)} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-bold ${value === tab.id ? 'bg-[#173f4a] text-white' : 'border border-[#dce3e4] bg-white text-[#40525a]'}`}>{tab.label}{tab.badge ? <span className="ml-2 rounded-full bg-[#d7f15e] px-1.5 py-0.5 text-[10px] text-[#173f4a]">{tab.badge}</span> : null}</button>)}</div>
}

export function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} disabled={!onChange} onClick={() => onChange?.(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}><Star className={`size-5 ${n <= value ? 'fill-[#f0c84b] text-[#f0c84b]' : 'text-[#c9d3d5]'}`} /></button>)}</div>
}

export function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values)
  return <div><div className="flex h-24 items-end gap-2">{values.map((value, i) => <span key={i} title={String(value)} className="flex-1 rounded-t-lg bg-[#d7f15e]" style={{ height: `${Math.max(4, (value / max) * 100)}%` }} />)}</div><div className="mt-2 flex gap-2 text-[10px] text-[#819096]">{labels.map((label, i) => <span key={i} className="flex-1 text-center">{label}</span>)}</div></div>
}

