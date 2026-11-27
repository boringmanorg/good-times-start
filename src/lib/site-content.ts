import { PUBLIC_PLANS, type PublicPlan } from "./plans";

/** Words for the XTSY POS website, kept apart from the layout so structured data reuses them. */

export const SITE_TITLE = "XTSY POS: POS subscriptions for restaurants, hostels, hotels, resorts and tours";
export const SITE_DESCRIPTION =
  "One XTSY subscription for the counter, the front desk and the bookings. Restaurant POS is live from ₹199 a month per outlet; Hostel POS (PMS and channel manager in one) is in its pilot; Hotel, Resort and Tourism POS are coming next.";

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
    "Restaurant POS: billing, KOTs, tables and rooms",
    "Cash, UPI, card and split payments",
    "Waiter Pro on Android phones and tablets",
    "Guest QR ordering, with UPI checked by staff",
    "Table bookings, loyalty, gift cards and feedback",
    "Purchases, vendors and Pay later",
    "Accounts: profit and loss, expenses, day book",
    "Sales dashboard and today's forecast",
    "Audit log and device control",
    "Several outlets under one brand",
    "Billing without internet",
  ],
  testing: [
    { name: "Hostel POS", note: "In its pilot: rates, bookings, front desk, housekeeping, reports and rate suggestions. More hostels join by invitation." },
    { name: "Channel manager for booking sites", note: "Part of Hostel POS. The ZimmerStack connection is being set up; it doesn't send to booking sites yet." },
    { name: "Swiggy and Zomato orders on Restaurant POS", note: "Working in a test sandbox. Switches on once the partner access is approved." },
    { name: "Kitchen display screen", note: "Switched on by XTSY for restaurants that ask for it." },
  ],
  next: [
    { name: "Hotel POS", note: "Rate plans, one folio for rooms and restaurant, group bookings, several properties." },
    { name: "Resort POS", note: "Stays, activities, packages and every outlet on one bill." },
    { name: "Tourism POS", note: "Departures and seats, drivers, rentals, advances and GST bills." },
  ],
};

/** Questions and answers; prices come from the live plan list so they never drift. */
export function faqFor(plans: PublicPlan[]): { q: string; a: string }[] {
  const priced = plans.filter((p) => p.price !== null).map((p) => `${p.name} ₹${p.price}`).join(", ");
  return [
    { q: "What is XTSY POS?", a: "XTSY POS (also called POS by XTSY) is a family of subscription software for hospitality, one model per kind of business: Restaurant POS (live), Hostel POS (in its pilot), and Hotel, Resort and Tourism POS (coming next). Each has its own apps and sign-in; XTSY runs them all from one console." },
    { q: "How much does a subscription cost?", a: `Restaurant POS is priced per outlet per month: ${priced}. Each model has its own price list; models in pilot or coming soon show their prices on their own page once they're set.` },
    { q: "How do I subscribe and pay?", a: "Send an enquiry with the model and plan you want. The XTSY team sets up your outlet and logins, and shares the payment details; there's no online payment on this website. Plans renew monthly and you can move up or down a plan by asking." },
    { q: "Can I change my plan later?", a: "Yes. Ask the XTSY team to move you to another plan; it applies to every device at once and your data stays as it is." },
    { q: "Does it work without internet?", a: "Restaurant POS bills offline and syncs when the connection is back. Hostel POS keeps the desk working offline too." },
    { q: "Who builds XTSY POS?", a: "XTSY Ventures Private Limited, a DPIIT-recognised startup from Coimbatore, Tamil Nadu. It runs every day at TAB Bistro by XTSY." },
    { q: "When can I get support?", a: "Every day of the week, Saturday and Sunday included, except national holidays. Reach the XTSY team on WhatsApp and a person answers." },
  ];
}

export const PRICE_RANGE = {
  low: Math.min(...PUBLIC_PLANS.filter((p) => p.price !== null).map((p) => p.price as number)),
  high: Math.max(...PUBLIC_PLANS.filter((p) => p.price !== null).map((p) => p.price as number)),
};

export interface Enquiry {
  /** Which POS model (SITE_MODELS name); empty reads as Restaurant POS. */
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
  if (!e.business.trim()) return e.product && e.product !== "Restaurant POS" ? "Please add your business name." : "Please add your restaurant or brand name.";
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
    `${e.product && e.product !== "Restaurant POS" ? "Business" : "Restaurant / brand"}: ${e.business.trim()}`,
    `City: ${e.city.trim()}`,
    `Mobile: ${e.phone.replace(/\D/g, "").slice(-10)}`,
    e.outlets ? `Outlets: ${e.outlets}` : "",
    e.plan ? `Plan: ${e.plan}` : "",
    e.message.trim() ? `Requirement: ${e.message.trim()}` : "",
  ];
  return lines.filter((l, i) => l !== "" || i === 1).join("\n");
}
