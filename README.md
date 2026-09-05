# Smart COD (Shopify app)

A Shopify app scaffold matching Releasit COD Form & Upsells' feature set and
admin navigation: Form Designer, Sales Booster, Fraud Prevention, Delivery
Success, Analytics, Settings & Integrations, Billing Plans.

## What's real vs what's a stub

This is a big surface area. Rather than build shallow versions of
everything, real backend logic was prioritized wherever it's meaningfully
enforceable server-side; a handful of pieces need a genuine third-party
integration (OAuth, payment gateways, actual SMS sending) and are clearly
flagged as UI-only stubs below rather than faked.

**Enforced server-side (in `api.cod-submit.tsx`)**, not just UI:
- Variant prices and bundle discounts (never trusts client-sent numbers)
- Country restriction, min/max order value
- Phone / email / IP blocklists, IP allowlist override
- Postal code exclude/allow lists
- Max-quantity-per-order blocking
- Rate limiting (1 order per phone/email/IP per X hours)
- COD fee and tax calculation
- OTP gate before order creation (`api.cod-verify-otp.tsx`)
- Draft order vs. real order creation, chosen by a setting

**Persisted and shown in the admin, but not wired to a real backend
effect** — the settings save correctly; the thing they describe doesn't
happen yet:
- SMS/WhatsApp sending (OTP codes, order/shipping/delivery messages,
  abandoned cart recovery) — needs a real provider call (Twilio/MSG91) and,
  for anything time-delayed, a scheduled job
- Google Autocomplete address validation — needs a Google Places API call
  from the storefront JS
- Google Sheets export — needs real OAuth + the Sheets API
- Pixel firing (Facebook/TikTok/GA4/etc.) — IDs are stored; nothing fires
  them client-side yet
- Partial Payments — needs a separate payment/checkout-extension
  integration
- Invisible Bot Protection — needs client-side fingerprinting + a scoring
  model
- Product/collection targeting under Visibility — stored, not yet checked
  in the submit endpoint (country and order-value limits from the same
  section *are* enforced)
- Multi-step form, A/B form versions — data model only

## Architecture

- **Admin app** — Remix + Polaris + App Bridge. Several pages use Polaris
  `Tabs` internally to group sub-features the way Releasit's own UI does
  (e.g. Fraud Prevention > User Blocking / User Verification / Partial
  Payments).
- **Storefront** — a **Theme App Extension** (`extensions/smart-cod`), an
  **app embed** (not a manually-placed block) toggled once under Online
  Store → Themes → Customize → App embeds.
- **Order creation** — looks up authoritative variant prices and
  recomputes any bundle discount server-side, then creates either a draft
  order or a real order via the Admin GraphQL API, depending on the
  "Create orders with the COD payment method" setting (General tab).
- **Database** — Prisma. SQLite for local dev; swap the `datasource`
  provider to `postgresql` for production.
- **Charts** — `recharts`, real data aggregated from `CodSubmission` rows
  (daily opens/orders/revenue, by-country and by-campaign breakdowns).
  They're compact sparklines inside the stat cards rather than full
  axis-labeled charts — expand `MiniChart` in `app._index.tsx` if you want
  the larger chart-per-metric layout from the reference screenshots.
- **Billing** — Shopify's managed Billing API. Free / Premium / Enterprise
  / Unlimited tiers matching real pricing. The Monthly/Annual toggle in the
  UI is cosmetic right now — see the comment in `shopify.server.ts` for
  what's needed to make monthly a real, separately-priced plan.

## Project layout

```
app/
  routes/
    app.tsx                    admin layout + nav + onboarding redirect
    _index.tsx                  PUBLIC marketing landing page at "/" — also
                                 handles Shopify's install-time shop-param
                                 redirect into /app (required, not optional)
    app.onboarding.tsx          3-step activation wizard (step 1 built)
    app._index.tsx               Analytics — charts, tables, submissions
    app.form-settings.tsx        Form Designer — fields, appearance, COD fee
    app.bundles.tsx              Sales Booster — Quantity/Upsells/Abandoned tabs
    app.fraud-prevention.tsx     Fraud Prevention — Blocking/Verification/Partial tabs
    app.delivery-success.tsx     Delivery Success — Address Validation/SMS tabs + queue
    app.settings.tsx             Settings & Integrations — 5 tabs (see below)
    app.billing.tsx              Billing Plans — real tiers, usage, revenue banner
    api.cod-submit.tsx           PUBLIC: storefront submits the form here
    api.cod-bundles.tsx          PUBLIC: storefront fetches active bundle offers
    api.cod-verify-otp.tsx       PUBLIC: OTP verification, then creates the order
    webhooks.*.tsx                app/uninstalled, orders/create, billing update
  shopify.server.ts             Shopify app + billing + webhook config
  db.server.ts                   Prisma client
prisma/
  schema.prisma                 data model — large; grouped by admin section
extensions/smart-cod/
  blocks/smart-cod.liquid        storefront form markup (app embed, target: body)
  assets/smart-cod.js            form logic, bundle tiers, UTM capture
  assets/smart-cod.css           styling
app/styles/
  landing.css                    styles for the public "/" landing page
```

