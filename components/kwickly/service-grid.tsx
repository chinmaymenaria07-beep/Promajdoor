'use client'

import { ArrowRight, Phone, Siren, Zap } from 'lucide-react'
import { HELPLINE_DISPLAY, helplineTel, money } from '@/lib/kwickly'
import type { ServiceCard } from '@/lib/kwickly'

type GridProps = { services: ServiceCard[]; onSelect: (name: string) => void; visitFee: number }

/** Regular services. */
export function ServiceGrid({ services, onSelect, visitFee }: GridProps) {
  return <section id="services" className="py-14 sm:py-20">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-bold uppercase tracking-[.16em] text-[#8a9a9e]">One trusted network</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.05em] text-[#173f4a] sm:text-4xl">Whatever your day needs.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#819096]">Pick a service, answer a few questions made for that job, and book a visit for just {money(visitFee)}.</p></div>
      <span className="rounded-full bg-[#eef5f3] px-4 py-2 text-sm font-bold text-[#397f68]">{services.length} service{services.length === 1 ? '' : 's'}</span>
    </div>
    {services.length === 0 ? <p className="mt-8 rounded-2xl bg-white p-6 text-sm text-[#819096]">No services match your search.</p> :
    <div className="mt-8 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {services.map(({ name, detail, icon: Icon, tone, accent }, index) => <button key={name} onClick={() => onSelect(name)} style={{ animationDelay: `${index * 70}ms`, '--accent': accent } as React.CSSProperties} className="svc-card kw-rise group relative overflow-hidden rounded-[26px] border border-[#e8edef] bg-white p-5 text-left shadow-sm">
        <span className="svc-blob pointer-events-none absolute -right-10 -top-10 size-32 rounded-full" style={{ backgroundColor: accent }} />
        <span className={`svc-icon relative flex size-14 items-center justify-center rounded-[18px] ${tone}`}><Icon className="size-6" /></span>
        <span className="relative mt-7 block text-[17px] font-bold tracking-[-.02em] text-[#173f4a]">{name}</span>
        <span className="relative mt-1 block min-h-8 text-xs leading-4 text-[#819096]">{detail}</span>
        <span className="relative mt-5 flex items-center justify-between border-t border-[#f0f3f4] pt-4"><span className="rounded-full bg-[#f4f7f7] px-2.5 py-1 text-[11px] font-bold text-[#557179]">Visit {money(visitFee)}</span><span className="svc-cta flex items-center gap-1 text-xs font-bold text-[#173f4a]">Book now <ArrowRight className="size-3.5" /></span></span>
        <span className="svc-bar absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: accent }} />
      </button>)}
    </div>}
  </section>
}

/** Flash = emergency services that need urgent review. Shown as its own, visually distinct section. */
export function FlashServices({ services, onSelect }: { services: ServiceCard[]; onSelect: (name: string) => void }) {
  if (!services.length) return null
  return <section id="flash" className="mt-10">
    <div className="flash-panel relative overflow-hidden rounded-[32px] p-6 text-white sm:p-10">
      <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full border-[34px] border-white/5" />
      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.16em] text-[#ffb4a8]"><span className="flash-dot size-2 rounded-full bg-[#ff5a47]" />Flash services</span>
          <h2 className="mt-4 flex items-center gap-3 text-3xl font-semibold tracking-[-.05em] sm:text-4xl"><Zap className="size-8 fill-[#ffd84a] text-[#ffd84a]" />Emergency? Get help first.</h2>
          <p className="mt-3 text-sm leading-6 text-[#f3d6d2]">Flash requests skip the queue: our team reviews them straight away, calls you and sends the nearest available pro. Use these only for urgent problems.</p>
        </div>
        <a href={helplineTel} className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-white px-5 py-3 text-sm font-bold text-[#8a1f17] shadow-lg lg:self-auto"><Phone className="size-4" />Call {HELPLINE_DISPLAY}</a>
      </div>
      <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {services.map(({ name, detail, icon: Icon }, index) => <button key={name} onClick={() => onSelect(name)} style={{ animationDelay: `${index * 90}ms` }} className="flash-card kw-rise group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[.07] p-5 text-left backdrop-blur-sm">
          <span className="flash-ring relative flex size-12 items-center justify-center rounded-2xl bg-[#ff5a47] text-white"><Icon className="size-6" /></span>
          <span className="mt-6 block text-base font-bold">{name}</span>
          <span className="mt-1 block min-h-8 text-xs leading-4 text-[#f3d6d2]">{detail}</span>
          <span className="mt-5 flex items-center justify-between"><span className="flex items-center gap-1.5 rounded-full bg-[#ffd84a] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#6b1a12]"><Siren className="size-3" />Urgent review</span><span className="flex items-center gap-1 text-xs font-bold transition group-hover:translate-x-1">Request <ArrowRight className="size-3.5" /></span></span>
        </button>)}
      </div>
    </div>
  </section>
}
