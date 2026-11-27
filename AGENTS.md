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
- Printed QR material defaults to the Noir theme in qr-print.ts (black card, gold border, white QR tile, gold table pill; 26 Nov 2026); XTSY and Classic stay available.
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
- Sales Summary is sales only: settled (including NC) and cancelled bills (salesBills); running bills show only in the "Today · live" card. Summary page: header with Excel, "Today · live" card (settled, Cash/UPI/Card split bar, running bills), then report tabs with the date chips beside them and a "Showing … · dates" line.
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
  - Basic ₹199 (1 / 1 / 0): billing, menu, GST bills & sales reports, POS Manager mobile app, sales dashboard.
  - Pro Lite ₹399 (3 / 1 / 0): + purchases, vendors, recipe costing, guest loyalty, table reservations, admin/manager approval codes (admin_approval).
  - Pro ₹599 (6 / 2 / 2): + Waiter Pro, guest QR ordering (+ QR takeaway/delivery), gift cards, guest feedback, marketing & branding tools.
  - Enterprise / Brand ₹999 (unlimited / 4 / unlimited): + accounting & bookkeeping, audit logs & full reports, multi-outlet.
  Prices and seats above are a snapshot: the catalogue in the cloud is the truth and the site
  reads it live (see "The website reads the price catalogue"). Waiter Pro and QR ordering are
  Pro and above; Basic and Pro Lite carry no waiter seat.
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
- Website Demo: replaced on 26 Nov 2026 by recorded videos (see "Website revamp" below). DemoTour is gone.

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

## The website reads the price catalogue (14 Nov 2026)

The home page used to carry its own copy of the prices in `PUBLIC_PLANS`, so every change
made in the console drifted away from what customers saw. By 14 Nov the live site showed
₹149/₹299/₹499 while the catalogue said ₹199/₹399/₹599, with different seat counts too.

`src/lib/public-plans.ts` now reads the `plans` table (anon may read active plans) and maps
rows to `PublicPlan`. The website route loads it in its `loader`, so prices are server-rendered
for search engines, and `PlanSettings` reads the same list through React Query.

- **Change a price in the console and the site follows — no redeploy.**
- A row marked `quote` shows "Call for quote" and never leaks its stored number.
- Any failure (offline, refused read) falls back to the compiled `PUBLIC_PLANS`: a slightly
  stale price beats an empty pricing section. Keep `PUBLIC_PLANS` roughly current for that
  reason, but it is no longer what customers normally see.
- `priceRange()` drives the JSON-LD `AggregateOffer` and the hero's "from ₹X/month", so those
  track the catalogue too. Quote-only plans are left out of the range.
- `PUBLIC_PLAN_IDS` decides which rows are public: `owner`, `trial` and the legacy catalogue
  entries never reach the page.

## Re-audit of the plan ladder (14 Nov 2026)

The catalogue had drifted from the plan structure: Basic carried `admin_approval`, and
`vendors` had fallen out of both Pro Lite and Pro while Enterprise kept it — so a Pro
restaurant was missing a feature a cheaper plan was sold with. Corrected in the cloud:

- `admin_approval` off for Basic (it starts at Pro Lite).
- `vendors`, `loyalty`, `bookings` on for Pro Lite.
- `vendors` on for Pro.

The ladder is now exactly the BASIC / PRO_LITE / PRO constants in `plans.ts`:

- **Basic** billing, menu, gst_reports, manager_app, insights
- **Pro Lite** + purchases, vendors, recipes, loyalty, bookings, admin_approval
- **Pro** + waiter_app, qr_ordering, online_ordering, marketing, gift_cards, feedback
- **Enterprise / Brand** + accounting, audit_log, multi_outlet

`plans.test.ts` now asserts the ladder never takes a feature away as you move up, which is
what would have caught the missing `vendors`. That test guards the standby list; the cloud
catalogue is data, so re-check it with the feature matrix query whenever plans are edited in
the console.

## Brand / Enterprise: real multi-outlet (14 Nov 2026)

The multi-outlet backend already existed and **nothing used it** — `create_outlet`, `push_menu`
and `outlet_sales` were in the cloud, `src/lib/outlet-actions.ts` wrapped all three, and no
screen called any of them. Brand was a label, not a feature.

`/brand` (POS Manager, gated by `SCREEN_FEATURE["/brand"] = "multi_outlet"`) now uses them:

- **Sales together** over 7 / 30 / 90 days: brand totals plus a per-outlet table ranked by
  sales with each outlet's share. An outlet with no sales reads as zero, never missing.
- **Add an outlet**, optionally copying an existing outlet's menu, settings, materials and
  suppliers (`create_outlet` already does the copy). The cloud enforces `plans.max_outlets`
  (Enterprise 50, every other plan 1) and account ownership.
- **Push the menu across the brand**: copy one outlet's dishes and prices over the outlets you
  tick. Never runs with nothing ticked — an empty selection reads as "push to all" and isn't.

Rules are pure and tested in `src/lib/brand-logic.ts`.

`multi_outlet` is now on the public comparison table: it does something real, so it is the
headline reason to take Enterprise / Brand. `accounting` came OFF that table in the same pass,
because it is advertised but not built — put it back the day it ships.

Still missing for a full brand offering: central kitchen and inter-outlet stock transfers, a
consolidated P&L, and an outlet switcher in the header (`prepareOutletSwitch` in
outlet-actions.ts has the safe-switch guards already written, but no UI calls it).

## Brand: outlet switcher, P&L and stock transfers (14 Nov 2026)

The three gaps left by the first Brand pass are closed.

**Outlet switcher** (`OutletSwitcher`, header, every app). A device holds one outlet's data,
so switching clears the device and reloads onto the other outlet. `prepareOutletSwitch` already
had the guards: it refuses while anything is unsynced or a bill is running, and says which, so
nothing is ever wiped. The choice is kept in localStorage (`xtsy-outlet`) and `pickActive` in
`active-outlet.ts` applies it at sign-in — a remembered outlet the person no longer belongs to
is ignored, or they would be stuck on a screen that cannot load. The chip only appears for
someone with two or more memberships on a `multi_outlet` plan.

**Sales less purchases** on `/brand`. `outlet_purchases` (new RPC) sums approved purchase
entries less linked supplier returns, per outlet per day, using the same "approved" rule as
`purchase-logic.ts` `counts`. It is STABLE, not SECURITY DEFINER, so RLS keeps a caller to
their own outlets — same as `outlet_sales`. The screen calls it a **trading margin, never
profit**: rent and wages are not in the POS. A cloud without the RPC shows "no approved
purchases" rather than taking the sales table down.

**Stock transfers** between outlets (`transfer_stock`). One call writes BOTH sides together —
`transfer_out` (negative quantities) at the sender and `transfer_in` (positive) at the
receiver, sharing a `transferId` — so a transfer can never exist on one end only. They are
ordinary `stock_entry` records, so they sync and affect stock levels through the existing path
with no new table. Lines carry the sender's `unitCost`, so the receiving outlet is valued at
what the brand paid, and `outlet_purchases` ignores both transfer types: moving stock between
outlets is not a new purchase and must not inflate brand spend. Only an owner/manager of
**both** ends may do it, and both must be the same account.

Migrations **applied 14 Nov 2026**: `docs/migrations/2026-11-14-outlet-purchases.sql` and
`2026-11-14-outlet-transfers.sql`. Verified on apply: the spend arithmetic (purchases less
linked returns, entries with no approval block counted as approved, pending entries excluded,
a line with no unitCost worth zero) and that `transfer_stock` refuses and writes nothing when
its guards fail.

## The public address is the custom domain (14 Nov 2026)

`GUEST_ORDER_ORIGIN` (qr-ordering.ts) and `APP_ORIGIN` (site-config.ts) are both
**https://www.posbyxtsy.club**. They drive every QR code, printed card, booking link, shared
link and install link, so printed material carries the brand's own domain rather than the
lovable.app deployment address. `siteUrl()` follows from `APP_ORIGIN`.

Cards printed before this change carry `good-times-start.lovable.app`, which still redirects
here — **leave that redirect in place** or those cards stop working.

