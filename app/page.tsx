'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { Home, Menu, Sparkles, UserRound, X } from 'lucide-react'
import { HomeHero } from '@/components/kwickly/home-hero'
import { FlashServices, ServiceGrid } from '@/components/kwickly/service-grid'
import { BookingModal } from '@/components/kwickly/booking-modal'
import type { BookingPayload } from '@/components/kwickly/booking-modal'
import { Avatar, ProfileScreen } from '@/components/kwickly/profile'
import type { MyProfile } from '@/components/kwickly/profile'
import { FloatingHelpline, HelplineBar } from '@/components/kwickly/helpline'
import { HomeSections } from '@/components/kwickly/home-sections'
import { ProviderApply } from '@/components/kwickly/provider-apply'
import { AdminDashboard, CustomerDashboard, ProviderDashboard } from '@/components/kwickly/dashboards'
import { DEFAULT_SETTINGS, callRpc, cleanPhone, defaultServices, normalizeRole, toBooking, toServiceCard, validPhone } from '@/lib/kwickly'
import type { Application, Bill, Booking, BookingRow, Payout, Role, Screen, ServiceCard, ServiceRow, Settings } from '@/lib/kwickly'

const EMPTY_PROFILE: MyProfile = { role: 'customer', available: true, name: '', phone: '', address: '', avatarUrl: null }

