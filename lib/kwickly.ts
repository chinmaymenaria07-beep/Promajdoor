import { Car, Droplets, Flame, Hammer, Home, KeyRound, Siren, Smartphone, Snowflake, Sparkles, Truck, Utensils, Wrench, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

/* ───────────── core types ───────────── */

export type Role = 'customer' | 'provider' | 'admin'
export type Screen = 'home' | 'customer' | 'provider' | 'admin' | 'provider-apply' | 'profile'
export type BookingStatus = 'awaiting_assignment' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'

/* ───────────── service forms (built by admin, answered by customers) ───────────── */

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'date' | 'time' | 'yesno'
export type FormField = { key: string; label: string; type: FieldType; required: boolean; options?: string[]; placeholder?: string }
export type DetailEntry = { key: string; label: string; value: string | string[] }
export const FIELD_TYPES: [FieldType, string][] = [['text', 'Short text'], ['textarea', 'Long text'], ['number', 'Number'], ['select', 'Dropdown (pick one)'], ['multiselect', 'Checkboxes (pick many)'], ['yesno', 'Yes / No'], ['date', 'Date'], ['time', 'Time']]

/** Used when a service has no form of its own yet. */
export const GENERIC_FIELDS: FormField[] = [{ key: 'description', label: 'What needs attention?', type: 'textarea', required: true, placeholder: 'Describe the issue in detail' }]

export const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
export const detailValue = (entry: DetailEntry) => (Array.isArray(entry.value) ? entry.value.join(', ') : entry.value)
/** Plain-text summary stored in bookings.description so older screens keep working. */
export const describeDetails = (details: DetailEntry[]) =>
  details.filter((d) => detailValue(d).trim() !== '').map((d) => (d.key === 'description' ? detailValue(d) : `${d.label}: ${detailValue(d)}`)).join('\n') || 'See details'
export const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim())
export const cleanPhone = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length > 10 ? digits.slice(-10) : digits }
export const validPhone = (value: string) => /^[6-9]\d{9}$/.test(cleanPhone(value))

/* ───────────── helpline (calls + WhatsApp) ───────────── */

export const HELPLINE = '8824251921'
export const HELPLINE_DISPLAY = '88242 51921'
export const helplineTel = `tel:+91${HELPLINE}`
export const helplineWhatsapp = (message?: string) => `https://wa.me/91${HELPLINE}${message ? `?text=${encodeURIComponent(message)}` : ''}`

export type BookingRow = {
  id: number
  user_id: string
  customer_name: string
  service: string
  address: string
  phone: string
  description: string
  scheduled_at: string
  status: BookingStatus
  provider_id: string | null
  provider_name: string | null
  details: DetailEntry[] | null
  is_flash: boolean | null
  alt_phone: string | null
  maps_link: string | null
  contact_name: string | null
  visit_fee: number
  visit_provider_share: number
  visit_platform_share: number
  quote_amount: number | null
  rating: number | null
  feedback: string | null
  created_at: string
  completed_at: string | null
  updated_at: string
}

export type Booking = {
  rid: number
  code: string
  customerId: string
  customerName: string
  service: string
  address: string
  phone: string
  description: string
  scheduledAt: string
  status: BookingStatus
  providerId: string | null
  providerName: string | null
  details: DetailEntry[]
  isFlash: boolean
  altPhone: string | null
  mapsLink: string | null
  contactName: string | null
  visitFee: number
  visitProviderShare: number
  visitPlatformShare: number
  quote: number | null
  rating: number | null
  feedback: string | null
  createdAt: string
  completedAt: string | null
  updatedAt: string
}

export type Profile = { id: string; full_name: string; email: string; role: Role; available: boolean; created_at: string; phone?: string; address?: string; avatar_url?: string | null }

