# XTSY POS roadmap — owner's decisions, 13 Nov 2026

The gap analysis is in `competitor-gaps.md`. This file is what the owner decided to
do about each gap. Where the two disagree, this file wins.

Everything new is gated by a plan feature and can be switched on or off per
restaurant by the super admin (`feature_overrides` on `accounts`).

## Decided

| # | Gap | Decision |
|---|---|---|
| 1 | Kitchen display | **Build it, ship it off.** New `kds` feature, off by default on every plan; the super admin turns it on for a restaurant. |
| 2 | ONDC | **Not doing ONDC.** Own riders assigned from POS Billdesk instead. |
| 3 | Online payment on QR | **Screenshot flow, no gateway.** Guest places the order → restaurant confirms → guest pays and uploads a payment screenshot → guest confirms again → POS shows the order as Paid and prints the KOT. |
| 4 | Delivery dispatch | **Own delivery.** Assign our own rider. Fetch the guest's current map location to fill the address — after payment, at order acceptance. |
| 5 | Accounting | **Audit GST reporting first**, then Tally sync and Zoho sync. Accounting and restaurant bookkeeping is an **exclusive Brand / Enterprise feature**. |
| 6 | Attendance, shifts, payroll | **Not required.** |
| 7 | Gift cards | **Build.** Created by the super admin or the restaurant's admin. **Pro and above.** |
| 8 | Feedback | **Build.** Popup on the final page of the QR scan-and-order flow. **Pro and above.** |
| 9 | Recipe management | **Build.** **Pro Lite and above**, enabled by the super admin. Also: **sales summary and dashboard move into Basic.** |
| 10 | Caller ID | **Capture the caller and create them as a Guest.** |
| 11 | Report depth | **Match the competition.** |
| 12 | Integrations | **Zoho for payments.** QR payment stays a manual screenshot upload for now. Every other pay option sends the guest to WhatsApp. |
| 13 | AI | **One-click menu-item images** sourced from Google or another relevant source. |
| 14 | Support | **Support every day including Saturday and Sunday, except national holidays.** Publish it. |

## Plan ladder after these changes

| Feature | Basic ₹149 | Pro Lite ₹299 | Pro ₹499 | Brand ₹999 |
|---|---|---|---|---|
| Sales dashboard and analysis | **yes (new)** | yes | yes | yes |
| Recipe management | no | **yes (new)** | yes | yes |
| Gift cards | no | no | **yes (new)** | yes |
| Guest feedback | no | no | **yes (new)** | yes |
| Kitchen display | super admin | super admin | super admin | super admin |
| Accounting and bookkeeping | no | no | no | **yes (new)** |

## Build order

1. Plan and feature changes (the table above), with the plans table migration.
2. Kitchen display back on, behind `kds`.
3. QR pay-by-screenshot, then own-rider delivery and guest location capture.
4. Feedback popup, gift cards.
5. GST audit, then Tally and Zoho sync, then the report pack.
6. Caller ID guest capture.
7. One-click AI menu images.
8. Support promise on the website.