export default function Page() {
  const [screen, setScreen] = useState<Screen>('home')
  const [profile, setProfile] = useState<MyProfile>(EMPTY_PROFILE)
  const [profileReady, setProfileReady] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [search, setSearch] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [myApplication, setMyApplication] = useState<Application | null>(null)
  const lastAppStatus = useRef<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  const userId = session?.user.id

  const cards = useMemo<ServiceCard[]>(() => (serviceRows.length ? serviceRows.filter((s) => s.active) : defaultServices).map(toServiceCard), [serviceRows])
  const filtered = useMemo(() => cards.filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(search.toLowerCase())), [cards, search])
  const firstName = (profile.name || String(session?.user.user_metadata?.full_name ?? '')).split(' ')[0]

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  const go = (next: Screen) => { setScreen(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const openAuth = (mode: 'login' | 'signup') => { setAuthMode(mode); setAuthOpen(true) }

  /* ───────── data loading ───────── */

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  const loadServices = useCallback(async () => {
    const { data, error } = await supabase.from('services').select('*').order('id')
    if (!error && data) setServiceRows(data as ServiceRow[])
  }, [])

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('platform_settings').select('visit_fee, service_charge_percent').eq('id', 1).maybeSingle()
    if (data) setSettings({ visit_fee: Number(data.visit_fee), service_charge_percent: Number(data.service_charge_percent) })
  }, [])

  // Bookings + the bills and payouts that belong to them (row-level security decides what each role may see).
  const loadBookings = useCallback(async () => {
    const [bookingRes, billRes, payoutRes] = await Promise.all([
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('bills').select('*').order('created_at', { ascending: false }),
      supabase.from('payouts').select('*').order('created_at', { ascending: false }),
    ])
    if (bookingRes.error) { console.error('Could not load bookings:', bookingRes.error); return }
    setBookings(((bookingRes.data ?? []) as BookingRow[]).map(toBooking))
    // Until the billing migration has been run these tables do not exist; the app keeps working without them.
    if (billRes.error) console.warn('Bills unavailable (run supabase/migration-billing-earnings.sql):', billRes.error.message)
    else setBills(((billRes.data ?? []) as Bill[]).map((bill) => ({
      ...bill,
      materials_subtotal: Number(bill.materials_subtotal), labour_subtotal: Number(bill.labour_subtotal), subtotal: Number(bill.subtotal),
      tax_total: Number(bill.tax_total), service_charge_percent: Number(bill.service_charge_percent), service_charge: Number(bill.service_charge),
      total: Number(bill.total), provider_earning: Number(bill.provider_earning), items: Array.isArray(bill.items) ? bill.items : [],
    })))
    if (!payoutRes.error) setPayouts(((payoutRes.data ?? []) as Payout[]).map((payout) => ({ ...payout, amount: Number(payout.amount) })))
  }, [])

  const loadProfile = useCallback(async (uid: string): Promise<Role> => {
    let res: { data: any; error: any } = await supabase.from('profiles').select('role, available, full_name, phone, address, avatar_url').eq('id', uid).maybeSingle()
    // Before the profile migration has been run these columns do not exist yet: fall back to the basic fields.
    if (res.error) res = await supabase.from('profiles').select('role, available, full_name').eq('id', uid).maybeSingle()
    const { data, error } = res
    if (error) {
      console.error('Could not read profile:', error)
      notify(`Could not read your role: ${error.message}`)
    } else if (!data) {
      console.error('No row in public.profiles for user', uid)
      notify('No profile found for this account (public.profiles).')
    }
    const role = normalizeRole(data?.role)
    setProfile({ role, available: data?.available ?? true, name: data?.full_name ?? '', phone: data?.phone ?? '', address: data?.address ?? '', avatarUrl: data?.avatar_url ?? null })
    setProfileReady(true)
    return role
  }, [notify])

  useEffect(() => { loadServices(); loadSettings() }, [loadServices, loadSettings, userId])

  const loadMyApplication = useCallback(async (uid: string) => {
    const { data } = await supabase.from('provider_applications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const next = (data as Application | null) ?? null
    if (lastAppStatus.current === 'pending' && next?.status === 'approved') notify('🎉 Your provider application was approved. Your dashboard is now active!')
    if (lastAppStatus.current === 'pending' && next?.status === 'rejected') notify('Your provider application needs changes. Open “Application status” for details.')
    lastAppStatus.current = next?.status ?? null
    setMyApplication(next)
  }, [notify])

  useEffect(() => {
    if (!userId) { setBookings([]); setBills([]); setPayouts([]); setMyApplication(null); lastAppStatus.current = null; setProfile(EMPTY_PROFILE); setProfileReady(false); return }
    loadBookings()
    loadProfile(userId)
    loadMyApplication(userId)
  }, [userId, loadBookings, loadProfile, loadMyApplication])

  // While an application is waiting, check for the admin's decision so the dashboard unlocks without a refresh.
  useEffect(() => {
    if (!userId || profile.role !== 'customer' || myApplication?.status !== 'pending') return
    const timer = window.setInterval(() => { loadMyApplication(userId); loadProfile(userId) }, 20000)
    return () => window.clearInterval(timer)
  }, [userId, profile.role, myApplication?.status, loadMyApplication, loadProfile])

  // Live status updates: realtime when enabled, plus a light refresh as a safety net
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`bookings-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => { loadBookings() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => { loadBookings() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, () => { loadBookings() })
      .subscribe()
    const timer = window.setInterval(loadBookings, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') loadBookings() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      supabase.removeChannel(channel)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, loadBookings])

  // Signed out (or session expired) while on a dashboard
  useEffect(() => {
    if (!session && (screen === 'customer' || screen === 'provider' || screen === 'admin' || screen === 'profile')) setScreen('home')
  }, [session, screen])

  /* ───────── actions ───────── */

  const openBooking = (service = '') => {
    if (!session) { openAuth('login'); notify('Please log in before booking a service'); return }
    if (!profileReady) { notify('Loading your profile… please try again in a moment'); return }
    if (!validPhone(profile.phone)) { notify('Please add your mobile number to your profile before booking'); go('profile'); return }
    setSelectedService(service)
    setBookingOpen(true)
  }

  /** Returns the new booking number, or null when it could not be created. */
  const createBooking = async (form: BookingPayload): Promise<number | null> => {
    const when = new Date()
    if (form.slot === 'today') {
      when.setHours(16, 30, 0, 0)
      if (when.getTime() < Date.now()) when.setTime(Date.now() + 60 * 60 * 1000)
    } else if (form.slot === 'tomorrow') {
      when.setDate(when.getDate() + 1)
      when.setHours(10, 0, 0, 0)
    } // 'asap' (flash) keeps "now"
    const { data, error } = await supabase.from('bookings').insert({
      service: form.service, address: form.address, phone: form.phone, description: form.description, scheduled_at: when.toISOString(),
      details: form.details, alt_phone: form.altPhone, maps_link: form.mapsLink, contact_name: form.contactName,
    }).select('id').single()
    if (error) { notify(error.message.includes('details') || error.message.includes('alt_phone') ? 'Run supabase/migration-forms-flash-profiles.sql in Supabase, then try again' : `We could not create your booking: ${error.message}`); return null }
    await loadBookings()
    notify(form.slot === 'asap' ? 'Flash request sent' : 'Booking request created')
    return data.id as number
  }

  const setAvailability = async (next: boolean) => {
    const error = await callRpc('set_my_availability', { p_available: next })
    if (error) { notify(error); return }
    setProfile((current) => ({ ...current, available: next }))
    notify(next ? 'You are now available for work' : 'You are marked as unavailable')
  }

  const signOut = async () => { await supabase.auth.signOut(); go('home') }

  const routeAfterAuth = async (signedInId?: string, wantsProvider?: boolean) => {
    setAuthOpen(false)
    const uid = signedInId ?? (await supabase.auth.getUser()).data.user?.id
    if (!uid) return
    const role = await loadProfile(uid)
    if (wantsProvider && role === 'customer') {
      notify('Account created. Complete your provider application to get started.')
      go('provider-apply')
      return
    }
    go(role)
  }

  /* ───────── render ───────── */

  return <main className="min-h-screen overflow-hidden bg-[#f7f8fa] text-[#14212b]">
    <HelplineBar />
    <div className="mx-auto max-w-[1440px] px-5 pb-10 sm:px-8 lg:px-12">
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} go={go} signedIn={!!session} applyLabel={profile.role === 'provider' ? 'Provider dashboard' : myApplication ? 'Application status' : 'Become a provider'} onDashboard={() => go(profile.role)} onProfile={() => go('profile')} avatar={{ url: profile.avatarUrl, name: profile.name, email: session?.user.email ?? '' }} onSignOut={signOut} onAuth={openAuth} />
      {screen === 'home' && <ModularHome search={search} setSearch={setSearch} filtered={filtered} visitFee={settings.visit_fee} openBooking={openBooking} go={go} notify={notify} />}
      {screen === 'profile' && userId && <ProfileScreen key={`${profile.name}-${profile.phone}-${profile.address}-${profile.avatarUrl}`} userId={userId} email={session?.user.email ?? ''} profile={profile} notify={notify} go={go} onSaved={async () => { await loadProfile(userId); await loadBookings() }} />}
      {screen === 'customer' && userId && <CustomerDashboard name={firstName} userId={userId} bookings={bookings} bills={bills} go={go} openBooking={openBooking} notify={notify} reload={loadBookings} />}
      {screen === 'provider' && userId && profile.role === 'provider' && <ProviderDashboard userId={userId} bookings={bookings} bills={bills} payouts={payouts} settings={settings} available={profile.available} onAvailability={setAvailability} go={go} notify={notify} reload={loadBookings} />}
      {screen === 'admin' && userId && profile.role === 'admin' && <AdminDashboard userId={userId} bookings={bookings} bills={bills} payouts={payouts} settings={settings} services={serviceRows} go={go} notify={notify} reload={loadBookings} reloadServices={loadServices} reloadSettings={loadSettings} />}
      {screen === 'provider-apply' && <ProviderApply notify={notify} go={go} userId={userId} role={profile.role} application={myApplication} services={cards.map((c) => c.name)} defaultName={profile.name || String(session?.user.user_metadata?.full_name ?? '')} defaultEmail={session?.user.email ?? ''} defaultPhone={profile.phone} onNeedLogin={() => { openAuth('login'); notify('Please log in to apply as a provider') }} onSubmitted={async () => { if (userId) await loadMyApplication(userId) }} />}
      <footer className="mt-14 flex flex-col gap-3 border-t border-[#e2e8e9] pt-6 text-xs text-[#87959a] sm:flex-row sm:items-center sm:justify-between"><span>© 2026 ProMajdoor Services. Made for faster living.</span><span className="flex items-center gap-2"><Home className="size-3" /> Trusted help, right at your door.</span></footer>
    </div>
    {bookingOpen && <BookingModal visitFee={settings.visit_fee} selectedService={selectedService} services={cards} defaults={{ name: profile.name, phone: profile.phone, address: profile.address }} close={() => setBookingOpen(false)} createBooking={createBooking} onEditProfile={() => { setBookingOpen(false); go('profile') }} />}
    {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} close={() => setAuthOpen(false)} onSuccess={routeAfterAuth} />}
    <FloatingHelpline />
    {toast && <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#173f4a] px-5 py-3 text-sm font-semibold text-white shadow-xl" role="status">{toast}</div>}
  </main>
}

function Header({ menuOpen, setMenuOpen, go, onAuth, signedIn, onDashboard, onSignOut, applyLabel, onProfile, avatar }: { applyLabel: string; onProfile: () => void; avatar: { url: string | null; name: string; email: string }; menuOpen: boolean; setMenuOpen: (value: boolean) => void; go: (screen: Screen) => void; onAuth: (mode: 'login' | 'signup') => void; signedIn: boolean; onDashboard: () => void; onSignOut: () => void }) {
  return <header className="flex h-20 items-center justify-between"><button
  onClick={() => go('home')}
  className="flex items-center gap-3"
  aria-label="ProMajdoor home"
>
  <img
    src="/promajdoor.png"
    alt="ProMajdoor Logo"
    className="h-12 w-12 rounded-xl object-contain"
  />

  <span className="text-[23px] font-extrabold tracking-[-.05em] text-[#173f4a]">
    ProMajdoor<span className="text-[#b3d347]">.</span>
  </span>
</button><nav className="hidden items-center gap-7 text-sm font-medium text-[#607078] md:flex"><button onClick={() => go('home')}>Explore services</button><button onClick={() => go('home')}>How it works</button><button onClick={() => go('provider-apply')}>{applyLabel}</button></nav><div className="flex items-center gap-2">{signedIn ? <><button onClick={onProfile} className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-[#40525a] hover:bg-white sm:flex" aria-label="My profile"><Avatar url={avatar.url} name={avatar.name} email={avatar.email} size="size-9" />{(avatar.name || 'Profile').split(' ')[0]}</button><button onClick={onSignOut} className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-[#40525a] sm:block">Log out</button><button onClick={onDashboard} className="hidden rounded-full bg-[#173f4a] px-4 py-2.5 text-sm font-bold text-white shadow-sm sm:block">My dashboard</button></> : <><button onClick={() => onAuth('login')} className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-[#40525a] sm:block">Log in</button><button onClick={() => onAuth('signup')} className="hidden rounded-full bg-[#173f4a] px-4 py-2.5 text-sm font-bold text-white shadow-sm sm:block">Create account</button></>}<button onClick={() => setMenuOpen(!menuOpen)} className="flex size-10 items-center justify-center rounded-full bg-[#173f4a] text-white md:hidden" aria-label="Toggle navigation">{menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button></div>{menuOpen && <div className="absolute right-5 top-16 z-30 flex w-56 flex-col gap-2 rounded-2xl bg-white p-4 shadow-2xl md:hidden"><button className="rounded-xl p-3 text-left text-sm font-semibold" onClick={() => go('home')}>Explore services</button><button className="rounded-xl p-3 text-left text-sm font-semibold" onClick={() => go('provider-apply')}>{applyLabel}</button>{signedIn ? <><button className="flex items-center gap-2 rounded-xl p-3 text-left text-sm font-semibold" onClick={onProfile}><UserRound className="size-4" />My profile</button><button className="rounded-xl p-3 text-left text-sm font-semibold" onClick={onSignOut}>Log out</button><button className="rounded-xl bg-[#173f4a] p-3 text-left text-sm font-semibold text-white" onClick={onDashboard}>My dashboard</button></> : <><button className="rounded-xl p-3 text-left text-sm font-semibold" onClick={() => onAuth('login')}>Log in</button><button className="rounded-xl bg-[#173f4a] p-3 text-left text-sm font-semibold text-white" onClick={() => onAuth('signup')}>Create account</button></>}</div>}</header>
}

function ModularHome({ search, setSearch, filtered, visitFee, openBooking, go, notify }: { visitFee: number; search: string; setSearch: (value: string) => void; filtered: ServiceCard[]; openBooking: (service?: string) => void; go: (screen: Screen) => void; notify: (message: string) => void }) {
  return <>
    <HomeHero search={search} onSearch={setSearch} onExplore={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })} />
    <FlashServices services={filtered.filter((s) => s.isFlash)} onSelect={openBooking} />
    <ServiceGrid services={filtered.filter((s) => !s.isFlash)} onSelect={openBooking} visitFee={visitFee} />
    <HomeSections onProvider={() => go('provider-apply')} onNotify={notify} />
  </>
}

function Field({ label, name, placeholder, type = 'text', minLength, value, onChange }: { label: string; name: string; placeholder: string; type?: string; minLength?: number; value?: string; onChange?: (value: string) => void }) {
  const controlled = onChange ? { value: value ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value) } : {}
  return <label className="flex flex-col gap-2 text-sm font-semibold text-[#29434b]">{label}<input required name={name} type={type} minLength={minLength} placeholder={placeholder} {...controlled} className="rounded-2xl border border-[#dce3e4] px-4 py-3.5 font-normal outline-none focus:border-[#397f68]" /></label>
}

function AuthModal({ mode, setMode, close, onSuccess }: { mode: 'login' | 'signup'; setMode: (mode: 'login' | 'signup') => void; close: () => void; onSuccess: (userId?: string, wantsProvider?: boolean) => void }) {
  const [selectedRole, setSelectedRole] = useState<Role>('customer')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)

  const showTerms = () => {
    window.alert(
      'ProMajdoor Terms & Conditions\n\n' +
      '1. Account responsibility: Provide accurate account details and keep your login credentials secure.\n\n' +
      '2. Marketplace services: ProMajdoor helps customers connect with independent service providers. Service availability, timing and scope depend on the selected provider and booking details.\n\n' +
      '3. Booking and pricing: Review any visit fee, estimate or quote shown before confirming. Additional work or charges should be agreed with you before the work proceeds.\n\n' +
      '4. Providers: Providers must submit accurate professional information, perform accepted work responsibly and follow applicable laws and marketplace standards.\n\n' +
      '5. Cancellations and disputes: Booking changes, cancellations, refunds, complaints and service issues are handled under the policies communicated by ProMajdoor for the relevant booking.\n\n' +
      '6. Acceptable use: Do not misuse the platform, submit misleading information, harass other users or attempt unauthorized access.\n\n' +
      '7. Privacy: ProMajdoor uses account and booking information to operate the marketplace, support users and improve the service. Refer to the Privacy Policy for details.\n\n' +
      '8. Platform availability: Features may change, and the platform may occasionally be unavailable for maintenance or security reasons.\n\n' +
      'By creating an account, you confirm that you have read and agree to these terms and the applicable privacy policy.'
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mode === 'signup' && !termsAccepted) {
      window.alert('Please accept the Terms & Conditions and Privacy Policy to create your account.')
      return
    }

    const values = new FormData(event.currentTarget)
    const email = String(values.get('email') ?? '')
    const password = String(values.get('password') ?? '')
    const name = String(values.get('name') ?? '')
    const phone = String(values.get('phone') ?? '')
    if (mode === 'signup' && !validPhone(phone)) { window.alert('Please enter a valid 10-digit mobile number.'); return }

    setLoading(true)
    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) { window.alert(error.message); return }
      onSuccess(data.user?.id)
      return
    }

    // Everyone starts as a customer. Choosing "provider" sends them to the application form,
    // and an admin approves providers.
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name, phone: cleanPhone(phone) } } })
    setLoading(false)
    if (error) { window.alert(error.message); return }
    if (!data.session) {
      window.alert('Check your email to confirm your account, then log in.')
      setMode('login')
      return
    }
    onSuccess(data.user?.id, selectedRole === 'provider')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f36]/60 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl sm:p-9">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#8a9a9e]">Welcome to ProMajdoor</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-.05em] text-[#173f4a]">
              {mode === 'login' ? 'Log in to continue' : 'Create your account'}
            </h2>
          </div>
          <button onClick={close} className="flex size-9 items-center justify-center rounded-full bg-[#f2f5f5]" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
          {mode === 'signup' && (
            <div className="grid grid-cols-2 gap-2">
              {(['customer', 'provider'] as Role[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setSelectedRole(item)}
                  className={`rounded-xl border px-2 py-3 text-xs font-bold capitalize ${
                    selectedRole === item
                      ? 'border-[#173f4a] bg-[#173f4a] text-white'
                      : 'border-[#dce3e4] text-[#607078]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          {mode === 'signup' && <Field label="Full name" name="name" placeholder="Your name" />}
          {mode === 'signup' && <Field label="Mobile number" name="phone" placeholder="10-digit mobile number" type="tel" />}
          <Field label="Email address" name="email" placeholder="you@example.com" type="email" />
          <Field label="Password" name="password" placeholder="At least 8 characters" type="password" minLength={8} />

          {mode === 'signup' && (
            <label className="mt-1 flex items-start gap-2.5 text-xs leading-5 text-[#819096]">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => setTermsAccepted(event.target.checked)}
                className="mt-1 size-4 shrink-0 accent-[#397f68]"
                required
              />
              <span>
                I agree to ProMajdoor&apos;s{' '}
                <button
                  type="button"
                  onClick={showTerms}
                  className="font-bold text-[#34788b] underline underline-offset-2"
                >
                  Terms &amp; Conditions
                </button>{' '}
                and acknowledge the Privacy Policy. I understand ProMajdoor connects customers with independent service providers.
              </span>
            </label>
          )}

          <button disabled={loading} className="mt-2 rounded-2xl bg-[#173f4a] py-4 text-sm font-bold text-white disabled:opacity-60">
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in securely' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#819096]">
          {mode === 'login' ? 'New to ProMajdoor?' : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setTermsAccepted(false)
            }}
            className="font-bold text-[#397f68]"
          >
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}
