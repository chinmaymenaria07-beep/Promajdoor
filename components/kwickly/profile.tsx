'use client'

import { useState } from 'react'
import { Camera, Mail, MapPin, Phone, ShieldCheck, Trash2, User } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { callRpc, cleanPhone, validPhone } from '@/lib/kwickly'
import type { Role, Screen } from '@/lib/kwickly'
import { HelplineCard } from './helpline'

export type MyProfile = { role: Role; available: boolean; name: string; phone: string; address: string; avatarUrl: string | null }

const box = 'w-full rounded-2xl border border-[#dce3e4] bg-white px-4 py-3.5 text-sm font-normal outline-none focus:border-[#397f68]'
const labelCls = 'flex flex-col gap-2 text-sm font-semibold text-[#29434b]'

export const initials = (name: string, email = '') => (name || email || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'

export function Avatar({ url, name, email, size = 'size-10', text = 'text-xs' }: { url: string | null; name: string; email?: string; size?: string; text?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={name || 'Profile photo'} className={`${size} shrink-0 rounded-full object-cover`} /> : <span className={`flex ${size} ${text} shrink-0 items-center justify-center rounded-full bg-[#dceab2] font-bold text-[#173f4a]`}>{initials(name, email)}</span>
}

export function ProfileScreen({ userId, email, profile, notify, go, onSaved }: { userId: string; email: string; profile: MyProfile; notify: (message: string) => void; go: (screen: Screen) => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.name)
  const [phone, setPhone] = useState(profile.phone)
  const [address, setAddress] = useState(profile.address)
  const [avatar, setAvatar] = useState<string | null>(profile.avatarUrl)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = name !== profile.name || phone !== profile.phone || address !== profile.address || avatar !== profile.avatarUrl

  const pickPhoto = async (file: File | null) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { notify('Please choose a JPG, PNG or WEBP photo'); return }
    if (file.size > 2 * 1024 * 1024) { notify('The photo must be smaller than 2 MB'); return }
    setUploading(true)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/avatar-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false })
    setUploading(false)
    if (error) { notify(`Could not upload the photo: ${error.message}`); return }
    setAvatar(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl)
    notify('Photo ready — press Save changes to keep it')
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (name.trim().length < 2) { notify('Please enter your name'); return }
    if (!validPhone(phone)) { notify('Enter a valid 10-digit mobile number'); return }
    setSaving(true)
    const error = await callRpc('update_my_profile', { p_name: name, p_phone: cleanPhone(phone), p_address: address, p_avatar: avatar })
    setSaving(false)
    if (error) { notify(/update_my_profile|schema cache/i.test(error) ? 'Run supabase/migration-forms-flash-profiles.sql in Supabase first' : error); return }
    notify('Profile saved')
    await onSaved()
  }

  return <section className="mt-3 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
    <div className="rounded-[30px] bg-[#173f4a] p-8 text-white sm:p-10">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#d7f15e]">My profile</p>
      <div className="mt-6 flex flex-col items-center text-center">
        <div className="relative"><Avatar url={avatar} name={name} email={email} size="size-28" text="text-3xl" />
          <label className="absolute -bottom-1 -right-1 flex size-10 cursor-pointer items-center justify-center rounded-full bg-[#d7f15e] text-[#173f4a] shadow-lg" title="Change photo"><Camera className="size-5" /><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { pickPhoto(e.target.files?.[0] ?? null); e.target.value = '' }} /></label></div>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-.03em]">{name || 'Your name'}</h1>
        <p className="mt-1 text-sm text-[#c2d3d3]">{email}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold capitalize text-[#d7f15e]"><ShieldCheck className="size-3.5" />{profile.role}</span>
        {uploading && <p className="mt-3 text-xs text-[#c2d3d3]">Uploading photo…</p>}
        {avatar && <button type="button" onClick={() => setAvatar(null)} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#c2d3d3] hover:text-white"><Trash2 className="size-3.5" />Remove photo</button>}
      </div>
      <p className="mt-8 rounded-2xl bg-white/10 p-4 text-xs leading-5 text-[#c2d3d3]">Your mobile number and address are used to fill every booking form for you. You can still change them for a single booking without touching your profile.</p>
    </div>

    <div className="flex flex-col gap-5">
      <form onSubmit={save} className="rounded-[30px] border border-[#e8edef] bg-white p-7 shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[.16em] text-[#8a9a9e]">Personal details</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-.04em] text-[#173f4a]">Keep your details up to date</h2>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}><span className="flex items-center gap-2"><User className="size-4 text-[#397f68]" />Full name</span><input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={box} /></label>
          <label className={labelCls}><span className="flex items-center gap-2"><Phone className="size-4 text-[#397f68]" />Mobile number</span><input required type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" className={box} /></label>
          <label className={`${labelCls} sm:col-span-2`}><span className="flex items-center gap-2"><Mail className="size-4 text-[#397f68]" />Email</span><input value={email} disabled className={`${box} bg-[#f7f8fa] text-[#819096]`} /></label>
          <label className={`${labelCls} sm:col-span-2`}><span className="flex items-center gap-2"><MapPin className="size-4 text-[#397f68]" />Default address</span><textarea value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} placeholder="Flat / house no., building, street, area, landmark" className={`${box} min-h-28`} /></label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3"><button disabled={saving || uploading || !dirty} className="rounded-2xl bg-[#173f4a] px-8 py-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => go(profile.role === 'customer' || profile.role === 'provider' || profile.role === 'admin' ? profile.role : 'home')} className="rounded-2xl border border-[#dce3e4] px-6 py-4 text-sm font-bold text-[#40525a]">Back to dashboard</button></div>
        {profile.role === 'provider' && <p className="mt-5 text-xs leading-5 text-[#819096]">Business name, GST, ID and payout details were verified by our team. To change those, contact the helpline.</p>}
      </form>
      <HelplineCard message="Hi ProMajdoor, I need help with my account." />
    </div>
  </section>
}