export type Application = {
  id: string
  user_id: string
  full_name: string
  phone: string
  email: string
  city: string
  service: string
  experience: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  business_name: string | null
  business_type: string | null
  business_address: string | null
  gst_number: string | null
  years_experience: number | null
  id_proof_type: string | null
  id_proof_number: string | null
  id_proof_path: string | null
  business_proof_type: string | null
  business_proof_path: string | null
  photo_path: string | null
  bank_holder: string | null
  bank_account: string | null
  bank_ifsc: string | null
  upi_id: string | null
  review_note: string | null
  reviewed_at: string | null
}

/* ───────────── billing + earnings types ───────────── */

export type LineKind = 'material' | 'labour' | 'other'
export type BillItem = { name: string; kind: LineKind; qty: number; price: number; tax_percent: number; amount?: number; tax?: number }
export type BillStatus = 'draft' | 'sent' | 'paid'
export type Bill = {
  id: number
  booking_id: number
  provider_id: string
  customer_id: string
  provider_name: string
  business_name: string | null
  provider_gst: string | null
  items: BillItem[]
  materials_subtotal: number
  labour_subtotal: number
  subtotal: number
  tax_total: number
  service_charge_percent: number
  service_charge: number
  total: number
  provider_earning: number
  notes: string | null
  status: BillStatus
  paid_method: string | null
  collected_by: 'platform' | 'provider' | null
  paid_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}
export type Payout = { id: number; provider_id: string; amount: number; method: string; reference: string | null; note: string | null; created_at: string }
export type ProviderItem = { id: number; provider_id: string; name: string; kind: LineKind; unit_price: number; tax_percent: number }
export type Settings = { visit_fee: number; service_charge_percent: number }
export const DEFAULT_SETTINGS: Settings = { visit_fee: 149, service_charge_percent: 20 }

export type ServiceRow = { id: number; name: string; detail: string; icon: string; active: boolean; is_flash?: boolean; form_fields?: FormField[] }

/* ───────────── booking status ───────────── */