**Do not add posbyxtsy.club to `MARKETING_HOSTS`.** It looks like the obvious home for the
domain and it would break everything: a marketing host serves ONLY the website, because
`marketingPath()` rewrites every other path to the website's home page — so `/order/…` and
`/book/…` would stop resolving and every printed QR would fail. That domain serves the whole
app (staff apps, console, guest pages) plus the website at `/`. `MARKETING_HOSTS` is only for a
host that should show the website and nothing else.

`src/lib/public-origin.test.ts` guards all of this: it pins both constants, asserts the domain
is not treated as a website-only host, and fails if any source file reintroduces the old
address (preview-host, previewAuthStorage and app-install-logic are exempt — they name lovable
hosts on purpose, to detect the editor).

## Round-off never blocks a settled bill (19 Nov 2026)

`guard_settled_bill_points_value` (drizzle 0033, 11 Nov) refused a settled bill whose
`taxable` was more than 1 paisa above `total`. On a no-GST bill `taxable` is the amount before
rounding, so every bill rounded DOWN (₹1163.40 → ₹1163) was refused and held on the device;
rounded-up bills passed, which hid it. On 19 Nov all 50 settled bills in the cloud were
rounded up or exact — none down.

- The bill's own `roundOff` is now allowed in that rule; a round-off of more than
  ₹100 (`MAX_ROUND_OFF`) either way is refused. Payments must still equal the rounded
  `total` — that rule is unchanged and correct.
- `settledValueProblem` in billing.ts mirrors the cloud rule and runs in `settle` and
  `settlePart` **before** the bill takes its number, so a bill the cloud would refuse never
  leaves the counter with a number.
- `round-off.test.ts` runs every discount 0–100% × service charge × tax setup through
  `computeTotals` and the rule. Run it whenever the bill maths or the guard changes.
- Migration: `docs/migrations/2026-11-19-round-off-allowance.sql` — **applied 19 Nov 2026**.
- **Cashier's round-off**: the payment dialog offers "Round off −₹1 · settle at ₹1,162" when the
  guest paid a little less, or paid more by UPI/card with no cash to give change from (cash over
  is change, never round-off). One tap settles at what was received; the difference joins the
  bill's `roundOff`, so tax figures never change. `roundOffOffer` / `withManualRoundOff` in
  payment-logic.ts keep the whole round-off within ±₹100, and settlement passes the total the
  screen showed (`roundTo.seen`): if another device changed the bill meanwhile it is refused,
  so new items are never rounded away. Editing a payment drops the round-off. No admin code.
- Dialogs: DialogContent is `grid-cols-[minmax(0,1fr)]`. Without it the single grid column grew
  to its widest child (the payment dialog's Whole bill / Split switch) and the dialog's right
  edge, amounts included, was cut off on 360px phones.

## Correcting a settled bill (19 Nov 2026)

Owners/managers can correct a settled or NC bill's **payments, discount and round-off** with a
required reason, **within 48 hours of the first settlement** — for a payment found in the wrong
mode or amount. Orders → History → open the bill → **Correct payment** (`AmendBill.tsx`).
Rules are pure and tested in `bill-amend-logic.ts`; `bill-amend.ts` saves (needs the internet).

- Items, bill number, opening time and **settlement time never change**. The first settlement
  time is kept as `originalSettledAt`, so a second correction can't restart the 48 hours.
- Every correction appends one entry to `order.amendments` (`at`, `by`, `reason`, `from`, `to`
  snapshots of payments and totals). Earlier entries can't be edited. They show under the
  receipt in Orders.
- Payments must add up to the new total exactly; a guest's small short/over payment is taken as
  round-off (±₹100 total, same as the counter). Totals are recomputed from the bill's own lines
  and tax rules (`amendTotals`), never typed in.
- Gift-card and loyalty-point bills can't be corrected here, and neither mode can be added:
  both are tied to balances elsewhere.
- Cloud: `guard_settled_bill_amendment` enforces all of the above by the cloud's clock (a money
  change on a settled bill without a new amendment entry is refused — so "Keep my changes" on a
  stale settled copy can't silently rewrite payments). `resync_bill_payments_after_amendment`
  drops ledger rows that no longer match, and the push re-inserts the new ones. Maintenance
  edits with no signed-in user pass. Migration:
  `docs/migrations/2026-11-19-settled-bill-correction.sql` — **applied 19 Nov 2026**; tested on a local Postgres 16 with
  stand-in auth (15 cases: admin within/after 48 h, blank reason, edited history, items/bill
  no./time changes, gift card, cashier, maintenance, feedback-only).

## Cash counter removed (19 Nov 2026)

The day-end Cash counter (Summary → Cash counter, `DayCloseTab`, `counter-logic.ts`) is gone at
the owner's request: settlement and the dashboard already show cash. The Roles switch "Daily
summary" (`dailySummary`) is no longer offered, and Excel exports no "Day closes" sheet. Kept on
purpose: the `DayClose` type, the `dayCloses` table and `day_close` sync, so closes recorded
before still sync and stay in the audit log. Don't build anything new on them.

## Purchase: how it was paid, Spend dashboard, item list (19 Nov 2026)

- **Payment on every purchase** (`purchase-pay-logic.ts`, tested): `payments` (Cash, UPI, Card,
  Bank transfer, Pay later = vendor credit) — split allowed — plus `roundOff` held to ±₹100.
  No bank accounts, only the method. Payments must equal items total + round-off;
  `recordStockEntry` and `updatePurchase` refuse anything else, including an edit that changes
  items under old payments. The form (`PurchasePayments`) keeps one line following the total
  until an amount is typed or the payment is split, and offers the round-off when what was
  paid differs by ≤ ₹100. Older purchases read "Payment not recorded".
- `entryAmount` includes a purchase's round-off, so spend, vendor totals and the Brand P&L
  count what was actually paid. The cloud (`protect_purchase_ledger`) only checks lines, so no
  migration was needed; payments are client-checked.
- **Spend dashboard** (`PurchaseSpendDashboard`, admin): period Daily/Weekly/Monthly drives
  everything — spend with change vs the previous equal window, bills and average bill, pay
  later, returns; "How it was paid" split bar; spend per vendor chart; top vendors with share;
  top items with the latest price change. Figures from `spendSummary`, `topItems`,
  `itemInsight`, `entriesBetween` in purchase-logic.ts (tested in purchase-insights.test.ts).
- **Items tab** (`PurchaseItemsList`): search, sort (Most spent / Recent / A–Z), one card per
  item with latest price and its change from the previous purchase (red up, green down),
  average price, quantity, bills, amount; opens to its purchase lines. Phones show a short date
  with the vendor under it and the unit price under the quantity, so the amount never scrolls
  off.
- Purchase header: four KPI cards (spent this month, pay later this month, waiting for
  approval, items). Admins land on Spend. Bill cards and the Excel History sheet show "Paid by".
- Not yet: settling "Pay later" (marking vendor credit paid) — the dashboard shows it as owed.

## Windows 7 counters: Chrome 109 colours and dropdowns (19 Nov 2026)

The counter PCs run Windows 7, so Chrome 109 at most. Tailwind 4 writes every translucent
colour (`bg-gold/15`, `border-border/50`…) as a FULL-colour fallback plus the real tint inside
`@supports (color: color-mix())`, which Chrome 109 lacks — so tinted tiles, banners and badges
turned solid (orange text on solid orange, solid red alerts). Fixed at build time:

- `src/build/legacy-colors.ts` (tested) adds `--x-rgb` channel tokens beside every hex token
  (per theme) and rewrites each paired fallback to `rgb(var(--x-rgb) / N%)`, splitting the
  fallbacks Tailwind shares between `.bg-x` and `.bg-x/40`. The `xtsy-legacy-colors` plugin in
  vite.config.ts runs it on the emitted CSS (build only; dev is unchanged). New browsers still
  use the color-mix rules. ~109 fallbacks rewritten.
- `select option` gets explicit popover colours (Windows drew the native list pale on white).
- `@supports not (color: color-mix(...))` (old browsers only) brightens `--muted-foreground`,
  `--border`, `--input` and sets body weight 500 on staff screens, for the dim screens.
- Checked by simulating Chrome 109 (stripping the color-mix @supports blocks) on the real
  Tables screen: old CSS showed the solid orange banner and table; new CSS matches modern.
- **Don't use colours that only exist inside color-mix/oklch without a hex token** — anything
  added to the theme must be a hex `--token` so the build can make its `-rgb` twin.

## Guests: priority, guest discount, bill messages, suggestions (19 Nov 2026)

- Customer fields: `priority` (star in the list, suggestions and on the bill), `discountPct`
  (standing discount, auto-applied once per bill when the guest is picked and the bill has none;
  staff may still change it), `billMessages` (WhatsApp bill message offered after settling; on
  unless false). Offers stay `whatsapp.optIn` (consent) — never merged with bill messages.
- Priority and discount are admin-only: Guest settings on the profile; cloud
  `guard_customer_points_adjustment` quietly keeps non-admin changes to `pointsAdjustment`,
  `discountPct` and `priority` from landing (docs/migrations/2026-11-19-guest-discount-admin-only.sql,
  tested on local Postgres) — **applied 19 Nov 2026**.
- After settlement, a guest with a mobile and bill messages on gets a 20 s toast "Send POS/… on
  WhatsApp?" opening `waLink` with `billMessage` (customer-logic.ts). One-tap (wa.me), not the
  Business API: automatic sending still needs WHATSAPP_ACCESS_TOKEN / PHONE_NUMBER_ID and an
  approved template.
- Profile: stats, Guest settings, a WhatsApp block (test message = their last bill, review
  request, offers consent), details, points, visits. List: KPI cards, sort, Priority filter,
  initials avatars, discount chip.
- Bill name box (`GuestDetailsFields`): `guestMatches` ranks starts-with, then word-start, then
  anywhere/phone digits; priority and frequent guests first. Gold-bordered "Returning guest"
  list with ↑↓/Enter; the picked guest's priority, discount and note show under the fields.
  The discount menu always includes the bill's current % (a 12% guest discount isn't a preset).
