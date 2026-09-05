import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import landingStyles from "../styles/landing.css?url";

export const links = () => [{ rel: "stylesheet", href: landingStyles }];

// Shopify hits "/" with a ?shop= param both when a merchant clicks
// "Install" from the App Store and on subsequent visits before the OAuth
// session is established. That must redirect into the embedded app (which
// triggers the auth flow) rather than show marketing copy — otherwise the
// app fails Shopify's automated review.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return json({
    appStoreUrl: process.env.SHOPIFY_APP_STORE_URL || "#",
  });
};

const FEATURES = [
  { icon: "📝", title: "Form Designer", body: "A drag-and-reorder Cash on Delivery order form with custom fields, colors, and a buy button — no theme code required." },
  { icon: "📈", title: "Sales Booster", body: "Quantity offers, upsells & downsells, and abandoned-cart recovery, built to appear right on the COD form itself." },
  { icon: "🛡️", title: "Fraud Prevention", body: "Rate limiting, phone/email/IP blocklists, postal code rules, and OTP verification — enforced server-side, not just on the surface." },
  { icon: "📦", title: "Delivery Success", body: "Address autocomplete and SMS/WhatsApp confirmations that cut refused-at-the-door returns (RTO)." },
  { icon: "📊", title: "Analytics", body: "Form opens, orders, revenue, and conversion rate — broken down by country and campaign." },
  { icon: "⚙️", title: "Settings & Integrations", body: "Fine-grained visibility rules, tax handling, ad pixels, and Google Sheets export, all in one place." },
];

const PLANS = [
  { name: "Free", price: "Free", sub: "100 orders/month", features: ["Original form design", "Basic fraud prevention", "Analytics dashboard"] },
  { name: "Premium", price: "$89.99", sub: "/year — 420 orders/month", features: ["Everything in Free", "Quantity offers", "Advanced fraud prevention"], highlight: true },
  { name: "Enterprise", price: "$269.99", sub: "/year — 10,000 orders/month", features: ["Everything in Premium", "Custom code assistance", "Priority support"] },
  { name: "Unlimited", price: "$629.99", sub: "/year — unlimited orders", features: ["Everything in Enterprise", "A/B testing", "Multiple form versions"] },
];

const FAQS = [
  { q: "Does this replace Shopify checkout?", a: "No — it adds a lightweight Cash on Delivery form on your product and cart pages as an alternative path to purchase, alongside your normal checkout." },
  { q: "Which markets is this built for?", a: "Anywhere COD is a common payment method — commonly India, the Middle East, and Latin America — but it works on any store that wants to offer COD." },
  { q: "Can I try it before paying?", a: "Yes, the Free plan covers up to 100 orders a month with no time limit." },
  { q: "Do I need to edit my theme?", a: "No. Smart COD installs as a theme app embed — toggle it on once from the theme editor and it's live." },
];

export default function Landing() {
  const { appStoreUrl } = useLoaderData<typeof loader>();

  return (
    <div className="sc-landing">
      <div className="sc-container">
        <nav className="sc-nav">
          <div className="sc-logo">
            <span className="sc-logo-badge">SC</span>
            Smart COD
          </div>
          <div className="sc-nav-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <a className="sc-btn sc-btn-primary" href={appStoreUrl}>
            Install on Shopify
          </a>
        </nav>

        <header className="sc-hero">
          <span className="sc-eyebrow">Built for Cash on Delivery stores</span>
          <h1>Turn more Cash on Delivery visitors into orders</h1>
          <p>
            A customizable COD order form, quantity offers, and fraud
            prevention — built into your product and cart pages, no
            checkout changes required.
          </p>
          <div className="sc-hero-ctas">
            <a className="sc-btn sc-btn-primary" href={appStoreUrl}>
              Install Free
            </a>
            <a className="sc-btn sc-btn-secondary" href="#pricing">
              See pricing
            </a>
          </div>
          <div className="sc-hero-note">Free plan available · No credit card required</div>
        </header>

        <div className="sc-stats">
          <div className="sc-stat"><b>2 min</b><span>Setup time</span></div>
          <div className="sc-stat"><b>0</b><span>Theme code edits</span></div>
          <div className="sc-stat"><b>7</b><span>Built-in tools</span></div>
          <div className="sc-stat"><b>24/7</b><span>Support</span></div>
        </div>

        <section className="sc-section" id="features">
          <div className="sc-section-head">
            <h2>Everything a COD store needs</h2>
            <p>One app across the whole order lifecycle — from the form to delivery.</p>
          </div>
          <div className="sc-features">
            {FEATURES.map((f) => (
              <div className="sc-feature" key={f.title}>
                <div className="sc-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="sc-section" id="pricing">
          <div className="sc-section-head">
            <h2>Simple, order-based pricing</h2>
            <p>Start free. Upgrade as your order volume grows.</p>
          </div>
          <div className="sc-pricing">
            {PLANS.map((p) => (
              <div className={`sc-plan ${p.highlight ? "sc-plan-highlight" : ""}`} key={p.name}>
                <div className="sc-plan-name">{p.name}</div>
                <div className="sc-plan-price">{p.price}</div>
                <div className="sc-plan-sub">{p.sub}</div>
                <ul className="sc-plan-features">
                  {p.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <a className={`sc-btn ${p.highlight ? "sc-btn-primary" : "sc-btn-secondary"}`} href={appStoreUrl} style={{ marginTop: "auto" }}>
                  Choose {p.name}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="sc-section" id="faq">
          <div className="sc-section-head">
            <h2>Frequently asked questions</h2>
          </div>
          <div className="sc-faq">
            {FAQS.map((f) => (
              <div className="sc-faq-item" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="sc-cta-band">
          <h2>Ready to capture more COD orders?</h2>
          <p>Install Smart COD and have your form live in under 5 minutes.</p>
          <a className="sc-btn sc-btn-primary" href={appStoreUrl}>
            Install on Shopify
          </a>
        </div>

        <footer className="sc-footer">
          <span>© {new Date().getFullYear()} Smart COD</span>
          <span>Built for Shopify</span>
        </footer>
      </div>
    </div>
  );
}
