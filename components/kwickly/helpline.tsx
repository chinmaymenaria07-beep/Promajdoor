'use client'

import { useState } from 'react'
import { Headphones, MessageCircle, Phone, X } from 'lucide-react'
import { HELPLINE_DISPLAY, helplineTel, helplineWhatsapp } from '@/lib/kwickly'

/** Slim strip above the header on every page. */
export function HelplineBar() {
  return <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-[#173f4a] px-4 py-2 text-center text-xs text-[#c2d3d3]">
    <span>Need help with a booking or have a question?</span>
    <a href={helplineTel} className="inline-flex items-center gap-1.5 font-bold text-[#d7f15e] hover:underline"><Phone className="size-3.5" />Call {HELPLINE_DISPLAY}</a>
    <a href={helplineWhatsapp('Hi ProMajdoor, I need help.')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-[#d7f15e] hover:underline"><MessageCircle className="size-3.5" />WhatsApp us</a>
  </div>
}

/** Call + WhatsApp card for inquiries, bookings and the helpline. `message` pre-fills the WhatsApp chat. */
export function HelplineCard({ title = 'Need help or have an inquiry?', text = 'Call or WhatsApp our helpline about any booking, bill or question.', message, compact }: { title?: string; text?: string; message?: string; compact?: boolean }) {
  return <div className={`rounded-2xl border border-[#d9e8c0] bg-[#f6fbe8] ${compact ? 'p-4' : 'p-5'}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#173f4a] text-[#d7f15e]"><Headphones className="size-5" /></span><div><p className="text-sm font-bold text-[#173f4a]">{title}</p>{!compact && <p className="mt-0.5 text-xs leading-5 text-[#607078]">{text}</p>}<p className="mt-0.5 text-sm font-bold tracking-wide text-[#397f68]">{HELPLINE_DISPLAY}</p></div></div>
      <div className="flex gap-2"><a href={helplineTel} className="inline-flex items-center gap-1.5 rounded-full bg-[#173f4a] px-4 py-2.5 text-xs font-bold text-white"><Phone className="size-3.5" />Call</a><a href={helplineWhatsapp(message ?? 'Hi ProMajdoor, I need help.')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-[#25a55a] px-4 py-2.5 text-xs font-bold text-white"><MessageCircle className="size-3.5" />WhatsApp</a></div>
    </div>
  </div>
}

/** Floating help button, bottom-right on every screen. */
export function FloatingHelpline() {
  const [open, setOpen] = useState(false)
  return <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-2 sm:right-6">
    {open && <div className="kw-pop w-64 rounded-2xl border border-[#e8edef] bg-white p-4 shadow-2xl">
      <p className="text-sm font-bold text-[#173f4a]">ProMajdoor helpline</p>
      <p className="mt-0.5 text-xs text-[#819096]">For bookings, bills or any question.</p>
      <p className="mt-2 text-lg font-bold tracking-wide text-[#397f68]">{HELPLINE_DISPLAY}</p>
      <div className="mt-3 flex flex-col gap-2"><a href={helplineTel} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#173f4a] py-2.5 text-xs font-bold text-white"><Phone className="size-4" />Call now</a><a href={helplineWhatsapp('Hi ProMajdoor, I need help.')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25a55a] py-2.5 text-xs font-bold text-white"><MessageCircle className="size-4" />Chat on WhatsApp</a></div>
    </div>}
    <button onClick={() => setOpen(!open)} className="kw-help-btn flex size-14 items-center justify-center rounded-full bg-[#173f4a] text-[#d7f15e] shadow-xl" aria-label={open ? 'Close help' : 'Open help'}>{open ? <X className="size-6" /> : <Headphones className="size-6" />}</button>
  </div>
}