- Live status: loyalty card removed (points live in the guest profile); KOT times read
  "Today, 9:42 am" / "Yesterday, …" / "15 Nov, …" (`kotWhen`), and running bills say
  "Running bill · open 2 h 15 min".

## Purchase → Purchases and History as itemized bill cards (19 Nov 2026)

- **List view (owner's request, 19 Nov):** each bill is a compact row in one list per day
  (`divide-y` container): chevron, icon, vendor + status, "#invoice · time · by · N items",
  how it was paid (md+), total. Click opens the itemized receipt below the row. Bills waiting
  for approval start open (approve panel). Under a day heading rows show the time only
  (`showDate={false}`). The Vendors tab's day lists use the same rows.
- `PurchaseBillCard`: receipt-style card per bill — icon tile, vendor, invoice `#`, date/time,
  who recorded it, approval chip, total and item count; payment chips (Pay later in red,
  "Payment not recorded" dashed) and round-off; dashed item rows "qty × price" with the line
  amount (first 5, "Show all N items"); approve panel and actions (Return items, Edit, Delete)
  in the foot. Returns have a red edge, "−₹" total and "Against purchase #…".
- Both tabs: search (vendor, invoice no. or item — `billMatches`), filter chips (Purchases:
  All / Pay later / Waiting for approval / Payment not recorded; History: All / Purchases /
  Returns), grouped by day with sticky headings "Today", "Yesterday", "Sun, 15 Nov 2026" and the
  day's net total (`billsByDay`: approved only, returns subtract, round-off in). Two columns
  from `lg`. Tested in purchase-bills.test.ts.

## Super admin console: products, Sign in as, Swiggy/Zomato sandbox (19 Nov 2026)

- **Products** replaces the Restaurants tab: Products (Restaurant POS live; Hotel, Resort,
  Hostel and Tourism POS "coming soon") → a product's outlets (search, Live/Stopped/Trial/
  Payment due filters, onboarding) → one outlet with sections Overview, Plan & billing, Users,
  Devices, Swiggy & Zomato. Address is the hash (`products.ts`: `#products/restaurant_pos/<id>/users`);
  `#restaurants` still opens Restaurant POS. An outlet's product is `restaurants.branding.product`
  (none = restaurant_pos; onboarding now writes it). The old RestaurantCard is split into
  `RestaurantInfo`, `SubscriptionSection`, `DevicesSection`, `SeatsSummary` in ConsoleRestaurants.tsx.
- **Sign in as** (Users → per login, `support-logic.ts`, tested): required reason (8–200 chars);
  `platformSupportSignIn` checks the super admin, membership, sign-in on, not a super admin
  account; makes a magic link and verifies it on the server with a THROWAWAY client (never the
  shared admin client) and logs `account_events` kind `support_sign_in` (who, whom, why). The
  session goes to a new tab through localStorage `xtsy-support-handoff` (read once, 2 min) —
  never in the URL. `/support` refuses when this browser holds another outlet's unsynced work or
  running bill (`prepareOutletSwitch`), else clears it, sets the session and opens the user's
  own app (`supportAppFor`). During support: `SupportBanner` (fixed, End support signs out and
  clears local data only once the outbox is empty), no terminal registration (`touchTerminal`),
  no app/device rule or first-login approval in AppShell, and writes carry device id
  `xtsy-support-…` (meta `supportDeviceId`) so the restaurant's audit log shows them as support.
  The console lists recent support sign-ins under Users. No password is read, set or entered.
- **Swiggy / Zomato** (`aggregator-logic.ts`, tested): plan feature `aggregators` on Pro Lite, Pro,
  Enterprise / Brand, never Basic; kept OFF the price cards until partner keys exist.
  `restaurant_integrations` (restaurant × platform: off | sandbox | live, store id), set only by
  `platform_set_integration` (refuses Basic and refuses `live` until partner API keys exist).
  `platform_send_test_order` drops a test order (code SW-/ZO-, channel online, delivery,
  `payment='platform'`, `pay_state='paid'`, `is_test`, `source='sandbox'`, no QR number) into ONE
  restaurant's inbox; the console composes it from the outlet's own dishes
  (`platform_menu_dishes`, platform price → portion → price). On the POS it rings like any QR
  order (Bookings shows for platforms even without QR ordering — `useIntegrations`), shows a
  Swiggy/Zomato · sandbox test badge and "Paid on Swiggy · settle by Wallet", and accepting bills
  it as order type swiggy/zomato (`platformOrderType`, `cartLinesFromGuest(..., billAs)`), so the
  platform's prices and the section 9(5) GST rule apply. `guard_guest_order_origin` stops staff
  changing platform / external id / is_test / payment. Migration:
  `docs/migrations/2026-11-19-aggregators-sandbox.sql` (tested on local Postgres 16: 11 cases) —
  **applied 19 Nov 2026**.
- Plan catalogue drifted again by 19 Nov (Basic had purchases; Pro Lite lacked vendors and
  bookings; Pro lacked gift_cards; Pro and Enterprise had kds). Restored to the ladder at the
  owner's choice; TAB Bistro keeps its kitchen screen as a per-outlet override (`kds: true`).
  Console plan edits are not logged — re-check the feature matrix after any plan edit.
- Durability: Dexie v9 indexes `kots.orderUid` and `kots.submissionId`; `kotsForBill` replaces
  full KOT scans at settlement/print numbering, sync renumbering and table moves.

## Activity logs, Pay later payments, Accounts (20 Nov 2026)

- **Console Activity** (`activity-logic.ts`, `ConsoleActivity.tsx`, tested): one plain-language
  line per confirmed action from `account_events` via `platform_activity` (whole platform or one
  outlet; Activity tab, outlet → Activity section, latest 8 on Overview). Saves that changed
  nothing are dropped. Plan catalogue edits are logged by a trigger on `plans`
  (`catalogue_changed`, only the fields that changed, who did it — even direct SQL, shown as
  "System"); console device activate/block/release logs `device_changed`.
  `CatalogueDriftBanner` (Overview, Activity, Plans) compares the active plans to the ladder in
  `plans.ts` (`catalogueDrift`) and offers "Put it back to the ladder". Migration:
  `docs/migrations/2026-11-20-console-activity.sql` (account_events.account_id now nullable).