export const STATUSES: { value: BookingStatus; label: string; tone: string }[] = [
  { value: 'awaiting_assignment', label: 'Awaiting assignment', tone: 'bg-[#fff0be] text-[#9d6e00]' },
  { value: 'assigned', label: 'Assigned', tone: 'bg-[#e5f1f5] text-[#34788b]' },
  { value: 'in_progress', label: 'In progress', tone: 'bg-[#ebe3fa] text-[#7655a5]' },
  { value: 'completed', label: 'Completed', tone: 'bg-[#e5f5ea] text-[#388157]' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bg-[#f0f2f3] text-[#738288]' },
]

export const statusInfo = (status: string) => STATUSES.find((item) => item.value === status) ?? STATUSES[0]

export const toBooking = (row: BookingRow): Booking => ({
  rid: row.id,
  code: `KV-${row.id}`,
  customerId: row.user_id,
  customerName: row.customer_name ?? '',
  service: row.service,
  address: row.address,
  phone: row.phone,
  description: row.description,
  scheduledAt: row.scheduled_at,
  status: row.status,
  providerId: row.provider_id,
  providerName: row.provider_name,
  details: Array.isArray(row.details) ? row.details : [],
  isFlash: !!row.is_flash,
  altPhone: row.alt_phone ?? null,
  mapsLink: row.maps_link ?? null,
  contactName: row.contact_name ?? null,
  visitFee: row.visit_fee,
  visitProviderShare: row.visit_provider_share ?? Math.ceil(row.visit_fee / 2),
  visitPlatformShare: row.visit_platform_share ?? row.visit_fee - Math.ceil(row.visit_fee / 2),
  quote: row.quote_amount,
  rating: row.rating,
  feedback: row.feedback,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  updatedAt: row.updated_at,
})

/* ───────────── helpers ───────────── */

export const money = (amount: number) => `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
export const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
export const formatDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const isOpen = (booking: Booking) => booking.status !== 'completed' && booking.status !== 'cancelled'
export const providerLabel = (booking: Booking) => booking.providerName ?? 'Being assigned'

export const sameDay = (iso: string | null, day: Date) => {
  if (!iso) return false
  const date = new Date(iso)
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate()
}

export const lastDays = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - (count - 1 - index))
    return day
  })

export const average = (values: (number | null)[]) => {
  const valid = values.filter((value): value is number => value != null)
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

export const normalizeRole = (raw: unknown): Role => {
  const value = String(raw ?? '').trim().toLowerCase()
  return value === 'admin' || value === 'provider' ? value : 'customer'
}

/* ───────────── billing maths (mirrors provider_save_bill in SQL; the server is the authority) ───────────── */

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const GST_RATES = [0, 5, 12, 18, 28]
export const PAYMENT_METHODS: [string, string][] = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank_transfer', 'Bank transfer'], ['other', 'Other']]
export const methodLabel = (value: string | null) => PAYMENT_METHODS.find(([key]) => key === value)?.[1] ?? value ?? '—'

export function computeBill(items: BillItem[], servicePercent: number) {
  const lines = items.map((item) => {
    const amount = round2(item.qty * item.price)
    const tax = round2((amount * item.tax_percent) / 100)
    return { ...item, amount, tax }
  })
  const materials = round2(lines.filter((l) => l.kind !== 'labour').reduce((sum, l) => sum + l.amount, 0))
  const labour = round2(lines.filter((l) => l.kind === 'labour').reduce((sum, l) => sum + l.amount, 0))
  const subtotal = round2(materials + labour)
  const tax = round2(lines.reduce((sum, l) => sum + l.tax, 0))
  const service = round2((subtotal * servicePercent) / 100)
  return { lines, materials, labour, subtotal, tax, service, total: round2(subtotal + tax + service), providerEarning: round2(subtotal + tax) }
}

export const billNumber = (bill: Pick<Bill, 'id'>) => `KV-INV-${bill.id}`
export const billStatusLabel = (status: BillStatus) => (status === 'paid' ? 'Paid' : status === 'sent' ? 'Awaiting payment' : 'Draft')

/** Visit fee (prepaid) + the work bill, if one has been sent. Drafts never count. */
export const billTotal = (booking: Booking, bill?: Bill) => booking.visitFee + (bill && bill.status !== 'draft' ? bill.total : 0)

/**
 * Who earns what on one booking.
 *  - The visit-fee split (e.g. 75 / 74) counts once the pro has started the visit.
 *  - Work: the provider earns subtotal + GST; Kwickly keeps the service charge.
 */
export function bookingEarnings(booking: Booking, bill?: Bill) {
  const visited = booking.status === 'in_progress' || booking.status === 'completed'
  const billed = !!bill && bill.status !== 'draft' && booking.status !== 'cancelled'
  const visitProvider = visited ? booking.visitProviderShare : 0
  const visitPlatform = visited ? booking.visitPlatformShare : 0
  const workProvider = billed ? bill!.provider_earning : 0
  const workPlatform = billed ? bill!.service_charge : 0
  return {
    visited,
    billed,
    visitProvider,
    visitPlatform,
    workProvider,
    workPlatform,
    provider: round2(visitProvider + workProvider),
    platform: round2(visitPlatform + workPlatform),
    gross: round2(visitProvider + visitPlatform + (billed ? bill!.total : 0)),
  }
}

/**
 * A provider's running account.
 *  balance = earned − paid out − customer money the provider collected directly (cash/UPI in hand).
 *  Positive: Kwickly owes the provider. Negative: the provider owes Kwickly its share.
 */
export function providerLedger(providerId: string, bookings: Booking[], bills: Bill[], payouts: Payout[]) {
  const billByBooking = new Map(bills.map((bill) => [bill.booking_id, bill]))
  const jobs = bookings.filter((b) => b.providerId === providerId).map((booking) => ({ booking, bill: billByBooking.get(booking.rid), ...bookingEarnings(booking, billByBooking.get(booking.rid)) }))
  const earned = round2(jobs.reduce((sum, job) => sum + job.provider, 0))
  const platform = round2(jobs.reduce((sum, job) => sum + job.platform, 0))
  const paidOut = round2(payouts.filter((p) => p.provider_id === providerId).reduce((sum, p) => sum + p.amount, 0))
  const held = round2(jobs.reduce((sum, job) => sum + (job.bill && job.bill.status === 'paid' && job.bill.collected_by === 'provider' && job.booking.status !== 'cancelled' ? job.bill.total : 0), 0))
  const invoiced = round2(jobs.reduce((sum, job) => sum + (job.billed ? job.bill!.total : 0), 0))
  return { jobs, earned, platform, paidOut, held, invoiced, balance: round2(earned - paidOut - held) }
}

export const PAYOUT_METHODS: [string, string][] = [['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['cash', 'Cash'], ['other', 'Other']]

export const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`
  const blob = new Blob([rows.map((row) => row.map(escape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Calls a Postgres function and returns an error message, or null on success. */
export async function callRpc(name: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(name, args)
  return error ? error.message : null
}

/* ───────────── services (home page + admin) ───────────── */

export const serviceStyles: Record<string, { icon: LucideIcon; tone: string; accent: string }> = {
  zap: { icon: Zap, tone: 'bg-[#fff0be] text-[#9d6e00]', accent: '#f0c84b' },
  droplets: { icon: Droplets, tone: 'bg-[#dff3f7] text-[#297c91]', accent: '#69b9c9' },
  hammer: { icon: Hammer, tone: 'bg-[#ffead8] text-[#ba6c2b]', accent: '#d08c58' },
  wrench: { icon: Wrench, tone: 'bg-[#ebe3fa] text-[#7655a5]', accent: '#9c7bd0' },
  car: { icon: Car, tone: 'bg-[#dff2ec] text-[#397f68]', accent: '#63b49a' },
  utensils: { icon: Utensils, tone: 'bg-[#f8e2e7] text-[#b55268]', accent: '#d77c90' },
  sparkles: { icon: Sparkles, tone: 'bg-[#e6f4d7] text-[#5b8a2b]', accent: '#9cc86b' },
  home: { icon: Home, tone: 'bg-[#e4e9fb] text-[#4a5fa8]', accent: '#7b8fd6' },
  snowflake: { icon: Snowflake, tone: 'bg-[#e0f1fb] text-[#2f7fa8]', accent: '#6bb8e0' },
  smartphone: { icon: Smartphone, tone: 'bg-[#efe6f8] text-[#7a4fa0]', accent: '#b08ad6' },
  truck: { icon: Truck, tone: 'bg-[#ffe9d9] text-[#b45a1f]', accent: '#e08a4f' },
  key: { icon: KeyRound, tone: 'bg-[#fff0be] text-[#9d6e00]', accent: '#e0b83a' },
  flame: { icon: Flame, tone: 'bg-[#fde3e0] text-[#b8402f]', accent: '#e0705f' },
  siren: { icon: Siren, tone: 'bg-[#fde3e0] text-[#c0392b]', accent: '#e8574a' },
}

export const SERVICE_ICON_KEYS = Object.keys(serviceStyles)

/** Used until the services table has been created / when it is empty. */
export const defaultServices: ServiceRow[] = [
  { id: 0, name: 'Electrician', detail: 'Wiring, repairs & installs', icon: 'zap', active: true },
  { id: 0, name: 'Plumbing', detail: 'Leaks, taps & pipes', icon: 'droplets', active: true },
  { id: 0, name: 'Carpentry', detail: 'Furniture & woodwork', icon: 'hammer', active: true },
  { id: 0, name: 'Mechanic', detail: 'Repairs at your door', icon: 'wrench', active: true },
  { id: 0, name: 'Car wash', detail: 'A fresh shine, at home', icon: 'car', active: true },
  { id: 0, name: 'Catering', detail: 'Events made delicious', icon: 'utensils', active: true },
]

export const toServiceCard = (service: ServiceRow) => {
  const style = serviceStyles[service.icon] ?? serviceStyles.wrench
  return { name: service.name, detail: service.detail, icon: style.icon, tone: style.tone, accent: style.accent, isFlash: !!service.is_flash, fields: service.form_fields?.length ? service.form_fields : GENERIC_FIELDS }
}

export type ServiceCard = ReturnType<typeof toServiceCard>