`app.settings.tsx` tabs: **Visibility** (page/product/collection/country/
order-total targeting), **General** (form version, multi-step, order
creation mode, redirect-after-purchase, tax, custom CSS, reset buttons),
**Pixels** (CRUD for ad-platform pixel IDs), **Google Sheets** (OAuth
stub), **Partners & Integrations** (SMS provider config + a note on why
the marketplace directory itself isn't reproduced).

## Onboarding & app embed detection

New installs land on `/app/onboarding`. It detects whether the theme app
embed is actually turned on by querying the shop's main theme via the
Theme GraphQL API, reading `config/settings_data.json`, and checking for a
block whose `type` matches the extension's block handle with `disabled`
not `true` (this needs the `read_themes` scope, already in
`shopify.app.toml`). Only step 1 of the 3-step wizard is built.

## Setup

1. Install the Shopify CLI: `npm install -g @shopify/cli@latest`
2. `npm install`
3. `shopify app config link` — connects this scaffold to an app in your
   Partner Dashboard, filling in `client_id` in `shopify.app.toml`.
4. Copy `.env.example` to `.env`, fill in `SHOPIFY_API_KEY` /
   `SHOPIFY_API_SECRET` / `SHOPIFY_APP_URL`.
5. `npx prisma migrate dev --name init`.
6. Set up the **App Proxy** (prefix `apps`, subpath `cod`, URL
   `<app url>/api`) — stubbed in `shopify.app.toml`, replace the
   placeholder URL.
7. `npm run dev`.
8. In the dev store's theme editor: Online Store → Themes → Customize →
   App embeds → turn on "Smart COD".

## Deploying to Vercel

This scaffold now builds on Vercel, but a few things differ from a normal
Node host:

- **Database must be Postgres**, not SQLite — `prisma/schema.prisma` is
  already set to `provider = "postgresql"`. Provision one (Vercel
  Postgres, Neon, Supabase, Railway — any of these work) and set
  `DATABASE_URL` in your Vercel project's environment variables to its
  connection string.
- **Run migrations against that database** before or during first deploy:
  `npx prisma migrate deploy` (from your machine, pointed at the
  production `DATABASE_URL`, or as a one-off Vercel deploy step).
- `vite.config.ts` only applies the `@vercel/remix` serverless preset when
  the `VERCEL` environment variable is set (Vercel sets this
  automatically) — building locally or on another host is unaffected.
- If your build fails with `Missing "root" route file in /vercel/path0/app`,
  it means Vercel's "Root Directory" project setting (Settings > General)
  doesn't point at the folder that directly contains `package.json` and
  `app/`. Check that `app/root.tsx` actually shows up in your repo on
  GitHub at the path you expect — a common cause is an extra wrapper
  folder introduced when unzipping/committing.
- Session storage (`PrismaSessionStorage`) and all the app's own data live
  in the same Postgres database — no separate setup needed once
  `DATABASE_URL` points at it.

## Biggest next steps if you keep building this

1. **A real scheduler.** Abandoned cart recovery, delivery reminders, and
   anything else time-delayed all need one (Shopify apps typically use a
   cron-triggered route hit by an external scheduler, or a queue). Nothing
   in this scaffold runs on a timer.
2. **An SMS provider adapter.** One function — `sendSms(to, text)` — that
   the OTP flow, delivery messages, and abandoned cart recovery all call,
   backed by whichever provider's API key is saved under Settings >
   Partners & Integrations.
3. **Client-side pixel firing.** A public GET endpoint returning active
   `PixelIntegration` rows, called once by `smart-cod.js`, dispatching to
   `fbq()`/`gtag()`/etc. on submit.
4. Wiring product/collection Visibility rules into `api.cod-submit.tsx`
   (the pattern already exists there for country/order-value — same
   shape).

## Cost / distribution note

Building this is the easy part — Releasit's real moat is 100k+ installs,
support responsiveness, and years of edge-case handling. If the goal is
revenue rather than a learning project, a narrower niche is usually more
winnable than competing head-on with the full feature set.
