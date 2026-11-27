/**
 * The five XTSY POS models as the website presents them: one page each, with its own words,
 * features, status and prices. Pure data plus small helpers; tested in site-models.test.ts.
 *
 * Honesty rules (owner's, 26–27 Nov 2026): nothing is called live before it ships; the channel
 * manager says "rolling out" until ZimmerStack is connected; no property of XTSY's own is named.
 */
import { PLAN_PREFIX, planProduct, type ProductId } from "./products";
import type { PlanCatalogueRow } from "./public-plans";

export type ModelStatus = "live" | "pilot" | "soon";
export type ModelPath = "/restaurant-pos" | "/hostel-pos" | "/hotel-pos" | "/resort-pos" | "/tourism-pos";

export interface ModelFeature { title: string; text: string; state?: string }
export interface SiteModel {
  id: ProductId;
  path: ModelPath;
  name: string;
  short: string;
  status: ModelStatus;
  for: string;
  /** Page headline and the line under it. */
  headline: string;
  intro: string;
  /** One line for the model's card on the home page. */
  line: string;
  /** Short words for the page's ticker. */
  ticker: string[];
  features: ModelFeature[];
  faq: { q: string; a: string }[];
  /** What the main button says. */
  cta: string;
  seo: { title: string; description: string };
}

export const STATUS_LABEL: Record<ModelStatus, string> = { live: "Live", pilot: "Pilot", soon: "Coming soon" };

const CHANNEL: ModelFeature = {
  title: "Channel manager", state: "Rolling out",
  text: "Room counts and prices go to booking sites through ZimmerStack, from the same calendar the desk uses. The connection is being set up now and isn't sending to booking sites yet.",
};

