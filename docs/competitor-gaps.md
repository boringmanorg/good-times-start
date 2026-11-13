# Where XTSY POS stands against the Indian restaurant POS field

Written 13 Nov 2026. Sources are listed at the end. This is about product gaps,
not about Swiggy/Zomato aggregator integration, which is already a known gap.

## Where we are already ahead

| | XTSY POS | The field |
|---|---|---|
| Price | ₹149–₹999 per outlet per month, published on the site | Nobody publishes. Petpooja's plans start around ₹1,000+/month and resellers quote ₹10,000 first year per outlet, ₹7,500 to renew. Mid-market quotes run ₹3,000–₹20,000 per outlet per month |
| Offline | Full offline-first: IndexedDB, outbox sync, bills keep numbering with no internet | Third-party comparisons rate Petpooja and POSist offline support as "limited" |
| Device model | Three purpose-built apps (Billdesk desktop, Waiter Pro tablet/phone, POS Manager everywhere) with terminal approval, admin codes and seat enforcement | Usually one app stretched across devices |
| Recipe costing | Already in `stock-logic.ts`: per-portion consumption including variants and add-ons, and `recipeCost()` | Petpooja's equivalent is rated functional but fiddly to set up |
| QR ordering | One QR covering dine-in, takeaway, delivery and room service | Common, but room service is rare outside hotel-specific systems |

So the pitch holds: cheaper, honest about price, works when the line goes down.

## The real gaps, worst first

### 1. The kitchen display is switched off
`src/routes/kitchen.tsx` redirects to `/tables` in `beforeLoad`. The ticket logic
(`liveKitchenTickets`, per-station filtering) is written and tested. Every competitor
ships a KDS with station routing and ready alerts; we have one and it is hidden.
**Cheapest high-impact fix in this list.**

### 2. No ONDC channel
The website now argues against renting customers from aggregators. The honest
follow-up question from any owner is "so where do delivery orders come from?"
ONDC runs food delivery at roughly 3–5% commission against 15–30% on the
aggregators, and as of March 2026 it is live in 600+ cities with over 5 lakh sellers.
Rapido's Ownly runs zero commission with a flat delivery fee; Flipkart has a
Bengaluru pilot at around 10%. We should connect through an existing seller app
(uEngage, Magicpin, Thrive) rather than build network plumbing.

### 3. No online payment on QR orders
QR orders are pay-at-counter or pay-on-delivery. Prepaid UPI collection is
table stakes for takeaway and delivery, and ONDC needs it anyway.

### 4. No delivery dispatch
No rider assignment, no out-for-delivery status, no tracking link for the guest.
Delivery-led outlets cannot run their own channel without this.

### 5. Accounting and compliance stop at GST bills
No Tally or Zoho Books ledger sync, no GSTR-1 JSON export, no B2B e-invoice (IRN).
Petpooja and Restroworks both ship Tally integrations, and e-invoicing is mandatory
above ₹5 crore turnover. This is the objection that comes from the owner's CA, and
it kills deals quietly.

### 6. No staff attendance, shifts or payroll
Petpooja, ZaykaBill and even myBillBook's ₹250/month plan carry attendance and
payroll. We have roles and logins but no hours.

### 7. Loyalty has points but no coupons, gift cards or wallet
No discount codes, no prepaid guest wallet, no gift vouchers. These are the
instruments a marketing plan actually spends.

### 8. No feedback or review collection
No post-bill feedback prompt, no nudge to a Google review. Competitors list
feedback management as a standard module.

### 9. Multi-outlet is a flag, not a workflow
`multi_outlet` gates access but there is no central kitchen, no indent, no stock
transfer between outlets, no consolidated P&L. Enterprise/Brand at ₹999 promises
more than the product does today.

### 10. No caller ID / phone-order capture
Standard on delivery-heavy Indian systems: the phone rings, the guest's history
opens.

### 11. Report depth
Petpooja advertises 80+ reports. Raw count is marketing, but we are genuinely
missing: item-wise profitability, hourly sales heat map, biller and waiter
performance, void and discount reasons with who authorised them, and wastage.

### 12. No integrations at all
Petpooja cites 80+. We have none — no payment, no accounting, no aggregator,
no marketplace. Each one we add is also a distribution channel.

### 13. No AI features
Challengers in 2026 are pitching voice ordering in Indian languages, menu
extraction from a photo of a printed menu, and predictive reordering as the
new baseline. We have none, and the menu-photo one is a genuinely good
onboarding trick.

### 14. Non-product: scale, support and hardware
Petpooja powers 1,00,000+ outlets with on-ground installation and regional-language
support. A single-vendor product loses on trust at the point of sale regardless of
features. Partial answers: a published uptime and support SLA, a named local
installer network, and a hardware bundle list.

## Suggested order of work

1. **Turn the KDS back on.** Logic exists. Days.
2. **UPI payment link on QR orders.** Unlocks prepaid takeaway and delivery.
3. **Tally / GSTR-1 export.** Cheap, removes the CA objection at every sale.
4. **Coupons + feedback and review push.** Gives the marketing plan something to sell.
5. **Report pack** (item profitability, hourly heat map, staff performance, void/discount
   reasons, wastage).
6. **Attendance and shifts.** Payroll later.
7. **ONDC through a seller app.** The proof behind the website's own argument.
8. **Delivery dispatch and caller ID.**
9. **Central kitchen and inter-outlet transfers** for Enterprise/Brand.
10. **Menu-photo extraction** as the first AI feature, because it shortens onboarding.

## Pricing note

Pro at ₹499 carries 6 Billdesk seats. The nearest competitor quote for a single
counter is 2–20× that. The gap is wide enough to absorb a feature deficit for a
while, but only if the gaps above close in roughly this order — a cheap POS that
cannot talk to Tally or run a kitchen screen gets returned.

## Sources

- Petpooja module and report counts, Tally integration, 1,00,000+ outlets — petpooja.com, blog.petpooja.com, goodfirms.co
- Petpooja operator review, offline and inventory ratings — restaurantdaily (11 May 2026)
- Indian POS price bands and feature comparison table — codingclave.com (2026)
- ONDC commission, 600+ cities, 5 lakh+ sellers (March 2026) — dineopen.com
- Aggregator commission bands 15–30% — ecorpit.com / dev.to (2026)
- Rapido Ownly zero commission, Flipkart ~10% ONDC pilot — startupfeed.in (2026)
- Tally e-invoicing and the ₹5 crore threshold — tallysolutions.com, blog.petpooja.com
- Attendance and payroll as standard — goodfirms.co (ZaykaBill), mybillbook.in
- Restroworks Tally integration — restroworks.com
- AI features framed as 2026 baseline — dineopen.com
