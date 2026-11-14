<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use the app-only BillPrintButton for saved-bill controls to share authorization and designated-counter routing; keep it out of the consumer-safe library barrel because it depends on staff sessions and POS records.

- Keep Orders in a fixed-height dialog with stationary filters and an internally scrolling list; render history previews within their selected row so opening receipts does not resize or recenter the window.

- Before retrying queued settlements, durably remove only valid zero tenders when retained payments still equal the total; preserve all bill identities, amounts and atomic units, acknowledge unrelated successful units even when another fails, and close NC bills with an empty payment array rather than a fictitious cash receipt.

- Keep guest reservations in a separate RLS-protected arrival ledger with public availability-only RPCs, token-scoped guest status and member-authorized transitions; upcoming accepted bookings annotate floor/Orders, explicit Start order prepares only a guarded local guest draft, and one root notifier sounds on newly observed requests after browser audio unlock. Never create bills, settlements or KOTs implicitly.

- Keep IndexedDB as the offline source of truth and mirror signed-in users' orders and stock to Lovable Cloud, so sales continue during network outages.
- Keep durable active-order drafts and sync health metadata in IndexedDB; only use cloud sync as a signed-in mirror so checkout and kitchen service remain available offline.
- Reserve official POS/KOT numbers through the existing member-authorized allocator while connected; consume reservations atomically in IndexedDB, retain their cloud request identity on records, and never renumber them on reconnect or invent a number after reserve exhaustion.
- Strict POS/KOT series: online devices take the next cloud number; NUMBER_RESERVE_TARGET stays 0. Offline, only the designated counter (counter_print_routes) continues from its last synced sequence; claim_offline_number confirms those in order before push, and a taken number uses the fresh-number fallback.
- Running bills stay unnumbered; bill-numbering.ts allocates the POS number at settlement or first print (bill uid as request key), and the server guard refuses settled bills without one.
- Orders → History has KOTs, Settled (with All/Cash/UPI/Card & other filter), NC (settled with no payment) and Cancelled, each listed on the day it closed; running bills stay in the Running tab. Table reservations and QR order history live in the header Bookings dialog, not in Orders.
- Guest QR orders get a server QR series (guest_orders.qr_no → QR/0001) until settlement assigns a POS number.
- Room QR ordering is configured in restaurants.ordering.rooms (room-logic.ts); priority rooms stay on and the server refuses closed rooms.
- Guest QR requests live in header Bookings → QR orders; Orders has only Running and History.
- Printed QR material defaults to the XTSY Pines theme in qr-print.ts; Classic stays available.
- Spare-number caches use `reservedNumbers:v3:`; cloud-refused records get a fresh number and keep the old one as printedBillNo/printedKotNo.
- Offline-number claims run before each push but never block it (a failed claim is retried next sync; unaccepted numbers are renumbered). Live sync polls every 20 s even while realtime reports connected, so a silently dead socket heals quickly. Realtime notices are applied at once from their row (applyLiveChange) before the confirming sync; applyRemote never replaces a newer stored version with an older one. Bill and KOT edits push immediately.
- A running bill pushed with no common base (a terminal's first upload of a bill the cloud has) adopts the cloud copy when the local copy adds nothing (record-versions adoptWithoutBase; local-only guest details kept); real clashes still go to staff. Each sync re-checks stored bill conflicts (healConflicts) so a terminal never stays frozen on an old copy. Counter-order cards for table bills open via ?table=, not ?bill=; useCart follows ?table changes on a mounted bill screen (a ?bill→?table redirect must switch the table, not leave "Choose a table").
- Sync pushes data first, then app-update.ts checks for a newer published build and reloads; IndexedDB data survives the reload.
- Signed-in shells mount AppUpdateWatcher: every 30 s (and on focus/online) it checks for a newer published build and reloads onto it when the screen is hidden or idle 10 s with no dialog open (at most once per 2 min unattended), else shows a persistent "Update now" toast. Counters stay open all day; a stale counter kept using pre-reset spare numbers (POS/0169…) and its bills were refused.
- iOS standalone apps use viewport-fit=cover with a translucent status bar: top bars must pad by env(safe-area-inset-top).
- Counter numbering resets require an owner-validated cloud RPC with collision checks; sync maps the original counter series into IndexedDB before pushing, while checkout allocates locally above existing invoice numbers to preserve offline service.
- Put authenticated AI Gateway calls in client-importable `*.functions.ts` RPC wrappers with server-side authorization and server-only helpers, keeping gateway secrets and prompts out of browser code.
- Sales/menu AI analysis requires owner membership in the submitted restaurant and sends only reviewed aggregates; recommendations never mutate menu or order records.
- Generate guest QR links from the canonical public origin in qr-ordering.ts, never the current editor origin, so printed cards remain usable outside preview.
- Restore guest carts before enabling persistence and treat order placement success independently of optional marketing recording, so refresh and secondary failures cannot lose carts or invite duplicate orders.
- Resolve app installation identity with app-install-logic and exclude app workers from development and editor hosts; this prevents stale preview assets.
- Keep library component extraction pointed at src/index.ts and export documented public controls there, so the published catalog matches the consumer entry point.
- Dialog and Popover wrappers in src/components/ui render nothing while closed and force-mount while open, so no Radix Presence runs for closed overlays; Presence open/close tracking caused React 19 "Maximum update depth exceeded" blank screens.
- Restore merged GitHub changes selectively without replacing generated Cloud configuration or local numbering protections; apply database safeguards through managed migrations so the preview and Cloud stay consistent.
- Keep KOT end-feed in the shared slip model and use it for browser and ESC/POS output; printer-driver paper length and cutter offsets remain device-controlled.
- Treat cloud order mirrors as data only, never print commands; explicit browser jobs always call window.print(), with kiosk/dialog behavior controlled by Chrome rather than a readiness checkbox.
- Route explicit waiter print commands through a durable local outbox and authenticated, designated-counter claim queue; do not replay ambiguous claimed dispatches, because physical printing cannot be acknowledged by browsers.
- Separate Business Manager from tables and thermal printing while keeping report exports, because administration does not own the counter printer.
- Keep Orders history in indexed local bill/KOT reads and preserve guest acceptance separately; hide aggregator entry until an actual order-sync integration exists, retaining historical order types.
- Create floor sections together with their first table through the existing table save/sync path, so section creation works offline without a parallel registry.
- Persist KOT submission identity and device/day sequence atomically with station tickets; history groups submissions while keeping every station record for printing and sync.
- Snapshot table sections on orders and KOTs so printed history survives floor edits.
- Record settlement time and receiving device on bills; cash closes bind to durable device identity and never settle hotel room bills implicitly.

- Record writes use the versioned `push_restaurant_records` RPC (stale-write conflicts, atomic settlement units), falling back to legacy upsert when absent.
- Keep the generated Cloud `.env` (publishable keys only) tracked, never gitignored: published builds read it, and removing it blanks the live site.
- Redirect empty billing entry in route beforeLoad before mounting cart hooks; preload only core operational screens after sign-in so startup never waits on unused billing or report resources.
- Reconcile stale occupied floor tiles against closed bills for display only, preserving open bills, device holds and new unsent drafts; never rewrite financial records to repair occupancy.
- Kitchen screen is read-only over local KOTs; settlement summaries use payment time, invoice dates unchanged.
- Floor counts come from local floor, accepted bookings and payment-day reads; pending reservations stay in header notifications.
- Orders KOT reprints use the shared PrintHost dispatch and existing reprint authorization; never create new tickets or numbers when printing saved history.
- Reservation identity travels from guest drafts into bills; cancelling queues exact-booking cleanup locally until Cloud confirms.
- Enforce guest self-cancellation deadlines in the token-scoped database RPC and mirror the deadline in guest controls; kitchen-accepted orders remain staff-managed to avoid orphaning financial/KOT records.
- Sync now is restaurant-wide: after its own push/pull it broadcasts "sync-all" on the `terminals-<restaurantId>` realtime channel (terminal-signal.ts); every open terminal then syncs, refreshes Bookings and checks for a new app version. The first terminal whose AppUpdateWatcher finds a new build broadcasts the same signal; remote-triggered checks never re-broadcast. AppUpdateWatcher is mounted in AppShell and the Waiter app.
- src/test/e2e-workflow.test.ts runs a full service on three terminals (counter, waiter, Business Manager) through real sync/numbering/history code with the fake cloud allocator (fakeServer.allocator); keep it passing when changing sync, numbering or settlement.
- The terminals broadcast channel is public: receivers act on at most one sync-all signal per 3 s (SIGNAL_MIN_GAP_MS). Server functions that accept client lists check list length (input-limits.ts) before zod parsing (zod advisory GHSA-mrhx-c7xc-m3w5; project is on zod 3).
- A conflict whose cloud copy is deleted (bill removed for every terminal) offers only "Remove from this device"; the cloud refuses to revive tombstones, so "Keep my changes" would loop.
- QR orders close from the always-mounted Bookings button (useFinishedGuestBills + guestOrderClosing), not only while the dialog is open: a settled bill marks its guest order completed with the POS number in guest_orders.bill_no (shown on the guest page); a cancelled/removed bill marks it cancelled. Auto-closing never closes the dialog. QR numbers are max(qr_no)+1, so deleting test rows resets the series.
- QR order limits live in place_guest_order (docs/migrations/2026-11-09-qr-order-limits-scale-with-floor.sql, applied): per table 8 waiting ('new') orders in 10 min, pickup phone 3 in 3 min, restaurant-wide max(60, 3 × tables) per minute. In PL/pgSQL IF conditions wrap CASE in brackets (IF ends at the first THEN). Guests see a 'kitchen is busy' note after 1 minute unconfirmed (guestWaitMessage).
- Guest ordering pages wear the XTSY look by default (branding.theme "xtsy"; "classic" keeps the brand-colour accent): the .theme-xtsy class in styles.css is put on <html> only while /order is open (so portal dialogs share it), Staatliches for h1/h2/.xt-eyebrow, Manrope body, crimson pill buttons via Button data-slot="button". XTSY prints end with the XT_STRAP ink strap, crimson table pills and XTSY®.
- Two guest QRs: in-house (`/order/<slug>?for=stay`, room picker only) and public (`/order/<slug>`, Book a table / Dine in / Takeaway / Delivery; no tables or their status shown). Public orders go through place_guest_order_v2 (order_type, delivery_address/landmark on guest_orders; min order only for takeaway/delivery); staff seat public dine-in guests by choosing a table on Accept (needsTableOnAccept/seatingChoices). Bookings are party-only (request_guest_booking, 1–15 guests) and staff allot the table (allot_guest_reservation); public_booking_availability no longer exposes per-table occupancy. Migration: docs/migrations/2026-11-09-public-and-inhouse-qr.sql. Delivery bills carry deliveryAddress (printed "Deliver to").
- Both guest QRs open straight on the menu (no landing page). In-house (`?for=stay`): room chosen at checkout (RoomSelect, open rooms only) plus name and mobile; it goes on the room bill, paid before check-out or when the front desk asks. Public: starts as dine-in (publicTypeFrom), switch chips for Takeaway/Delivery plus a "Book a table" link. Required fields come from guestRequired: dine-in needs guests/name/mobile, takeaway an arrival time (no "as soon as possible"), delivery an address and a Google Maps pin (current location or pasted Maps link). The pin is stored as the last line of delivery_address ("\nMap: <url>", withMapPin/splitMapPin) — staff card links it; bills and kitchen notes print the address only.
- Purchase items (materials): owners/managers edit name and standard price only, or delete the item (deleteMaterial); the unit is fixed at creation. No stock levels are shown. Purchase and return lines snapshot the item name and unit (recordStockEntry) so history reads correctly after renames/deletes; bills and returns stay immutable. Items tab rows expand to the item's purchase/return lines; Vendors tab shows net amount per vendor, expandable by day, then bills (supplierHistories). Cloud rules: docs/migrations/2026-11-09-editable-purchase-items.sql then 2026-11-10-purchase-items-delete-fixed-unit.sql.
- public_storefront must send each dish's record_id as its id (docs/migrations/2026-11-09-storefront-menu-ids.sql); the guest page drops id-less dishes (guestMenuItems) because id-less dishes shared one cart counter.
- Audit log (admin only: owner/manager): the database writes restaurant_audit_log itself from an AFTER trigger on restaurant_records (created/changed/deleted/restored, changed fields with from/to, user, device). Terminals push via push_restaurant_records_from(_device) so the cloud knows the device (falls back to push_restaurant_records only when the _from function is missing). Settings → Audit log filters by day, terminal and type (AuditLogSettings, audit-log.ts). Migration: docs/migrations/2026-11-10-audit-log.sql.
- Marketing is admin-only (owner/manager) AND per terminal: it opens only on devices listed in settings.marketingDevices, switched in Settings → Terminals → Marketing (setMarketingTerminal; settings are admin-write in the cloud and sync offline). AppShell hides the nav item and shows a "not enabled on this terminal" screen otherwise; Restro POS lists Marketing only once its terminal is enabled. Marketing works offline: loadBrandingAndMarketing keeps a per-restaurant snapshot (brand, WhatsApp settings, outlet slug/ordering) in meta; brand/settings saves, manual campaigns and sends queue in meta "marketing:outbox" and upload in order (flushMarketingOutbox on online/every minute, from AppShell); refused changes are dropped. Auto campaigns need the internet. Results show the last loaded numbers offline.
- Blocked terminals are refused by the cloud on sync (push_restaurant_records_from → terminal_is_blocked, SECURITY DEFINER because staff can't read terminals).
- "On with admin code" (was On with PIN): a 6-digit time-based code changing every 60 s (HMAC-SHA256, admin-code.ts). The secret is settings.adminCode, made in Settings → Roles (admin only) and shared with the settings; codes are generated and checked on each device with no cloud call, ±1 step for clock drift, and each step is accepted once per terminal (localStorage). Owners/managers see the live code via the header key button (AdminCodeButton) or Settings → Roles. "Make a new key" invalidates all older codes. The old fixed adminPin is retired.
- KOT slips print the quantity first ("4 x Tawa Roti"), Date and Time on separate lines when they don't fit, and "Total Qty: N" left-aligned: some kitchen printers clip the right edge, which hid right-aligned quantities (KOT/0049, 10 Nov). Keep KOT essentials left-aligned.
- Slips fit the paper by themselves (no printer layout settings for staff): slipLayoutOf(config) = paper + SAFE_MARGIN_MM (1.5 mm); SlipView sizes its font so cols × 0.6 em (Courier New, the widest common monospace) fits between the margins — a fixed font with margins cut bill amounts on Macs/PCs without Consolas (10 Nov). Our counters use XP-C230H (58 mm paper, 48 mm printable, ESC/POS, USB + Bluetooth). fitLines wraps any line still too wide; ESC/POS sends GS L for the margin.
- Orders lists read newest first: KOTs by time sent, Settled/NC/Cancelled by settle or cancel time (historyBills), each row showing that time. Running bills show how long they've been open ("Open 2 h 15 min", openFor; amber after 3 h), longest-open first.
- Sales Summary is sales only: settled (including NC) and cancelled bills (salesBills); running bills show only in the "Today · live" card. Summary page: header with Excel + Cash counter, "Today · live" card (settled, Cash/UPI/Card split bar, running bills), then report tabs with the date chips beside them and a "Showing … · dates" line.
- After a KOT is sent, the shared-bill merge (linesAfterSharedChange) counts what this device just sent (ownSentRef, set before the save) as sent; otherwise its own save arrived before screen state caught up and the sent items reappeared under "New items" (D2, KOT/0069, 12 Nov).
- Purchase approval: the bill desk (cashier, "stock.request") records purchases (invoice no. required) and supplier returns as approval.status "pending"; owners/managers approve after ticking "Supplier bill checked", or reject with a reason (decidePurchase). Only approved entries count in totals, item history and vendor amounts (counts()). The bill desk returns only purchases it recorded (canRequestReturn; cloud checks restaurant_audit_log "created" by auth.uid()). PurchaseAlerts (mounted in LiveSync) chimes both ways: admins on new requests, the sender and the other admins on decisions. Cloud rule: docs/migrations/2026-11-12-purchase-approval.sql (applied 13 Nov).

## Allotting a table to a booking (13 Nov 2026)
- Admin-only (owner/manager). Cloud: `allot_guest_reservation` checks owner/manager and is not executable by anon/PUBLIC (docs/migrations/2026-11-13-allot-table-admin-only.sql, applied). UI: ReservationsPanel shows "Allot & confirm" only to `isAdmin(user)`; others see "Waiting for the admin to allot a table". Confirm/arrived/cancel stay with `guestOrders.handle`.

## Lint layout (react-refresh)
- Component files export components only. Hooks/helpers live in lib: `@/lib/staff` (useStaff, isAdmin, ROLE_LABELS, AuthContext, staff types; auth-context.tsx keeps only AuthProvider), `@/lib/print-jobs` (printBill, printKots, markKotsSeen, printDocuments), `@/lib/printer-setup`, `@/lib/install-prompt`, `@/lib/use-policy`, `@/lib/framed-paths`, `@/lib/guest-place`, `@/lib/press-shortcut`, `@/lib/order-type-label`, `@/lib/qr-requests`, `@/components/ui/button-variants`, `@/components/ui/toggle-variants`. Import `useRestaurantSettings` from `@/lib/use-settings`, not AppShell.

## Classic black brand theme (13 Nov 2026)
- Staff screens (Business Manager, Restro POS, POS Waiter, kitchen) use one black palette in styles.css (`:root, .dark`): black background, white text, bright secondary text (#c4c4ca), XTSY champagne-gold accent (`--primary` #e9b949, black text), orange `--gold` (#ff8a00) for "waiting", `--raised` for the selected segment. Keep the UI token-driven: no hard-coded light colours.
- On tinted gold surfaces (`bg-gold/NN`) and plain cards use `text-warning`; `text-gold-foreground` (dark) only on solid `bg-gold`.
- Guest pages keep the light XTSY look: RootShell puts `theme-xtsy` on <html> for /order and /book during SSR (no black flash), and `.theme-xtsy` restates the full light palette. Printed slips and on-screen receipts stay white paper.
- Brand type is self-hosted (@fontsource Manrope body, Staatliches for `main h1`, header names and `.font-brand`) so counters keep it offline.
- Layout audit harness (local only, no cloud): render each terminal at 360/412/768/1024/1280 with a fake offline session and sample data; no screen may scroll sideways. Amounts must never truncate (dashboard KPIs wrap; icons hide on phones). GuestDetailsFields is a container query: the name takes its own row in narrow bill panels.

## XTSY POS as software: plans, super admin, website (13 Nov 2026)
- Names: the software is XTSY POS ("POS by XTSY"); apps are POS Manager (owner/manager), POS Billdesk (counter) and Waiter Pro (waiters).
- Plans (src/lib/plans.ts, cloud `plans`), prices per outlet per month — seats are devices per app (Billdesk / Admin-Manager / Waiter):
  - Basic ₹149 (1 / 1 / 0): billing, menu, GST bills & sales reports, POS Manager mobile app.
  - Pro Lite ₹299 (4 / 1 / 0): + sales dashboard & analysis (insights), purchases, vendors, guest loyalty, table reservations, admin/manager approval codes (admin_approval).
  - Pro ₹499 (6 / 2 / 3): + Waiter Pro, guest QR ordering (+ QR takeaway/delivery), marketing & branding tools.
  - Enterprise / Brand ₹999 (unlimited / 5 / unlimited): + audit logs & full reports, multi-outlet.
  A device beyond the plan becomes `over_plan` (can't sync, owner devices exempt) and retries on each check-in. Payments are recorded by hand by the super admin; no payment gateway.
- Plan gating in the apps (hide, never block billing): AppShell SCREEN_FEATURE (/dashboard insights, /stock purchases, /marketing marketing, /waiter waiter_app; POS Manager starts on the first screen its plan has), Purchase → Vendors tab (vendors), Bookings button/tabs (qr_ordering, bookings; anything already waiting still shows), Roles "On with admin code" (admin_approval), loyalty via useLoyaltyPct (0 without loyalty), Settings cards (audit_log, QR & guest ordering, Brand/WhatsApp). Cloud: QR/online orders check account_feature; guest table bookings check account_feature(…, 'bookings').
- Website models: live — restaurants, fine dine, cafés, cloud kitchens; coming soon — POS by XTSY for Hotels & Resorts, POS by XTSY for Tourism (separate apps, one XTSY brand).
- Features fail open on the device (featureOn: unknown plan = on) and billing is never switched off: a lapsed plan (7 days past paid-until) turns off extras and shows the admin a renewal notice. Guest QR/online ordering check account_feature in the cloud.
- TAB Bistro by XTSY: Enterprise / Brand, complimentary, paid until 13 Dec 2026 (was Pro; changed in the console).
- Super admin console at /console (noindex, never linked): only confirmed accounts listed in platform_admin_emails (admin@xtsy.one, a real address; sign in with the full email) or platform_admins. The console has its own session (console-client.ts, storageKey xtsy-console-auth), never the staff apps' session; server actions get the console token in their input and check it (superAdminFromToken). Forgot password? emails a reset link back to /console (recovery → set new password). Tabs: Overview, Restaurants (plan, status, paid-until, seat/feature overrides, devices), Plans, Infra & backend, SEO insights (audits the live website).
- Website (src/routes/xtsy-pos.tsx) is the bare home page "/" via the router rewrite (homeToWebsite); "/?table=…" etc. stay the bill screen. No sign-in links or forms on it (SEO audit checks). Staff sign-in is /login (/auth redirects there). robots.txt allows only "/$" and assets.
- Super admin controls every restaurant's logins (Restaurants → Logins; ConsoleLogins, platform-logins.functions.ts → platform/logins.server.ts, service role after is_platform_admin): create logins on any made-up domain (confirmed, no email sent), rename the email, change role/name, reset password, sign-in off/on (auth ban), remove. Guards: a restaurant always keeps an owner who can sign in; super admin accounts can't be edited from the console. Identity is by user id (staff_logins.user_id), so renamed built-in logins keep their role; only the short names "admin"/"billdesk"/"waiter" on /login stop working for a renamed login. Changes are logged in account_events (login_changed).
- Cloud: docs/migrations/2026-11-13-plans-super-admin.sql (includes platform_staff) — applied 13 Nov 2026 (TAB on Pro without audit log, by the user's choice).

## Terminal approval, admin alerts, app devices, website demo (13 Nov 2026)
- New terminals wait for the admin (docs/migrations/2026-11-13-terminal-approval.sql): touch_terminal registers a device seen for the first time as 'pending' unless an owner/manager signed in on it (then 'active' at once). Pending devices can't push (terminal_is_blocked) and show TerminalWaiting: name + the 60-second admin code, checked in the cloud by admin_code_step (same HMAC-SHA256 TOTP as admin-code.ts, ±1 step, once per restaurant via admin_code_uses; verified identical codes), or the admin approves/turns away in Settings → Terminals (PendingTerminals cards, decide_terminal). Approval goes through the seat trigger (may become over_plan). Admin devices get a one-time "Name this terminal" prompt (NameThisTerminal, unnamedTerminal). Existing terminals were left as they were.
- Apps per device (APP_DEVICES in staff-login-logic): POS Manager on Android/iOS/Windows/Mac, POS Billdesk on Windows/Mac only, Waiter Pro on Android/iOS phones and tablets — for every login, admin included; the device check runs before the approval screen and offers only an app that fits the device.
- Admin alerts: AdminAlerts bell in the header for owners/managers in every app (adminAlerts in lib/admin-alerts.ts, tested): new terminals, purchases to approve, QR orders, booking requests, devices waiting for a seat, plan renewal/lapse/pause. New urgent items chime and, once allowed, show a phone/desktop Notification while the app is open (no web push yet). In POS Manager, bookings open a ReservationsPanel dialog; QR orders are accepted on POS Billdesk. Settings follows #terminals / #plan even when already open.
- Website Demo: header "Demo" + hero "Watch the demo" open DemoTour (components/site/DemoTour.tsx): 5 animated HTML/CSS scenes (POS Billdesk, Waiter Pro, guest QR, POS Manager, offline), auto-play 7 s, pause/step/keyboard, still under prefers-reduced-motion. No data, no sign-in.

## Preview, terminal naming, expiry block, super admin control (13 Nov 2026)
- Lovable's editor preview and localhost are XTSY's workbench, never a restaurant terminal: `isLovablePreview()` (lib/preview-host.ts, tested) makes touchTerminal skip registering, and AppShell skip both the first-login approval screen and the subscription block there. The live site and custom domains are real terminals.
- Apply order matters: 2026-11-13-terminal-approval.sql FIRST, then 2026-11-13-expiry-block-restaurant-control.sql — both redefine terminal_is_blocked and the expiry one is the superset (statuses + account not live).
- Every terminal names itself on first login (docs/migrations/2026-11-13-terminal-approval.sql): touch_terminal registers EVERY new device as 'pending', the admin's own included. TerminalWaiting asks for a name plus the 60-second admin code; for an owner/manager the name alone is enough (approve_this_terminal skips the code for them), so there is no deadlock on a brand-new restaurant. The name is also kept on the device (rememberTerminalName / thisTerminalName, shown in Settings → Terminals). The old skippable NameThisTerminal prompt is gone. The migration ends with a one-time `UPDATE terminals SET status='pending'`, so every existing terminal re-does first-login naming.
- Subscription expiry stops the whole outlet (docs/migrations/2026-11-13-expiry-block-restaurant-control.sql): terminal_is_blocked also refuses every terminal of an account that is not live (account_is_live keeps the 7-day grace), and SubscriptionExpired replaces the staff app for everyone, admin included. Data stays on the devices and syncs when the plan is live again. Fails open when the plan can't be loaded (offline).
- Renewal and payment status are the super admin's alone: no self-serve path anywhere in the apps. Console → Restaurants → Renewal and payment records a payment by hand (platform_record_payment: amount, 1-36 months, method, reference), which moves paid_until forward from the later of today / current paid_until and sets status active; platform_payments lists the history (account_events kind 'payment_recorded').
- Restaurant info (name, QR slug, city, billing phone and email) is edited only in the console (platform_update_restaurant); the slug is validated and unique, and the console warns that changing it breaks printed QR cards.
- Staff passwords are set and reset only by XTSY: the restaurant-side reset UI is gone from /login and Settings → Logins, and resetLoginPassword / requestResetCode / confirmResetCode now refuse on the server. The console's ConsoleLogins is the only path.

## Plan features after 13 Nov 2026 (docs/roadmap.md)

Five features were added: `recipes` (Pro Lite up), `gift_cards` and `feedback` (Pro up),
`accounting` (Enterprise / Brand only) and `kds` (no plan carries it — XTSY switches the
kitchen screen on per restaurant with the console's feature override). `insights` is
confirmed as part of Basic.

`kds` and `accounting` are in `DEFAULT_OFF` in `src/lib/plans.ts`: unknown means OFF for
them, unlike every other feature, which fails open so billing is never lost. Add a feature
to `DEFAULT_OFF` whenever it must not appear by itself on a cloud that hasn't been updated.

`/kitchen` no longer redirects to `/tables`. It is gated by `SCREEN_FEATURE["/kitchen"] =
"kds"` in `AppShell`, and the off-plan screen has its own wording for it ("isn't switched on
for this restaurant", not "isn't part of the plan").

`restaurant_entitlements()` names each feature key in an array, so **any new feature must be
added there too** or the devices never see it. The migration that does this, together with
the plans-table update, is `docs/migrations/2026-11-13-new-plan-features.sql` — **applied
14 Nov 2026**.

## Super admin onboarding (14 Nov 2026)

Console → Restaurants → **Onboard a new outlet** creates the account, the restaurant and
the owner's login in one pass (`ConsoleOnboard` → `platform-restaurants.functions.ts` →
`platform/restaurants.server.ts`, service role after `superAdminFromToken`). Restaurants
cannot create themselves; this is the only path.

- Business model (Restaurant / Fine Dine / Café / Cloud Kitchen / Hotel & Resort) is stored
  in `restaurants.branding.model` — no migration needed, `branding` is already jsonb. It is
  shown on each restaurant card via `platformRestaurantModels`, because `platform_restaurants`
  predates the field. Tourism is deliberately not offered yet.
- The outlet starts `trialing` on the chosen plan (14 days); the first payment recorded under
  Renewal and payment makes it active. Only the four public plans are offered
  (`ONBOARDING_PLANS`) — never `owner` or the legacy catalogue entries.
- The QR slug and the owner's login email derive from the outlet name until either is typed
  ("Cloud Nine Kitchen" → `cloud-nine-kitchen`, `admin@cloudninekitchen.pos`).
- Onboarding is all-or-nothing: if the owner login fails, the restaurant and account rows are
  deleted again, so no half-made outlet is left behind.
- Rules live in `src/lib/platform-restaurant-logic.ts` (pure, tested).

## Basic / Pro Lite workflow audit (14 Nov 2026)

Every screen was driven as a Basic and a Pro Lite restaurant on desktop and phone. Keep these:
- Anything a plan does not include must not be *offered* — not just empty. Tables hid
  "QR Scan & Order" without `qr_ordering`; the menu's food-cost chip needs `recipes`; the
  dashboard's Purchases tile becomes "GST on sales" without `purchases`; Invoice & GST
  disables the loyalty % field and hides the Loyalty-points payment mode without `loyalty`.
- Never force a `min-w-[…]` table on phones: mobile Chrome zooms the whole app out to fit it
  (the Purchase items table now drops two reference columns below `sm:` instead).
- Cloud errors must read as English: a failed number allocation says "no connection to the
  cloud right now", never "TypeError: Failed to fetch".

## Prepaid QR orders: pay by screenshot (14 Nov 2026)

There is still no payment gateway. A guest who chooses "Pay now by UPI" pays into the
restaurant's own UPI and sends a screenshot; staff check it and accept.

Payment runs on a **separate column** from the order's `status`, so a pay-at-counter order
behaves exactly as it always has:

| step | `status` | `pay_state` | who acts |
|---|---|---|---|
| order placed | `new` | `awaiting_confirm` | guest waits, told not to pay yet |
| restaurant confirms it can make it | `new` | `awaiting_payment` | staff: "Confirm — ask for payment" |
| guest pays, uploads the screenshot | `new` | `paid` | guest: "I've paid — send it" |
| staff accept → bill + KOT | `accepted` | `paid` | staff: "Accept & send KOT" |

- **Accept is disabled while money is owed** (`acceptBlockedReason` in
  `src/lib/guest-payment-logic.ts`, pure and tested). Pay-at-counter orders (`pay_state`
  `none`) are accepted straight away, as before.
- Screenshots live in the **private** `guest-payments` bucket, one folder per order, with
  **no anon policy**. The guest uploads through `sendGuestPaymentProof` (server function,
  service role, proves itself with the order token); staff open it through
  `guestPaymentProofLink`, which checks membership and returns a 10-minute signed URL. So a
  screenshot is never reachable by guessing a URL — these images show people's bank apps.
- A `BEFORE INSERT` trigger sets new `payment = 'upi'` rows to `awaiting_confirm`. Rows that
  existed before keep `none`, so nothing already in flight waits for a step that didn't
  exist when it was placed.
- Migration: `docs/migrations/2026-11-14-qr-pay-by-screenshot.sql`.