export const SITE_MODELS: SiteModel[] = [
  {
    id: "restaurant_pos", path: "/restaurant-pos", name: "Restaurant POS", short: "Restaurant", status: "live",
    for: "Restaurants, cafés, fine dine and cloud kitchens",
    headline: "Bill the table. Send the KOT. See every rupee.",
    intro: "The counter, the waiters' phones, guest QR orders and the owner's books, in step live. The counter keeps billing when the internet drops.",
    line: "Counter, waiters, QR orders and the owner's books, in step live.",
    ticker: ["KOTs to every station", "UPI, card and split bills", "GST-ready", "Waiter Pro app", "Guest QR ordering", "Purchases and Pay later", "Profit and loss", "Works offline"],
    features: [
      { title: "POS Billdesk", text: "Tables, running bills, KOTs to each kitchen station, split and part payments, round-off and reprints, on a Windows or Mac counter." },
      { title: "Waiter Pro", text: "Waiters take the order at the table on an Android phone; the KOT reaches the kitchen and the table turns busy on every device." },
      { title: "Guest QR ordering", text: "Guests order from their phone with no app to install. Dine-in, takeaway and delivery, confirmed by your staff." },
      { title: "Purchases and vendors", text: "Supplier bills with approval, returns, Pay later and what you owe each vendor, with spend by item and vendor." },
      { title: "Accounts", text: "Profit and loss, expenses, money in and out by mode and a day book, exported to Excel for your accountant." },
      { title: "Several outlets", text: "Sales together across outlets, push one menu to all, move stock between them." },
    ],
    faq: [
      { q: "Does it work when the internet goes down?", a: "Yes. Bills are saved on the counter first, so billing carries on when the internet doesn't. Everything syncs to every device when the connection comes back." },
      { q: "Which devices does it run on?", a: "POS Billdesk runs on a Windows or Mac computer, POS Manager on any phone, tablet or computer, and Waiter Pro on Android phones and tablets. Thermal printers (58 mm and 80 mm, USB or Bluetooth) print bills and KOTs." },
      { q: "Does it handle GST billing?", a: "Yes. Bills carry your GSTIN, CGST and SGST are worked out per dish, and the sales summary and GSTR-1 report export for your accountant. Restaurants not registered for GST get bills without tax." },
      { q: "Do Swiggy and Zomato orders come into the POS?", a: "Not yet. The connection works in a test sandbox and goes live once Swiggy and Zomato approve partner access. Until then, bill those orders on the POS as Swiggy or Zomato orders." },
    ],
    cta: "Start Restaurant POS",
    seo: { title: "Restaurant POS by XTSY: billing, KOT, QR ordering and accounts", description: "Restaurant billing software for restaurants, cafés, fine dine and cloud kitchens: KOTs, UPI and GST bills, guest QR ordering, a waiter app, purchases and accounts. Keeps billing when the internet drops." },
  },
  {
    id: "hostel_pos", path: "/hostel-pos", name: "Hostel POS", short: "Hostel", status: "pilot",
    for: "Hostels, backpacker stays and homestays",
    headline: "Every bed, every booking, one calendar.",
    intro: "PMS and channel manager as one software. The desk, the owner and the booking sites work from one calendar, and it keeps working when the Wi-Fi doesn't.",
    line: "PMS and channel manager in one: beds, rates, bookings and the front desk.",
    ticker: ["Beds and private rooms", "Rates per night", "Bookings from every channel", "Check-in with ID", "Stay GST folios", "Housekeeping", "Rate suggestions", "Café on the room"],
    features: [
      { title: "One calendar", text: "Every bed and room, night by night: what's left to sell, the rate and whether it's open online. Change one night or a whole season, weekdays only if you like." },
      { title: "Bookings in one list", text: "Walk-ins, phone, your website and booking sites side by side. Search by name, reference, booking id or phone; see what each channel brings in." },
      { title: "Front desk", text: "Give beds or rooms, see the ID, take the advance, check in and out. Foreign guests get a Form-III reminder. Folios work out stay GST by the tariff." },
      { title: "Housekeeping", text: "Clean, dirty or out of order per bed and room, so the desk never gives an unmade bed." },
      { title: "Café on the room", text: "The café bills on the guest's bed or room from POS Billdesk; check-out waits until it's settled." },
      { title: "Smarter rates", text: "Suggestions from your own bookings: busy and weekend nights go up, empty nights close in come down. Nothing changes until you tap Apply." },
      CHANNEL,
    ],
    faq: [
      { q: "Is Hostel POS ready to use?", a: "It is in its pilot: rates, bookings, front desk, housekeeping and reports run every day at the pilot property. More hostels join by invitation; send an enquiry." },
      { q: "Does it include a channel manager?", a: "Yes, as part of the same software, not a separate subscription. The ZimmerStack connection is being set up now and isn't sending to booking sites yet." },
      { q: "Can dorm beds and private rooms sell together?", a: "Yes. Each room type is sold by the bed or by the room, with its own rate and calendar. Groups go into one room where they fit." },
    ],
    cta: "Join the pilot",
    seo: { title: "Hostel POS by XTSY: PMS and channel manager for hostels", description: "Property management for hostels, backpacker stays and homestays: beds and rooms, rates per night, bookings from every channel, front desk with stay GST folios, housekeeping and a channel manager in one." },
  },
  {
    id: "hotel_pos", path: "/hotel-pos", name: "Hotel POS", short: "Hotel", status: "soon",
    for: "Hotels, boutique stays and hotel groups",
    headline: "The front desk, the restaurant and the rooms on one folio.",
    intro: "Built on the same PMS as Hostel POS, for hotels: rate plans, room service and the restaurant on the guest's folio, and several properties under one account.",
    line: "Front desk, rate plans, room service and the restaurant on one folio.",
    ticker: ["Rate plans", "Room service on the folio", "Restaurant POS built in", "Group bookings", "Housekeeping", "Several properties", "Channel manager"],
    features: [
      { title: "Rate plans", text: "Room only, with breakfast, or a package, each with its own price per night and its own rules.", state: "Planned" },
      { title: "One folio", text: "Room, restaurant, room service and extras on one bill, with stay GST and food GST worked out separately.", state: "Planned" },
      { title: "Group bookings", text: "Blocks of rooms for weddings, tours and companies, with one payer or split payments.", state: "Planned" },
      { title: "Several properties", text: "Central rates and reports across your hotels, each with its own desk.", state: "Planned" },
      CHANNEL,
    ],
    faq: [
      { q: "When does Hotel POS launch?", a: "It is coming next, built on the Hostel POS core that is in its pilot now. Join the waitlist and the XTSY team will reach you first." },
    ],
    cta: "Join the waitlist",
    seo: { title: "Hotel POS by XTSY: hotel PMS with restaurant and channel manager", description: "Coming soon from XTSY: a hotel PMS with rate plans, one folio for rooms, restaurant and room service, group bookings, several properties and a channel manager." },
  },
  {
    id: "resort_pos", path: "/resort-pos", name: "Resort POS", short: "Resort", status: "soon",
    for: "Resorts, glamping and camps",
    headline: "Stays, activities and every outlet on one bill.",
    intro: "For properties that sell more than a room: cottages and tents, activities and packages, and a restaurant, bar or spa, all on the guest's one bill.",
    line: "Stays, activities, packages and every outlet on the guest's one bill.",
    ticker: ["Cottages, tents and villas", "Packages", "Activity slots", "Several outlets", "One guest bill", "Channel manager"],
    features: [
      { title: "Packages", text: "Stay with meals and activities at one price, split correctly for GST on the bill.", state: "Planned" },
      { title: "Activities", text: "Slots and capacity for treks, bonfires, rides and sessions, booked by the desk or the guest.", state: "Planned" },
      { title: "Every outlet on one bill", text: "Restaurant, bar, café and spa bill to the guest's stay and settle at check-out.", state: "Planned" },
      CHANNEL,
    ],
    faq: [
      { q: "When does Resort POS launch?", a: "It is coming next, after Hotel POS, on the same core. Join the waitlist to hear first." },
    ],
    cta: "Join the waitlist",
    seo: { title: "Resort POS by XTSY: stays, activities and packages", description: "Coming soon from XTSY: resort software for stays, activities, packages and every outlet on the guest's one bill." },
  },
  {
    id: "tourism_pos", path: "/tourism-pos", name: "Tourism POS", short: "Tourism", status: "soon",
    for: "Tour operators, travel desks and rentals",
    headline: "Tours, seats, drivers and rentals, booked and billed.",
    intro: "For tour operators and travel desks: departures and seats, drivers and vehicles, car and bike rentals, advances and balances, with GST bills.",
    line: "Departures, seats, drivers, rentals, advances and GST bills.",
    ticker: ["Departures and seats", "Drivers and vehicles", "Car and bike rentals", "Advances and balances", "GST bills", "WhatsApp confirmations"],
    features: [
      { title: "Departures and seats", text: "Fixed and private tours with seats left, pickup points and the minimum to run.", state: "Planned" },
      { title: "Drivers and vehicles", text: "Who drives what and when, without double-booking a car or a driver.", state: "Planned" },
      { title: "Rentals", text: "Cars and bikes by the day, with deposits, documents and returns.", state: "Planned" },
      { title: "Advances and balances", text: "Take an advance to confirm, collect the rest before the trip, with GST bills for both.", state: "Planned" },
    ],
    faq: [
      { q: "When does Tourism POS launch?", a: "It is coming after Hotel and Resort POS. Join the waitlist to hear first and help shape it." },
    ],
    cta: "Join the waitlist",
    seo: { title: "Tourism POS by XTSY: tours, rentals and travel desks", description: "Coming soon from XTSY: software for tour operators and travel desks, with departures and seats, drivers and vehicles, rentals, advances and GST bills." },
  },
];

export const modelById = (id: ProductId): SiteModel => SITE_MODELS.find((m) => m.id === id) ?? SITE_MODELS[0]!;
export const modelByPath = (path: string): SiteModel | undefined => SITE_MODELS.find((m) => m.path === path);
export const MODEL_PATHS: ModelPath[] = SITE_MODELS.map((m) => m.path);

/**
 * The model's own public plans from the catalogue: active rows with its prefix, in catalogue
 * order. Restaurant POS is handled by publicPlansFrom (its fixed ladder); the internal pilot
 * row (stay_pilot) is never shown.
 */
export function modelPlanRows(rows: PlanCatalogueRow[], id: ProductId): PlanCatalogueRow[] {
  if (id === "restaurant_pos") return [];
  return rows
    .filter((r) => r.active !== false && r.id !== "stay_pilot" && r.id.startsWith(PLAN_PREFIX[id]) && planProduct(r.id) === id)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.monthly_price ?? 0) - (b.monthly_price ?? 0));
}

/** What the enquiry says the person wants. */
export const ENQUIRY_PRODUCTS = SITE_MODELS.map((m) => m.name);
