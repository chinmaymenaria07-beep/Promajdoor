# ProMajdoor – service forms, Flash services, profiles & helpline

## Run order in Supabase → SQL Editor
1. `supabase/schema.sql` (only if you never ran it)
2. `supabase/migration-billing-earnings.sql`
3. **`supabase/migration-forms-flash-profiles.sql`** ← new, safe to re-run (it never overwrites forms an admin edited)

## What's new
* **A separate booking form per service.** Electrician, Plumbing, Carpentry, Mechanic, Car wash and Catering each ask
  their own questions (work type, vehicle make/model, event date + guests, …). Required questions are enforced by the
  database too. The answers are shown to the provider/admin on the booking.
* **Flash services** – an emergency section on the home page (Emergency electrician, Emergency plumber, Vehicle
  breakdown SOS, Lockout help are seeded). Flash bookings need no time slot, are flagged ⚡ for admin and provider,
  float to the top of the orders list, and trigger a red banner + "urgent review" alert in the admin panel.
  The flag is set by the server from the service, so customers cannot fake it.
* **Admin → Services**: create, edit, hide and delete services; pick an icon; tick "Flash"; build the booking form
  (text, long text, number, dropdown, checkboxes, yes/no, date, time; required or optional; reorder; live preview).
* **Mobile number is asked at sign-up**, not at booking. Booking contact details come from the profile and can be changed
  for one booking only; an optional alternate mobile and a Google Maps link ("Use my location" button) can be added.
  Existing users without a number are sent to their profile the first time they book.
* **Profile screen** for customers, providers and admins: name, mobile, default address, photo (header avatar → My profile).
* **Helpline 8824251921**: top strip on every page, floating Call/WhatsApp button, Flash section, booking confirmation,
  every booking's detail window (WhatsApp message pre-filled with the booking number), customer help tab,
  provider dashboard and profile page.
* Redesigned service cards (staggered entrance, hover lift, colour glow, icon wiggle, animated "Book now") and a
  pulsing red Flash panel. Animations switch off for people who prefer reduced motion.

## Notes
* To change the helpline number, edit `HELPLINE` / `HELPLINE_DISPLAY` in `lib/ProMajdoor.ts`.
* Profile photos go to a public `avatars` bucket (max 2 MB). Provider KYC documents remain private.
* Deleting a service does not delete old bookings; they keep their answers.
* Not run in my sandbox: `next build` and the SQL against a live Postgres (no network). Types and logic were checked with
  stubs. Please run the three SQL files in order and test one normal and one flash booking.
