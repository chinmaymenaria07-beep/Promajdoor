'use client'

import { ArrowRight, Search, ShieldCheck, Sparkles, Star } from 'lucide-react'

type HomeHeroProps = { search: string; onSearch: (value: string) => void; onExplore: () => void }

export function HomeHero({ search, onSearch, onExplore }: HomeHeroProps) {
  return (
    <section className="relative isolate overflow-hidden rounded-[34px] bg-[#173f4a] px-7 py-10 text-white shadow-[0_24px_80px_rgba(23,63,74,.22)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
      <div className="hero-orb pointer-events-none absolute -right-16 -top-24 size-80 rounded-full border-[36px] border-[#d7f15e]/15" />
      <div className="hero-orb-delayed pointer-events-none absolute bottom-[-120px] right-[20%] size-64 rounded-full border-[26px] border-[#8ad9d0]/10" />
      <div className="hero-diamond pointer-events-none absolute right-[12%] top-[34%] hidden size-20 rotate-45 rounded-[24px] bg-[#d7f15e]/10 lg:block" />
      <div className="relative z-10 max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-[#d7f15e]"><span className="size-1.5 rounded-full bg-[#d7f15e]" /> YOUR HOME, HANDLED</div>
        <h1 className="max-w-2xl text-5xl font-semibold leading-[.98] tracking-[-.065em] sm:text-7xl">The faster way to get things done.</h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-[#c2d3d3] sm:text-lg">From a dripping tap to a dinner worth remembering, ProMajdoor connects you with trusted local professionals and keeps every detail in one calm place.</p>
        <div className="mt-9 flex max-w-2xl flex-col gap-3 sm:flex-row"><div className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl bg-white px-4 text-[#68777c] shadow-xl"><Search className="size-5 text-[#173f4a]" /><input aria-label="Search services" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="What do you need help with?" className="w-full bg-transparent text-sm text-[#173f4a] outline-none placeholder:text-[#849197]" /></div><button onClick={onExplore} className="min-h-14 rounded-2xl bg-[#d7f15e] px-6 text-sm font-bold text-[#173f4a]">Find a pro <ArrowRight className="ml-2 inline size-4" /></button></div>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[#c2d3d3]"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#d7f15e]" /> Background-checked pros</span><span className="flex items-center gap-2"><Star className="size-4 text-[#d7f15e]" /> 4.9 average rating</span><span className="flex items-center gap-2"><Sparkles className="size-4 text-[#d7f15e]" /> Support that stays close</span></div>
      </div>
    </section>
  )
}