- **Restaurant audit log** (`audit-story.ts`, tested; Settings → Audit log): each entry becomes one
  readable line ("Bill POS/0055 settled · ₹340", "KOT/0164 sent · Room 666 · Beverages",
  "Payment corrected on POS/0002 · Reason: …"). Routine book-keeping (tables busy/free, KOT bill
  numbers, numbering ids — over half the rows) is hidden unless "Show routine updates" is ticked.
  Secrets (adminCode, any *code/pin/token/key field) are never shown. Support writes show as
  "XTSY support".
- **Ledger** record kind (`ledger-logic.ts` / `ledger-actions.ts`, tested): `vendor_payment`,
  `expense`, `income`; modes cash/upi/card/bank; append-only — a mistake is voided once with a
  reason. Dexie v10 table `ledger`. Cloud guard `guard_ledger_entry`: owner/manager only, valid
  type/mode/amount/date, vendor required for payments, no edits except one void, no deletes.
  Migration: `docs/migrations/2026-11-20-ledger.sql` (adds 'ledger' to the kind check).
- **Pay later → paid** (`PayablesPanel`, Purchase → Pay later tab for admins, and Accounts):
  owed per bill = Pay later part − approved returns (capped) − payments set against it; payments
  go to the oldest bills first (`allocateOldestFirst`), any rest is an advance. Purchase KPI now
  reads "Owed to vendors".
