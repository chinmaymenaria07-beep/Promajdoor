# ProMajdoor – billing, earnings & provider verification

## 1. Set up (5 minutes)

1. **Supabase → SQL Editor** → run `supabase/schema.sql` first if you have never run it
   (I fixed its broken `faster` placeholder → `149`), then run
   **`supabase/migration-billing-earnings.sql`** once. It is safe to run again.
2. `npm install` then `npm run build` locally to confirm it compiles, then deploy.
3. Make yourself admin if you haven't:
   `update public.profiles set role='admin' where id=(select id from auth.users where email='you@example.com');`

## 2. How the money works

| Step | Customer pays | Provider earns | ProMajdoor earns |
|---|---|---|---|
| Visit fee (prepaid) | ₹149 | ₹75 | ₹74 |
| Work bill: ₹800 items + ₹200 labour | ₹1,200 | ₹1,000 | ₹200 (20 % of items+labour) |
| **Whole job** | **₹1,349** | **₹1,075** | **₹274** |

* Fee, split and the 20 % are editable by admin: **Admin → Earnings & payouts → Pricing & commission**.
  Existing bookings / sent bills keep the numbers they were created with.
* GST is per line (0/5/12/18/28 %). The provider earns items + labour + GST; the 20 % is charged on items + labour and added on top for the customer.
* All maths is done **in the database** (`provider_save_bill`), so the browser can't tamper with totals.
* Visit-fee share is counted once the provider **starts** the job.

## 3. Flows

**Provider:** Jobs → click the customer (or "Create bill") → billing software: type or pick items
(autocomplete from "My item catalogue"), labour, GST → Send to customer. Tabs: *My jobs, Earnings, Bills, Profile*.

**Customer:** the bill appears on that request (My bookings → open) and under *My bills*, with print/PDF.

**Admin:** *Applications* (review ID + business proof, approve / reject with reason) ·
*Earnings & payouts* (platform income, every provider's earned / paid / balance, record payouts, export CSV) ·
*Orders* (open any order to see its invoice and the 75/74 split).

**Approval:** a new provider applies (ID proof, business name + proof, bank/UPI). Dashboard stays locked
("Application under review") until an admin approves; it unlocks automatically (page checks every 20 s).

## 4. Things to know

* **No online payment gateway is included** (needs your Razorpay/Stripe keys). Bills are marked *paid* by the
  provider (cash/UPI collected) or by admin. If a provider collects the money, the full bill is deducted from their
  balance, so a negative balance means *they owe ProMajdoor its share*. The "Pay ₹149 & book visit" button also does not
  charge a card yet.
* Documents are in a **private** Supabase bucket (`provider-docs`); only the owner and admins can open them.
  ID numbers are stored as text – consider restricting who has admin access.
* Existing pending applications from the old form have no documents; reject them (reason required) so people re-apply.
* I could not run `next build` in my sandbox (no network). Logic and types were checked and the money maths was
  tested against your ₹800 + ₹200 → ₹1,200 example, but please run a build and a test booking on your side.
