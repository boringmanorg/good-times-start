import { PUBLIC_PLANS, type PublicPlan } from "./plans";

/** Words for the XTSY POS website, kept apart from the layout so structured data reuses them. */

export const SITE_TITLE = "XTSY POS: Restaurant Billing Software & POS for India";
export const SITE_DESCRIPTION =
  "Restaurant billing software for restaurants, cafés, fine dine and cloud kitchens: KOTs, UPI and GST bills, guest QR ordering, a waiter app, purchases and accounts. Keeps billing when the internet drops.";

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
    { name: "Swiggy and Zomato orders on the POS", note: "Working in a test sandbox. Switches on once the partner access is approved." },
    { name: "Kitchen display screen", note: "Switched on by XTSY for restaurants that ask for it." },
  ],
  next: [
    { name: "POS by XTSY for Hotels & Resorts", note: "Rooms, stays, in-room dining and the front desk." },
    { name: "POS by XTSY for Tourism", note: "Tours, travel desks and experiences." },
  ],
};

/** Questions and answers; prices come from the live plan list so they never drift. */
export function faqFor(plans: PublicPlan[]): { q: string; a: string }[] {
  const priced = plans.filter((p) => p.price !== null).map((p) => `${p.name} ₹${p.price}`).join(", ");
  return [
    { q: "What is XTSY POS?", a: "XTSY POS (also called POS by XTSY) is billing software for restaurants, cafés, fine dine and cloud kitchens. It has three apps kept in sync live: POS Billdesk for the counter, Waiter Pro for the floor and POS Manager for the owner." },
    { q: "Does it work when the internet goes down?", a: "Yes. Bills are saved on the counter first, so billing carries on when the internet doesn't. Everything syncs to every device when the connection comes back." },
    { q: "Which devices does it run on?", a: "POS Billdesk runs on a Windows or Mac computer, POS Manager on any phone, tablet or computer, and Waiter Pro on Android phones and tablets. Thermal printers (58 mm and 80 mm, USB or Bluetooth) print bills and KOTs." },
    { q: "Does XTSY POS handle GST billing?", a: "Yes. Bills carry your GSTIN, CGST and SGST are worked out per dish, and the sales summary and GSTR-1 report export for your accountant. Restaurants not registered for GST get bills without tax." },
    { q: "Is the price per outlet?", a: `Yes. Every plan is priced per outlet per month: ${priced}. Each outlet gets its own users and devices.` },
    { q: "Which plan has the waiter app and QR ordering?", a: "Waiter Pro, guest QR ordering, gift cards, guest feedback and marketing come with Pro and Enterprise / Brand. Pro Lite adds purchases, vendors, recipe costing, guest loyalty and table reservations to Basic." },
    { q: "What is in Enterprise / Brand?", a: "Everything in Pro, with unlimited Billdesk and Waiter users, up to 4 admins, accounts (profit and loss, expenses, day book), audit logs, and several outlets under one brand." },
    { q: "Do Swiggy and Zomato orders come into the POS?", a: "Not yet. The connection works in a test sandbox and goes live once Swiggy and Zomato approve partner access. Until then, bill those orders on the POS as Swiggy or Zomato orders." },
    { q: "Is there a version for hotels, resorts and tourism?", a: "POS by XTSY for Hotels & Resorts and POS by XTSY for Tourism are coming next, as separate apps under the XTSY brand. Today, a restaurant inside a hotel can already put in-room orders on the room bill." },
    { q: "How do I pay for a plan?", a: "There's no online payment on this website. Send an enquiry and the XTSY team sets you up and shares the payment details." },
    { q: "When can I get support?", a: "Every day of the week, Saturday and Sunday included, except national holidays. Reach the XTSY team on WhatsApp and a person answers." },
  ];
}

export const PRICE_RANGE = {
  low: Math.min(...PUBLIC_PLANS.filter((p) => p.price !== null).map((p) => p.price as number)),
  high: Math.max(...PUBLIC_PLANS.filter((p) => p.price !== null).map((p) => p.price as number)),
};

export interface Enquiry {
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
  if (!e.business.trim()) return "Please add your restaurant or brand name.";
  if (!e.city.trim()) return "Please add your city.";
  if (!/^[6-9]\d{9}$/.test(e.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))) return "Please add a 10-digit mobile number.";
  return null;
}

/** The WhatsApp message the enquiry becomes. */
export function enquiryMessage(e: Enquiry): string {
  const lines = [
    "Hi XTSY, I'd like XTSY POS for my business.",
    "",
    `Name: ${e.name.trim()}`,
    `Restaurant / brand: ${e.business.trim()}`,
    `City: ${e.city.trim()}`,
    `Mobile: ${e.phone.replace(/\D/g, "").slice(-10)}`,
    e.outlets ? `Outlets: ${e.outlets}` : "",
    e.plan ? `Plan: ${e.plan}` : "",
    e.message.trim() ? `Requirement: ${e.message.trim()}` : "",
  ];
  return lines.filter((l, i) => l !== "" || i === 1).join("\n");
}
