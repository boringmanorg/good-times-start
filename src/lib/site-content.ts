import { PUBLIC_PLANS, type PublicPlan } from "./plans";

/** Words for the XTSY POS website, kept apart from the layout so structured data reuses them. */

export const SITE_TITLE = "XTSY POS: Restaurant POS and Hostel & Hotel PMS for India";
export const SITE_DESCRIPTION =
  "Two products from XTSY. Restaurant POS: KOTs, UPI and GST bills, guest QR ordering, a waiter app, purchases and accounts, billing even when the internet drops. Hostel & Hotel POS: rooms and beds, rates, bookings, front desk and a channel manager in one.";

/** The two XTSY POS products on the website. Hostel & Hotel POS is in its pilot: not sold on price yet. */
export interface SiteProduct { id: "restaurant" | "stay"; name: string; state: string; line: string; for: string; points: string[] }
export const SITE_PRODUCTS: SiteProduct[] = [
  { id: "restaurant", name: "Restaurant POS", state: "Live", for: "Restaurants, cafés, fine dine, cloud kitchens",
    line: "Counter, waiters, guest QR orders and the owner's books, in step live.",
    points: ["POS Billdesk, Waiter Pro and POS Manager apps", "GST bills, UPI, card and split payments", "Guest QR ordering with no commission", "Purchases, Pay later and accounts", "Keeps billing without internet"] },
  { id: "stay", name: "Hostel & Hotel POS", state: "Pilot", for: "Hostels, hotels, homestays",
    line: "PMS and channel manager as one software: one calendar for every bed and room.",
    points: ["Rates and availability calendar, per night", "Bookings from walk-ins, your website and booking sites", "Front desk: check-in with ID, folios with stay GST, check-out", "Housekeeping, and café bills on the room", "Occupancy, average rate and RevPAR, with rate suggestions"] },
];

/** Hostel & Hotel POS features, as the website explains them. Channel manager is honest about its state. */
export const STAY_FEATURE_BLOCKS: { title: string; text: string; state?: string }[] = [
  { title: "One calendar", text: "Every bed and room, night by night: what's left to sell, the rate and whether it's open online. Change one night or a whole season, weekdays only if you like." },
  { title: "Bookings in one list", text: "Walk-ins, phone, your website and booking sites side by side. Search by name, reference, booking id or phone; see what each channel brings in." },
  { title: "Front desk", text: "Give beds or rooms, see the ID, take the advance, check in and out. Foreign guests get a Form-III reminder. Folios work out stay GST by the tariff." },
  { title: "Housekeeping", text: "Clean, dirty or out of order per bed and room, so the desk never gives an unmade bed." },
  { title: "Café on the room", text: "The café bills on the guest's bed or room from POS Billdesk; check-out waits until it's settled." },
  { title: "Smarter rates", text: "Suggestions from your own bookings: busy and weekend nights go up, empty nights close in come down. Nothing changes until you tap Apply." },
  { title: "Channel manager", text: "Room counts and prices sent to booking sites through ZimmerStack, from the same calendar. The connection is being set up with the pilot property and isn't sending yet.", state: "Rolling out" },
];

/** The demo videos on the website: real XTSY POS screens, recorded with TAB Bistro's menu. */
export interface Demo { id: string; title: string; text: string; app: string; device: "computer" | "phone"; sample?: boolean }
export const DEMOS: Demo[] = [
  { id: "billing", title: "Bill a table", app: "POS Billdesk", device: "computer",
    text: "Open a table, find dishes by name, send the KOT to each kitchen station, take UPI and offer the bill on WhatsApp." },
  { id: "waiter", title: "Take the order at the table", app: "Waiter Pro", device: "phone",
    text: "The waiter adds dishes on an Android phone and sends them to the kitchen. The table turns busy on every device." },
  { id: "qr-order", title: "Guests order from a QR", app: "Guest's phone", device: "phone",
    text: "No app to install. The guest picks dishes and places the order; the restaurant confirms it before the guest pays by UPI." },
  { id: "purchase", title: "Record a supplier bill, pay it later", app: "POS Manager", device: "computer", sample: true,
    text: "Mark a supplier bill Pay later, then pay it off. What you owe each vendor updates as you go." },
  { id: "accounts", title: "See your profit", app: "POS Manager", device: "computer", sample: true,
    text: "Sales, purchases and expenses become a profit and loss, money in and out by mode, and a day book." },
  { id: "dashboard", title: "Today at a glance", app: "POS Manager", device: "computer", sample: true,
    text: "Sales by order type, the last 15 days and a forecast for how today will close." },
];

/** Where XTSY POS stands today. Only what is built goes under "live". */
export const STATUS: { live: string[]; testing: { name: string; note: string }[]; next: { name: string; note: string }[] } = {
  live: [
    "Billing, KOTs, tables and rooms",
    "Cash, UPI, card and split payments",
    "Waiter Pro on Android phones and tablets",
    "Guest QR ordering, with UPI checked by staff",
    "Table bookings",
    "Guest loyalty points, gift cards and feedback",
    "Purchases, vendors and Pay later",
    "Accounts: profit and loss, expenses, day book",
    "Sales dashboard and today's forecast",
    "WhatsApp offers to guests who opted in",
    "Audit log and device control",
    "Several outlets under one brand",
    "Billing without internet",
  ],
  testing: [
    { name: "Hostel & Hotel POS", note: "In its pilot at XTSY Travellers Hostel, New Shillong: rates, bookings, front desk, housekeeping and reports. More properties join by invitation." },
    { name: "Channel manager for booking sites", note: "Part of Hostel & Hotel POS. The ZimmerStack connection is being set up; it doesn't send to booking sites yet." },
    { name: "Swiggy and Zomato orders on the POS", note: "Working in a test sandbox. Switches on once the partner access is approved." },
    { name: "Kitchen display screen", note: "Switched on by XTSY for restaurants that ask for it." },
  ],
  next: [
    { name: "Hotel groups", note: "Several properties under one account, with central rates and reports." },
    { name: "POS by XTSY for Tourism", note: "Tours, travel desks and experiences." },
  ],
};