- **Accounts** (`/accounts`, POS Manager, `SCREEN_FEATURE` = `accounting`, owner/manager): period
  Today/This week/This month/Last month; tiles; Profit & loss (sales before GST, purchases less
  returns at what was paid, expenses by category, other income — owner's capital is not income);
  money in/out by mode (Pay later, points, gift cards move no money); Expenses (add, void);
  Pay later; Day book; Excel with all three sheets.
- Both 20 Nov migrations **applied 20 Nov 2026**.
- **Plan test drive (20 Nov, no browser):** cloud rules checked on production inside a DO block
  that ends with RAISE EXCEPTION (everything rolled back; verified nothing kept): per plan the
  features from account_feature, seats from plan_seats, the seat trigger (Basic: 2nd Billdesk and
  any waiter → over_plan and blocked; Pro Lite: 4th Billdesk; Pro/Enterprise fine), grace
  (3 days past paid-until live), lapse (8 days → not live, every terminal blocked), renewal,
  trial running/over, paused, complimentary with no end; plan edit logging; sandbox order row;
  ledger guard. Screens per plan driven locally (shots-tool/plans.mjs) in POS Manager (desktop +
  phone) and POS Billdesk: every nav screen opens, no sideways scroll, and screens outside the plan
  show "isn't part of the … plan" when opened directly (Accounts and Brand only on Enterprise).

## Live test on ZZ Test Kitchen (20 Nov 2026)
- Swiggy sandbox order SW-1380 → accepted → settled with "Paid on Swiggy" (POS/0001, ₹560).
- Vendor + ₹1,200 Pay later purchase → ₹700 UPI payment → ₹500 owed; Accounts on Enterprise shows P&L, money by mode, Pay later.
- Fixed from it: /accounts and /brand were outside the persistent frame (no support banner, PIN lock or plan/device gates) — framed-paths.test.ts now checks every nav screen; receipts say "Paid on Swiggy/Zomato"; audit log purchases read "Purchase from vendor · ₹total" (no ids); renewal amount follows plan; new item standard price defaults to unit price; no "₹-0".
- Test outlet left on Enterprise (trial) with Swiggy + Zomato sandbox on. TAB Bistro still has Zomato sandbox on.

## Website revamp: recorded demo videos, status board, policy pages (26 Nov 2026)
- The home page (src/routes/xtsy-pos.tsx) leads with a real recording of POS Billdesk, then "Watch it work": six videos in public/videos/<id>.mp4 + <id>.jpg poster (billing, waiter, qr-order, purchase, accounts, dashboard; list in DEMOS, site-content.ts). DemoVideo plays muted/looping only while on screen, loads nothing before, and never autoplays under prefers-reduced-motion. The service worker bypasses /videos/ and range requests (a cached 206 breaks playback; sw VERSION v15).
- Recording harness (local only): shots-tool/rec (lib.mjs + v-*.mjs). It seeds TAB Bistro's real public menu and tables into the local app, answers the cloud's numbering/print calls locally, replays the public storefront for the guest video, draws a cursor/finger, blurs payment QR codes, labels owner screens "Demo data" (sample figures, not TAB's takings), captures Chrome screencast frames and encodes H.264 (ffmpeg, veryfast, crf 25). Re-record after UI changes so the videos match the app.
- "Where XTSY POS stands today" (STATUS in site-content.ts) separates Live / Being tested (Swiggy & Zomato sandbox, kitchen screen on request) / Coming next (Hotels & Resorts, Tourism). Never list something under Live before it ships.
- FAQ is faqFor(plans): prices come from the live catalogue (the old FAQ said ₹149/₹299/₹499 while the catalogue said ₹199/₹399/₹599). accounting is back on the price cards (it shipped); aggregators stays off until live.
- Pricing shows each plan as a printed bill (Courier New, as the real slip) listing only what it adds over the plan before, then the full comparison table.
- Policy pages /privacy, /terms, /refunds (LegalPage), linked from the footer, in the sitemap and robots, and passed through on website-only hosts. They are drafts written from how the product works; a lawyer should review them, and the grievance officer's name still has to be added.
- Dashboard KPI tiles: no icon and 22px amounts where four tiles share a laptop row (lg–2xl), so amounts never split ("₹12,3 / 60").

## Business day, launch splash, opening word, Noir QR cards (26 Nov 2026)
- **Business day runs 6 am to 6 am** (`src/lib/business-day.ts`, `DAY_OPENS_HOUR = 6`, tested). Late closes (usually 12:30–1 am, up to 3 am) count in the previous day's sales: POS/0112 and POS/0131, settled 12:02 am on 26 Nov, belong to 25 Nov. Only the grouping changes: settlement times, invoice dates and logs stay as recorded. Used by Sales Summary (`presetRange`, `dailySales`, date inputs), dashboard, forecast, Accounts, GSTR-1 ranges, Orders/Live totals, kitchen and tables. Purchases and expenses stored at midnight count by their calendar date (`entryDayAt`), and reservations stay on calendar dates. Brand's cloud `outlet_sales` still groups by calendar date (needs a DB change).
- **Launch splash** (`LaunchSplash.tsx`, `launch-logic.ts`): XTSY logo with a gold ring drawing, "XTSY POS", "POS by XTSY", about 3.4 s, once per window (sessionStorage `xtsy-launch-shown`), any tap/key skips, reduced motion 1.2 s. The loading screen and the app each mount a copy; a module-level start time plus the `--xl-t` CSS offset make the second copy carry on instead of restarting. `XtsyLoader` is the loading screen.
- **Opening word on POS Billdesk** (`DailyWelcome.tsx`, `daily-word.ts`, tested): the first open of each business day from 6 am (per device, localStorage `xtsy-daily-word`) shows a greeting, the date and one Bible verse (KJV, public domain; 13 verses, one a day in turn — Bible only, at the owner's request, 26 Nov); "Start the day" closes it. Not shown in support sessions, nor between midnight and 6 am. Verse texts were checked against public-domain sources; don't add a verse without checking its wording.
- **Guest page** (`order.$slug.tsx`, xtsy theme) follows xtsy.one: ink announcement bar, large Staatliches title, "Stay with XTSY" / "XTSY Voyage" links from `brand.links`.
- Recording harness: `open({ intro: true })` to show the splash and opening word; demo videos skip them by default.
- **Stuck cloud connection** (`cloud-health.ts`, `CloudStuckNotice.tsx`, tested): when a number request times out (15 s) with the internet up and the device can't number offline, a plain request to `/auth/v1/health` decides: if the cloud answers, the app's own connection is stuck, so the error says so and a persistent "Reconnect" toast reloads POS (items stay in IndexedDB). Seen on Reception, 26 Nov: no check-in 4:48–7 pm with working Wi-Fi; a reload fixed it.

## PMS by XTSY: front desk, first release (27 Nov 2026)
- Hostel first (owner's choice), piloted at XTSY Travellers Hostel; Hotel and Resort POS reuse the same core. Screen `/front-desk` (Front desk in the nav for POS Manager, POS Billdesk and the cashier role), gated by plan feature `pms`, which is in `DEFAULT_OFF` and on no plan: XTSY switches it on per property with the console's feature override. Off the price cards until it ships.
- Core is pure and tested in `src/lib/pms` (`pms.test.ts`): `types` (UnitType sold as bed or room, Unit with housekeeping, Stay with lines/charges/payments), `inventory` (free per night counts bookings without beds too; `pickUnits` puts a group in the lowest-numbered room that fits all of them and splits only when none does — the owner's sheet rule), `folio` (stay GST per unit per night: nil ≤ ₹1,000, 5% ≤ ₹7,500, 18% above; `advanceFor` 25%), `stay-flow` (booking problems, check-in needs beds given, clean rooms and the ID seen; check-out needs ₹0 due and no open POS room bills; cancel needs a reason; no-show from the day after arrival; Form-III due 24 h after a foreign guest checks in), `reports` (arrivals/departures/in-house, occupancy, ADR, RevPAR), `room-bills` (open POS bills on the stay's beds/rooms — settled at POS Billdesk, never by the desk).
- Storage: record kinds `unit_type`, `unit`, `stay` in restaurant_records (Dexie v11 tables unitTypes/units/stays), synced like every record. Writes in `pms/actions.ts`. Stay reference `STY-YYMMDD-XXXX` (no cloud call); no GST invoice series yet.
- Cloud guard `docs/migrations/2026-11-27-pms-front-desk.sql` (adds the kinds, `guard_pms_record`, `pms` in `restaurant_entitlements`): feature must be on; owner/manager for types and rates; owner/manager/cashier for units and stays; stays never deleted, start as booked, move only booked → checked_in/cancelled/no_show and checked_in → checked_out; closed stays only take a Form-III note; payments and charges are append-only. Tested on a local Postgres 16 with stand-in auth (20 cases). NOT applied yet: needs the owner's approval.
- **Channel manager (owner's decision, 26 Nov 2026, replaces the earlier split):** the PMS is the ONE system that sends room counts and prices to ZimmerStack for every property it runs, XTSY's own hostel and camp included; the xtsy.one booking engine (jibo-libo) moves to reading availability from the PMS and sending its website bookings to it. ZimmerStack still takes one sender per hotel, so each property switches over in one step (load and match → run side by side with the engine still sending → switch on a quiet day, the engine's sending off, with a one-setting rollback). Key: secret `ZIMMERSTACK_CONNECT_KEY` on this app's server (the package reads that name), separate from the website's key. `src/lib/pms/channel/zimmerstack.server.ts` (server only; reads so far: key check, test/live, hotels reached) behind `platformChannelStatus` (super admin) → Console → stay property → Channel manager. Plan detail: `docs/pms-channel-plan.md`.
- Applied 26 Nov 2026 (owner approved): `2026-11-27-pms-front-desk.sql`; checked on production in a rolled-back DO block (book, payment removal refused, skipping check-in refused, check-in, delete refused).
- Console: Hostel POS is a **pilot** product (`status: "pilot"`): open for onboarding, labelled Pilot. Onboarding a Hotel/Resort/Hostel POS outlet (`STAY_PRODUCTS`) writes `branding.product` and sets `feature_overrides.pms = true` on the account. Business model `hostel` added.
- Stay products never use the restaurant price list: they are onboarded only on plan `stay_pilot` ("Hostel POS · Pilot", ₹0, complimentary, status active; Pro features + `pms` + `audit_log`; 4 Billdesk / 2 admin / 2 waiter seats), `onboardingPlansFor(product)` in platform-restaurant-logic.ts. Plan row inserted 27 Nov 2026 at the owner's choice; not in `PUBLIC_PLAN_IDS`, so it never reaches the website. Real stay prices come after the pilot.
- Harness: `shots-tool/rec/pms-drive.mjs` sets up the hostel layout through the real actions and drives booking → beds → check-in → payment → check-out.

## Hostel / Hotel / Resort POS: its own app, YCS-style, in the xtsy.one look (27 Nov 2026)
- Owner's direction: stay products are NOT the restaurant app with a desk tab; they are a property platform like Agoda YCS. The outlet's product reaches the client as `SignedInStaff.product` / `Membership.product` (from `restaurants.branding`, auth-context.tsx). `isStayProduct(user.product)` in AppShell switches to `STAY_SCREENS` (manager: Home `/stays`, Rates `/stays/rates`, Bookings `/stays/bookings`, Desk `/front-desk`, Reports `/stays/reports`, Property `/stays/property`, Guests, Settings; pos adds the café's Tables/Menu), redirects any other screen to the first stay screen, names the app "<Product> · Manager/Front desk", and puts `theme-xtsy` on <html> (RootShell does it for /stays during SSR). Restaurant outlets are untouched and stay black until the owner reviews the restaurant restyle (agreed order: Hostel POS first, then all apps after screenshots, published outside service hours).
- `NAV` matching picks the LONGEST matching path (`/stays/rates` before `/stays`); the active nav item is `current`.
- Rates & availability (`pms/rates.ts`, tested): `UnitType.calendar` holds only real per-night changes (`rate` ≠ base, `closed` = stop-sell online; the desk can still book). `applyRange` with optional weekdays, ≤ 366 nights; `pruneCalendar` drops past nights on save; `quoteRate` (average over the stay) prices new bookings; `rateGrid` feeds the 14-night grid (left to sell, rate, open/closed). Saved by `saveRates` (owner/manager; the cloud guard already limits unit_type writes to them).
- Bookings list (`pms/bookings-logic.ts`, tested): search by name, reference, OTA id or phone digits; status, channel and stay-dates filters; `bySource` revenue/nights per channel for Reports.
- Harness: `shots-tool/rec/stays-drive.mjs` (open with `product: "hostel_pos", outlet: "XTSY Travellers Hostel"`) sets up the hostel, bookings and rate changes and screenshots every stay screen at 1440 and 412 (no sideways scroll).

## One sign-in per product, product-specific console, two-product website, smart rates (27 Nov 2026)
- **Sign-in doors** (`src/lib/login-doors.ts`, tested): Restaurant POS at `/login`, Hostel & Hotel POS (hostel/hotel/resort products) at `/hostel/login`, both rendered by `SignInScreen` (`door` prop). The stay door offers Property Manager (→ `/stays`) and Front Desk (→ `/front-desk`), no Waiter Pro, and wears `theme-xtsy` (RootShell adds it for `/hostel` and `/console`). After the password check the door reads the person's outlets' products; a login for the other product is signed out with "This login is for … Sign in at … instead." Signed-in people at the wrong door are sent to the right one. The device remembers its door (`xtsy-door`), and every sign-out goes to `signInPath()`. A future model = a door in `DOORS` + a route file.
- Hostel POS is shown as **Hostel & Hotel POS** (PMS + channel manager as one software); `hotel_pos` is now "Hotel POS · multi-property" (soon).
- **Console per product**: `sectionsFor(product)` — stays get Channel manager, never Swiggy & Zomato; restaurants the reverse (also enforced in `parseConsoleHash`). Features per product: `featuresFor(stay)` / `STAY_FEATURES` / `featureName` in plans.ts (stays never see aggregators, waiter_app, kds, recipes, bookings, gift_cards, online_ordering; restaurants never see pms). Stay plans are `stay_*` rows (`isStayPlan`): the plan picker offers only the product's own plans, and Plans lists Restaurant POS and Hostel & Hotel POS separately. The console wears the xtsy.one look (cream, ink, crimson).
- **Smart layer** (`pms/smart.ts`, tested): `rateSuggestions` per type and night (busy +10%/+20%, weekend +10% from 50%, close-in empty −10%, clamp 70–160% of base, rounded; only in the reason's direction; closed/sold-out skipped) shown on Rates (`SmartRates`, Apply / Apply all, owner/manager); `stayInsights` on Home (`StayInsights`: slow nights, sell-outs, pickup, booking-site share, money to collect). Nothing changes without a tap.
- **Website**: two products (`SITE_PRODUCTS`, `STAY_FEATURE_BLOCKS`, `#products`, `#stays` with screens in `public/site/`, robots allows `/site/`). Hostel & Hotel POS is "Pilot" with no price; the channel manager is "Rolling out" (not sending yet) — keep it so until ZimmerStack is connected. Enquiries carry the product.
- **No property names on the public website (owner, 27 Nov 2026):** never name XTSY Travellers Hostel, its rooms (Experience by XTSY) or its location on the website, status board or FAQ; stay screenshots use the made-up "Pinewood Backpackers" (`shots-tool/rec/demo-stays-drive.mjs`). XTSY Ventures Private Limited is a DPIIT-recognised startup headquartered in Coimbatore, Tamil Nadu: policy pages and terms (courts at Coimbatore) say so. TAB Bistro's own pages keep its New Shillong address.

## Website: one page per POS model, subscription-first, xtsy.one look (27 Nov 2026)
- Five model pages (`/restaurant-pos`, `/hostel-pos`, `/hotel-pos`, `/resort-pos`, `/tourism-pos`), all from `SITE_MODELS` in `src/lib/site-models.ts` (tested) and rendered by `components/site/ModelPage.tsx`; each loads the plan catalogue in its loader and sets its own head (`site-head.ts`). Home (`xtsy-pos.tsx`) leads with the plan builder (`PlanBuilder`, a tab per model, outlet count, monthly total), then the five models, a demo, how subscribing works, status, FAQ and the enquiry (`EnquiryForm`, model + plan). Shared chrome in `SiteChrome.tsx`. The whole site wears `theme-xtsy` (RootShell lists the paths); model pages pass through on website-only hosts and are in robots and the sitemap.
- Names: Hostel POS (pilot) and Hotel POS (coming soon) are separate models again; the stay sign-in door says "Hostel POS".
- Pricing per model lives in the one catalogue, told apart by plan-id prefix (`PLAN_PREFIX`, `planProduct`, `newPlanId` in products.ts): restaurant plans unprefixed, `hostel_*` (+ the internal `stay_pilot`), `hotel_*`, `resort_*`, `tourism_*`. Console → Plans has a tab per model and "Add a … plan" (`platform_save_plan` upserts; new plans start with `STARTER_FEATURES`). A model with no public plans shows "Prices on request" / pilot / waitlist on its page. `planFitsProduct` lets onboarding use a stay product's own plans.
- The Swiggy/Zomato "own your brand" story is gone from the website (owner, 27 Nov): don't position QR ordering against aggregators ("no commission") in public copy.

## Every app in the xtsy.one look (27 Nov 2026, owner: "make it live")
- Supersedes "Classic black brand theme": RootShell puts `theme-xtsy` on <html> for EVERY page (staff apps, console, guest pages, website); nothing adds or removes it any more (the AppShell, /order and /book toggles are gone). Waiter Pro no longer forces `.dark`.
- Night bars: the top bar and phone tab bar keep `className="dark glass-dark"`; inside the light look `.theme-xtsy .dark` is an ink palette (ink #1f2230 / #2b2f40 surfaces, cream text, rose #e8b4c0 accent, amber #f0b45a waiting). `glass-dark` is ink with a solid fallback first (Chrome 109 lacks color-mix).
- `--gold` in the light palette is amber #a65a00 with white foreground ("waiting" / "needs attention", 4.6:1 on cream); on a light gold tint use `text-warning`, never `text-gold-foreground`.
- Veg / non-veg marks use fixed colours (#12893c / #b3261e), not theme tokens, on VegMark and the counter's dish tiles.
- Launch splash and the opening word are ink with rose accents. Install manifests use ink #1f2230. Share image `public/og-xtsy-pos.png` redrawn (cream, five models).
- Demo videos re-recorded in the new look; DemoVideo appends `?v=${VIDEO_VERSION}` — bump it whenever the recordings change.

## Production audit (27 Nov 2026)
- **Staff layer is lazy** (`src/components/StaffLayer.tsx`, `src/lib/public-paths.ts`, tested): AuthProvider, LiveSync, PrintHost, the KOT/counter-print watchers, AppInstall, PreloadScreens and PersistentFrame load only off public pages (website, model pages, policies, /order, /book, /tab-bistro), which get `<AuthProvider><Outlet/>` instead. The website no longer downloads ~1 MB of staff code. **Keep AuthProvider inside StaffLayer**: started above the lazy boundary, the sign-in state finished loading before the chunk arrived and every staff screen failed hydration. A new public page must be added to `isPublicPath`; a new staff page needs nothing.
- `--input` (field outlines) is #958a78 (3:1, WCAG 1.4.11); `--border` stays soft for cards. Old counters (no color-mix) get body weight 500 and darker muted text in the light look; the dead `html:not(.theme-xtsy)` rules are gone.
- Website heads: titles ≤ 65 and descriptions ≤ 160 characters; policy pages carry canonicals. `shots-tool/rec/site-audit.mjs` checks titles, descriptions, canonicals, one h1, JSON-LD, alt text, control names, field labels, internal links, sitemap and robots.
- Production checked: POS/0001–0136 and KOT/0001–0400 continuous with no duplicates; plan catalogue matches the ladder; RLS-without-policy tables are deny-all; anon-callable SECURITY DEFINER functions are triggers or self-checking. Open: `stay_pilot` still carries restaurant-only features (aggregators, waiter_app, bookings, gift_cards, recipes, online_ordering) — needs the owner's yes to change. The custom domain redirects www → bare while canonicals, QR codes and APP_ORIGIN say www: set www as primary in Lovable's domain settings.

## Security findings fixed (27 Nov 2026, Lovable security scan)
- **Guest-order field guard** (`docs/migrations/2026-11-27-guest-order-field-guard.sql`, applied 27 Nov; 19 local cases): for a signed-in non-super-admin, `guard_guest_order_origin` locks everything the guest/platform set (phone, name, WhatsApp consent, lines, totals, address, UPI ref, proof, token, restaurant, channel…). `pay_state` may only move awaiting_confirm→awaiting_payment (+confirmed_at) or proof_sent→paid (+paid_at) — the two steps `confirm_guest_order_payment` / `verify_guest_order_payment` take. Staff updates that stay allowed: status, handled_by, reason, bill_no, order_uid, table_id/table_label. Anonymous guests and the server (no auth.uid) are unaffected. **Any new staff-editable guest_orders column must be allowed here explicitly.**
- **One "order ready" WhatsApp per order:** `guest_orders.ready_notified_at` is set once and never cleared; `sendOrderReadyMessage` claims it before sending.
- **Server logs carry no personal data:** the console.error wrapper in `error-capture.ts` runs `redactPersonal` (emails → [email], Indian mobiles → [phone]) on errors, strings and objects.
- **Records after expiry** (`docs/migrations/2026-11-27-records-read-after-expiry.sql`, applied; 5 local cases): restaurant_records SELECT is `restaurant_id IN (SELECT readable_restaurant_ids())` — members while the account is live, only owner/manager after expiry (so the outlet can still recover and export its data). Replaces both old SELECT policies.
- Admin WhatsApp campaigns stay as designed (owner/manager, approved templates, opted-in guests only).

## Hostel POS is PMS + channel manager + booking engine only (owner, 27 Nov 2026)
- No restaurant platform in Hostel POS: `STAY_FEATURES` has no billing, menu, qr_ordering, aggregators, waiter_app, kds, recipes, bookings, gift_cards or online_ordering; the Front Desk app has no café Tables/Menu. `stay_pilot` in the cloud now carries exactly the 12 PMS features with 0 waiter seats. A café on a property runs on Restaurant POS (its own product and sign-in).
- Website: Hostel POS is "PMS, channel manager and booking engine in one"; booking engine (website booking page, e.g. xtsy.one/book reading the PMS) is "Rolling out" until jibo-libo is switched over, like the channel manager.

## One sign-in route per POS model, model-specific seats (27 Nov 2026)
- Doors are per product (`login-doors.ts`, tested): `/restaurant/login` (and `/login`, kept for installed counter apps and old links), `/hostel/login`, `/hotel/login`, `/resort/login`, `/tourism/login`. Only open products (Restaurant, Hostel) show a form; coming-soon doors show the waitlist. A login is refused at another product's door ("This login is for … Sign in at …"). Signed in to another product on this device, a door shows "This device is signed in to … on …" with "Sign out and use …" instead of silently redirecting. Remembered door is the product id (old "stay"/"restaurant" values still map).
- **Device switch on sign-in** (`device-switch.ts`, tested rule `deviceSwitchDecision`): a device bound to another outlet is cleared (`resetDevice`) at sign-in when its outbox and drafts are empty; otherwise the sign-in is refused with what to sync first. This is what lets the Lovable preview move from TAB Bistro to the hostel.
- Seats per model (`seatAppsFor`, `SEAT_APPS_BY_MODEL` in plans.ts): Restaurant POS → POS Billdesk / Waiter Pro / POS Manager; stays → Front Desk / Property Manager (no waiter; plan editor saves waiter 0); Tourism → Booking desk / Tour Manager. Used by the console plan editor, outlet seats and devices, the in-app "no free seat" message and the website price cards.

## Each POS model has its own features and prices (owner approved, 27 Nov 2026)
- Stay-only feature keys (`STAY_ONLY` in plans.ts): `booking_engine`, `channel_manager`, `rate_suggestions`, `multi_property`, `restaurant_link`. Restaurant POS never shows them; Hostel plans never carry billing/menu/waiter/QR/kitchen/aggregators. `restaurant_entitlements()` names them (migration `docs/migrations/2026-11-27-model-plans-and-prices.sql`, **applied 27 Nov 2026**). `rate_suggestions` gates Suggested rates on /stays/rates.
- **Restaurant POS** per outlet per month: Basic ₹449, Pro Lite ₹899, Pro ₹1,299, Enterprise / Brand ₹1,999 (seats unchanged).
- **Hostel POS** (superseded the same day, see "Hostel POS priced by rooms" below) — originally per property per month (`HOSTEL_PLANS`, cloud `hostel_essential` / `hostel_connect` / `hostel_group`, waiter seats 0): Essential ₹1,299 (PMS, GST folios, Property Manager app, dashboard, booking engine; 2 Front Desk / 1 Property Manager), Connect ₹2,299 (+ channel manager, smart rates, loyalty, approval codes, audit log; 4 / 2), Group ₹3,999 (+ several properties, accounts, purchases, vendors; unlimited / 4, max 10 properties). Onboarding offers them plus `stay_pilot`. The console drift check covers these too.
- **Restaurant POS link** (`restaurant_link`) is an add-on on no plan, DEFAULT_OFF, switched on per property by XTSY's feature override; it will sync a hostel with a café on Restaurant POS (room bills, guests). Not built yet: listed "Add-on · coming".
- `STAY_FEATURE_STATE` labels unshipped stay features on price cards and the plan builder: booking engine and channel manager "Rolling out", several properties/accounts/purchases/vendors/marketing "Coming" (no Hostel POS screen yet). Change a label only when the feature ships.

## Hostel POS priced by rooms (owner, 27 Nov 2026)
- Essential ₹2,299 a month for one property up to 8 rooms; Connect ₹2,899 for one property up to 15 rooms; each room above that ₹300 a month. Group ₹7,999 a month for up to 5 properties (no room limit), Front Desk unlimited, 2 Property Manager devices per property (seats are counted per property by `plan_seats`, so `admin_seats = 2`).
- Cloud: `plans.included_rooms` and `plans.extra_room_price` (`docs/migrations/2026-11-27-hostel-room-pricing.sql`, **applied 27 Nov 2026**); `max_outlets` is the property limit (1, 1, 5). `stayPlanTotal(plan, rooms)` and `roomPriceText` in plans.ts (tested). The website's price cards print the room line, the plan builder asks for rooms on Essential/Connect, and Console → Renewal and payment asks for the property's room count and fills the amount.
- Console → Plans edits the room fields and the properties covered for stay plans (`platform_save_plan` `_set_rooms`, `_included_rooms`, `_extra_room_price`, `_max_outlets`); restaurant saves and the drift restore never touch them.
- **Website shows prices only after `docs/migrations/2026-11-27-plans-public-read.sql`**: the old plans policy called `is_platform_admin()`, which anon can't execute, so visitors' catalogue reads fail and the site falls back to compiled prices. **Applied 27 Nov 2026** (owner approved).

## Client prices: current clients keep their price, offers per client (owner, 27 Nov 2026)
- Payments stay manual. The website price is the plan's list price (`plans`); each client may have its own: `accounts.custom_price`, `custom_included_rooms`, `custom_extra_room_price`, `price_note` (the offer, required), `price_set_at` (`docs/migrations/2026-11-27-client-prices.sql`, **applied 27 Nov 2026**, checked in a rolled-back DO block).
- **Changing a plan's price or room terms never changes what current clients pay**: trigger `plans_keep_customer_prices` copies the OLD terms onto every active/trialing/past-due, non-complimentary account on that plan that has no own price yet, and logs `price_kept`. A second change keeps the first kept price. So Claude (or the console) may change website prices freely.
- Moving a client to another plan drops its own price (`accounts_clear_custom_price`), unless the same update sets a new one.
- Super admin sets/clears a client's price with `platform_set_account_price` (logs `price_changed`): Console → outlet → Plan & billing → **Client price** ("Set an offer price", "Use list price"). Renewal and payment, the outlet's plan screen (`restaurant_entitlements.price` = own price, `listPrice`, `priceNote`) and the console's monthly revenue (`clientTerms` in plans.ts, tested; once per account) all use what the client pays. Restaurant owners/managers cannot change prices (super admin only, as with renewals).

## Silent routes: Lovable's page list shows only the POS model pages (owner, 27 Nov 2026)
- Lovable's preview page list shows static routes and skips routes with a `$` param. So every in-app screen, sign-in door, policy page and TAB Bistro page is a **silent route**: file `x.{-$sub}.tsx`, id `/x/{-$sub}`. The optional segment keeps the address exactly `/x`; only `/`, `/restaurant-pos`, `/hostel-pos`, `/hotel-pos`, `/resort-pos` and `/tourism-pos` stay listed.
- `src/lib/silent-route.ts`: `silent("/dashboard")` gives the typed route id for `to` (URL stays `/dashboard`); literal links use `to="/dashboard/{-$sub}"`. Every silent route sets `params: SILENT_PARAMS`, so `/dashboard/anything` is a 404 instead of the dashboard.
- TAB Bistro pages sit under the pathless layout `_bistro.tsx` (`_bistro.tab-bistro.{-$sub}.tsx`, `…menu.{-$sub}.tsx`, …) so `/tab-bistro` isn't listed as a layout path.
- **A new in-app screen must be a silent route** (`name.{-$sub}.tsx` + `params: SILENT_PARAMS`); a new public model page is a plain file route. Paths in code (NAV, SCREEN_FEATURE, isPublicPath, pathname checks) stay plain `/x`.

## Addresses per POS model (owner, 27 Nov 2026; supersedes the sign-in paths above)
- **Listed in Lovable** (plain file routes): `/` (website; `/homepage` is the same page and shows as `/`), the model pages `/restaurant-pos` … `/tourism-pos`, and the sign-in pages `/restaurantpos`, `/hostelpos`, `/hotelpos`, `/resortpos`, `/tourismpos` (`DOORS[...].path`). Old sign-ins (`/login`, `/restaurant/login`, `/hostel/login` …) redirect there with their query; `/xtsy-pos` redirects to `/`. `SITE_PATH` is `/homepage`.
- **App screens live under their model's folder** (`src/lib/public-urls.ts`, tested; wired into `router.tsx` rewrite input/output): Restaurant POS `/restaurant/bill?table=…` (the bill screen, internally `/` + `?table`/`?bill`; with neither it opens Tables), `/restaurant/tables`, `/dashboard`, `/menu`, `/purchase` (= internal `/stock`), `/guests` (= `/customers`), `/reports`, `/accounts`, `/brand`, `/kitchen`, `/marketing`, `/settings`, `/waiter`, `/setup`, `/manager`, `/front-desk`; Hostel POS `/hostel/dashboard` (= `/stays`), `/hostel/rates`, `/bookings`, `/reports`, `/property`, `/front-desk`, `/guests`, `/settings` (Hotel/Resort the same under `/hotel/…`, `/resort/…`).
- **Code keeps the internal paths** (`/tables`, `/stays/rates`, NAV, SCREEN_FEATURE, permissions, pathname checks): only the address bar changes. The internal routes are still the silent `x.{-$sub}.tsx` files. Old addresses (`/tables`, `/dashboard` …) still work and canonicalise to the new ones, so installed counter apps (manifests still start at `/tables?app=pos` etc.) and bookmarks keep working.
- Shared screens (guests, settings, front desk) show under the signed-in product's folder: `setUrlModel(urlModelOf(user.product))` in AppShell, and the router's input sets it from the address (server too — the canonical-address check builds the output straight after the input).
- A new restaurant or stay screen needs its public name added to `RESTAURANT` / `STAY` in public-urls.ts.

## Restaurant POS and Hostel POS are separate apps in one browser (owner, 27 Nov 2026)
- `src/lib/app-space.ts` (tested): each tab belongs to one app, decided once from the address it opened on (`/hostel…`, `/hotel…`, `/resort…`, `/stays…` → stay; `?space=stay` forces it; everything else → restaurant). A client-side move to the other app's screens reloads the tab (RootComponent), so it picks up that app's session and data.
- **Separate sign-ins**: app code imports `supabase` from `@/lib/supabase-app`, never `@/integrations/supabase/client` (generated, left untouched). Restaurant tabs use the generated client and its default saved session (counters stayed signed in); stay tabs get their own client with storageKey `xtsy-stay-auth`.
- **Separate offline data and device settings**: `spaced(name)` keeps the restaurant's names and adds `:stay` for the stay app — Dexie `restro-pos` / `restro-pos:stay`, `xtsy-pos-staff`, `xtsy-outlet`, `xtsy-terminal-status`, `xtsy-terminal-name`, `xtsy-door`, `xtsy-support`, `xtsy-admin-code-used`, `xtsy-admin-alerts-seen`. So a running restaurant bill never blocks a hostel sign-in, and each app registers as its own terminal. `signInPath()` never sends a stay tab to the restaurant door.
- Console "Sign in as" for a stay property opens `/support?space=stay` and lands on the stay app's home.
- Harness (`shots-tool/rec/lib.mjs`) seeds both apps' sessions; `two-apps.mjs` checks both signed in at once in one browser.

## Hostel POS front desk pro + its own apps (27 Nov 2026)
- **Hostel POS never links to Restaurant POS apps** (bug: the Hostel sidebar's "Billdesk" opened `/restaurant/tables?app=pos`, and Settings → Logins offered POS Billdesk and Waiter Pro). `staff-login-logic.ts`: `appInfo(app, stay)` (Property Manager → `/stays`, Front Desk → `/front-desk`), `appsOfProduct(stay)` (stay: manager + pos, no waiter), `appLink(app, urlModelOf(product))` (`/hostel/front-desk?app=pos`, `/hostel/dashboard?app=manager`), `accessProblem({... stay})`. AppShell switcher, sidebar name, blocked screen, Logins (no Waiter login card for stays), Terminals and TerminalWaiting use them. Install manifests for stays: `public/manifest-stay-{manager,pos}.webmanifest` (start on `/hostel/...`), picked in AppInstall after mount (server renders the restaurant tags).
- Settings for stays (`STAY_CARDS`): Plan, Terminals, Audit log, Invoice & GST, Property details, Logins, Roles, This device — no tables, printing, QR ordering or marketing. Property details hide FSSAI and business model; Invoice & GST explains room GST slabs (SAC 996311) and shows payment modes only (no service charge, cashier discount, loyalty, KOT). Stay invoices print SAC 996311 when a GSTIN is set, and the invoice footer.
- Front desk pro (code in `src/lib/pms`: `plans.ts`, `tape.ts`, `day.ts`, `invoice.ts`; UI `TapeChart`, `DayTools`, `PlansAndExtras`): tape chart (drag to move, drag the edge to change check-out), rate plans with meal plans, min stay / CTA / CTD on the rates calendar, housekeeping board, night audit (`night_audit` record kind, Dexie v12 `nightAudits`), extras, split payments, change history, and strict GST invoices `STAY/0001` allocated at check-out (online only).
- Migration `docs/migrations/2026-11-27-pms-day-invoice-sandbox.sql` **applied 27 Nov 2026** (owner approved): `night_audit` kind + `guard_night_audit` (record id = date, immutable, never deleted), `STAY` series in the allocator, `sandbox_partner_keys` and `sandbox_events` (RLS on, no client access). Checked in a rolled-back DO block on production: audit insert ok, change/delete/wrong id refused, STAY/0001 idempotent per request then STAY/0002; nothing kept.
- Reference model studied: QloApps (open-source hotel PMS + booking engine + channel connector, PHP). Ideas worth taking: an ARI change queue per room type × night pushed in batches and retried (not a push per edit), length-of-stay restrictions and booking-window offsets in the ARI payload, booking de-duplication by the channel's booking id (new / modify / cancel resolve to one stay), OTA source codes, overbooking flags with a resolve step, connected rooms, a guest registration card, refund rules by days before arrival.

## Booking engine sync and the integration sandbox (27 Nov 2026)
- **Hostel POS pulls from the booking engine** (owner: room types and availability come in automatically on sync). Property → Booking engine connects `xtsy.one` once (`settings.pmsEngine`); `EngineAutoSync` (AppShell, stay products, owner/manager devices only) pulls on open, every 10 min and on focus; "Sync now" too. Feed: `GET https://xtsy.one/api/public/pms-feed` (jibo-libo `src/booking/pmsFeed.ts`; public data only, CORS open). Only `ENGINE_HOSTS` are fetched. Pure plan `pms/engine-sync.ts` (tested): fixed ids `eng-<engineId>` / `eng-<engineId>-<label>` so devices never duplicate; the engine sets name, sold as, guests, women-only, base rate, order; Hostel POS keeps its plans, per-night rates and restrictions; `NightPlan.held` = sold on the engine (website, OTAs, sheet) and `freeByNight` takes it off, so desk bookings come on top (under-sell, never overbook, while both run); engine units no longer listed are archived only when no current stay uses them; hand-made types/units untouched; only changed records are written. `UnitType.channelRef` defaults to the engine id (= the ZimmerStack room-type ref), so one id runs website → PMS → channel manager.
- The two hand-made test types on XTSY Travellers Hostel (8-bed / 6-bed dorms, 14 beds, no stays) were removed on the owner's request (tombstoned, 27 Nov).
- **Integration sandbox** (Console → stay property → Sandbox; `src/lib/sandbox`): only on a TEST property = account `feature_overrides.sandbox = true` (+ `pms`), set only at onboarding ("Sandbox test property" tick). A real property is refused by every path. Channel simulator (Booking.com, Agoda, Airbnb, MakeMyTrip, Goibibo, Expedia, Hostelworld, xtsy.one), ARI preview, bookings with +1 night / move / cancel, sample rooms, partner test keys (`xsb_test_…`, SHA-256 hash kept, shown once; ≤ 10 active) with optional https webhook (public hosts only) and secret (`X-XTSY-Signature: t=…,v1=HMAC-SHA256("<t>.<body>")`, sent once, no retries), event log (`sandbox_events`). Rules in `sandbox/core.ts` (tested): PMS prices (plan-adjusted), restrictions apply, one stay per channel + booking id (repeat returns the first), changes/cancels only while booked, beds by the hostel rule. API `src/routes/api.sandbox.v1.$.ts` at `https://www.posbyxtsy.club/api/sandbox/v1/…` (property, ari, bookings CRUD). Stays carry `sandbox: true`. Server writes use the service role (`guard_pms_record` still applies).
