# PMS by XTSY: channel manager plan (ZimmerStack)

Decided with the owner, 26 Nov 2026.

## One sender per hotel

ZimmerStack takes room counts and prices from exactly one system per hotel. Two systems
pushing absolute counts for the same hotel would put sold rooms back on sale.

| Property | Who sends to ZimmerStack | What the PMS does |
|---|---|---|
| XTSY Travellers Hostel (`XTSY-SHL-HOSTEL`), Shnonpedeng camp (`XTSY-SHN-CAMP`) | The xtsy.one booking engine (`jibo-libo`, `src/booking/channel/zimmerstack.server.ts`) | Sends its own changes (walk-ins, phone bookings, blocks, early check-outs) to the booking engine, and reads the engine's website and OTA bookings. Never calls ZimmerStack. |
| A hotel that buys Hotel / Hostel / Resort POS | The PMS, with XTSY's partner company key | Adds the hotel (`zs.properties.create`), sends room types, rate plans, prices and counts, receives OTA bookings by webhook and reads the event log. |

## Pilot at XTSY Travellers Hostel: the Google Sheet stays the truth

During the pilot the owner keeps typing offline bookings into the Room Management sheet, as
today. The booking engine keeps reading it. The front desk runs alongside: staff record stays,
check-in/out, folios and housekeeping in the PMS. Counts move to the PMS only once the owner is
happy with it.

## Next pieces, in order

1. **Read side (no writes):** the booking engine exposes its confirmed website and OTA bookings
   to the PMS (server-to-server, `XTSY_SAAS_API_KEY`), so they appear on the front desk calendar
   as stays with `source: "website" | "ota"`. Needs a change in `jibo-libo` (this session can
   read that repo but not push to it).
2. **PMS → engine for XTSY properties:** walk-ins and blocks from the desk become console
   closures in the engine, which already sends changed nights to ZimmerStack
   (`afterClosureChange`). The engine stays the only sender.
3. **PMS → ZimmerStack for outside hotels:** a server module in this app, built on
   `@zimmerstack/connect` with the same rules as the engine's (key server-only and never logged,
   writes only on a person's action and only for changed nights, no retry loops, webhook verified
   on the raw body, event log read from the saved place, `goLive` only when a person decides).
   Use a separate company key for this app (a partner may hold 5), so the website's key and the
   PMS's key can be rotated apart.
4. **Stay invoice series:** a strict GST invoice number at check-out (extend the cloud number
   allocator with a stay series). Until then the folio carries the stay reference
   (STY-YYMMDD-XXXX), not a tax invoice number.