/** Questions and answers; prices come from the live plan list so they never drift. */
export function faqFor(plans: PublicPlan[]): { q: string; a: string }[] {
  const priced = plans.filter((p) => p.price !== null).map((p) => `${p.name} ₹${p.price}`).join(", ");
  return [
    { q: "What is XTSY POS?", a: "XTSY POS (also called POS by XTSY) is two products. Restaurant POS is billing software for restaurants, cafés, fine dine and cloud kitchens, with three apps kept in sync live: POS Billdesk for the counter, Waiter Pro for the floor and POS Manager for the owner. Hostel & Hotel POS runs a property: rooms and beds, rates, bookings, the front desk and a channel manager, in one software." },
    { q: "Does it work when the internet goes down?", a: "Yes. Bills are saved on the counter first, so billing carries on when the internet doesn't. Everything syncs to every device when the connection comes back." },
    { q: "Which devices does it run on?", a: "POS Billdesk runs on a Windows or Mac computer, POS Manager on any phone, tablet or computer, and Waiter Pro on Android phones and tablets. Thermal printers (58 mm and 80 mm, USB or Bluetooth) print bills and KOTs." },
    { q: "Does XTSY POS handle GST billing?", a: "Yes. Bills carry your GSTIN, CGST and SGST are worked out per dish, and the sales summary and GSTR-1 report export for your accountant. Restaurants not registered for GST get bills without tax." },
    { q: "Is the price per outlet?", a: `Yes. Every plan is priced per outlet per month: ${priced}. Each outlet gets its own users and devices.` },
    { q: "Which plan has the waiter app and QR ordering?", a: "Waiter Pro, guest QR ordering, gift cards, guest feedback and marketing come with Pro and Enterprise / Brand. Pro Lite adds purchases, vendors, recipe costing, guest loyalty and table reservations to Basic." },
    { q: "What is in Enterprise / Brand?", a: "Everything in Pro, with unlimited Billdesk and Waiter users, up to 4 admins, accounts (profit and loss, expenses, day book), audit logs, and several outlets under one brand." },
    { q: "Do Swiggy and Zomato orders come into the POS?", a: "Not yet. The connection works in a test sandbox and goes live once Swiggy and Zomato approve partner access. Until then, bill those orders on the POS as Swiggy or Zomato orders." },
    { q: "Is there a version for hostels and hotels?", a: "Yes: Hostel & Hotel POS, with its own sign-in and apps. It is in its pilot at XTSY Travellers Hostel, so it isn't sold on price yet; send an enquiry to join the pilot. A café or restaurant on the property bills on the room from the same software." },
    { q: "Does Hostel & Hotel POS include a channel manager?", a: "Yes, as part of the same software, not a separate subscription. Room counts and prices go to booking sites through ZimmerStack from the same calendar the desk uses. The connection is being set up now with the pilot property and isn't sending to booking sites yet." },
    { q: "How do I pay for a plan?", a: "There's no online payment on this website. Send an enquiry and the XTSY team sets you up and shares the payment details." },
    { q: "When can I get support?", a: "Every day of the week, Saturday and Sunday included, except national holidays. Reach the XTSY team on WhatsApp and a person answers." },
  ];
}

export const PRICE_RANGE = {
  low: Math.min(...PUBLIC_PLANS.filter((p) => p.price !== null).map((p) => p.price as number)),
  high: Math.max(...PUBLIC_PLANS.filter((p) => p.price !== null).map((p) => p.price as number)),
};

export interface Enquiry {
  /** Which product: "Restaurant POS" or "Hostel & Hotel POS"; empty reads as Restaurant POS. */
  product?: string;
  name: string;
  business: string;
  city: string;
  phone: string;
  outlets: string;
  plan: string;
  message: string;
}

/** What's missing, in plain words; null when the enquiry can be sent. */
export function enquiryProblem(e: Enquiry): string | null {
  if (!e.name.trim()) return "Please add your name.";
  if (!e.business.trim()) return e.product === "Hostel & Hotel POS" ? "Please add your property's name." : "Please add your restaurant or brand name.";
  if (!e.city.trim()) return "Please add your city.";
  if (!/^[6-9]\d{9}$/.test(e.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))) return "Please add a 10-digit mobile number.";
  return null;
}

/** The WhatsApp message the enquiry becomes. */
export function enquiryMessage(e: Enquiry): string {
  const lines = [
    `Hi XTSY, I'd like ${e.product || "XTSY POS"} for my business.`,
    "",
    `Name: ${e.name.trim()}`,
    `${e.product === "Hostel & Hotel POS" ? "Property" : "Restaurant / brand"}: ${e.business.trim()}`,
    `City: ${e.city.trim()}`,
    `Mobile: ${e.phone.replace(/\D/g, "").slice(-10)}`,
    e.outlets ? `Outlets: ${e.outlets}` : "",
    e.plan ? `Plan: ${e.plan}` : "",
    e.message.trim() ? `Requirement: ${e.message.trim()}` : "",
  ];
  return lines.filter((l, i) => l !== "" || i === 1).join("\n");
}
