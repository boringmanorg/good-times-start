import { PUBLIC_PLANS } from "./plans";

/** Words for the XTSY POS website, kept apart from the layout so structured data reuses them. */

export const SITE_TITLE = "XTSY POS: Restaurant Billing Software & POS for India";
export const SITE_DESCRIPTION =
  "Restaurant billing software with KOTs, QR ordering, hotel room billing and a waiter app that keeps working offline. GST billing for India from ₹99 a month.";

export const FAQ: { q: string; a: string }[] = [
  { q: "What is XTSY POS?", a: "XTSY POS (also called POS by XTSY) is restaurant billing software for restaurants, cafés and hotels. It has three apps: POS Manager for the owner, POS Billdesk for the counter and Waiter Pro for the floor, all kept in sync live." },
  { q: "Does it work when the internet goes down?", a: "Yes. Bills are saved on the counter first, so billing never stops when the internet does. Everything syncs to every device when the connection comes back." },
  { q: "Which devices does it run on?", a: "POS Billdesk runs on a Windows or Mac computer, POS Manager on any phone, tablet or computer, and Waiter Pro on Android phones and tablets. Thermal printers (58 mm and 80 mm, USB or Bluetooth) print bills and KOTs." },
  { q: "Does XTSY POS handle GST billing?", a: "Yes. Bills carry your GSTIN, CGST and SGST are worked out per dish, and the sales summary exports to Excel for your accountant." },
  { q: "Can hotels and hostels use it?", a: "Yes. Guests can order from a QR code in their room, food goes on the room bill, and the front desk settles it before check-out." },
  { q: "How do I pay for a plan?", a: "There's no online payment on this website. Send an enquiry with your requirement and the XTSY team sets you up and shares the payment details." },
  { q: "What is in the Enterprise / Brand plan?", a: "For chains, brands and special requirements: more outlets, more users and the features you need. Call or send an enquiry for a quote." },
];

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
