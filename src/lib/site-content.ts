import { PUBLIC_PLANS } from "./plans";

/** Words for the XTSY POS website, kept apart from the layout so structured data reuses them. */

export const SITE_TITLE = "XTSY POS: Restaurant Billing Software & POS for India";
export const SITE_DESCRIPTION =
  "Restaurant billing software for restaurants, fine dine, cafés and cloud kitchens: KOTs, GST bills, QR ordering and a waiter app that keeps working offline. From ₹149 a month per outlet.";

export const FAQ: { q: string; a: string }[] = [
  { q: "What is XTSY POS?", a: "XTSY POS (also called POS by XTSY) is billing software for restaurants, fine dine, cafés and cloud kitchens. It has three apps: POS Manager for the owner, POS Billdesk for the counter and Waiter Pro for the floor, all kept in sync live." },
  { q: "Does it work when the internet goes down?", a: "Yes. Bills are saved on the counter first, so billing never stops when the internet does. Everything syncs to every device when the connection comes back." },
  { q: "Which devices does it run on?", a: "POS Billdesk runs on a Windows or Mac computer, POS Manager on any phone, tablet or computer, and Waiter Pro on Android phones and tablets. Thermal printers (58 mm and 80 mm, USB or Bluetooth) print bills and KOTs." },
  { q: "Does XTSY POS handle GST billing?", a: "Yes. Bills carry your GSTIN, CGST and SGST are worked out per dish, and the sales summary exports to Excel for your accountant." },
  { q: "Is there a version for hotels, resorts and tourism?", a: "POS by XTSY for Hotels & Resorts and POS by XTSY for Tourism are coming soon, as separate apps under the same XTSY brand. Today, a restaurant inside a hotel can already put in-room orders on the room bill." },
  { q: "Is the price per outlet?", a: "Yes. Every plan is priced per outlet per month: Basic ₹149, Pro Lite ₹299, Pro ₹499 and Enterprise / Brand ₹999. Each outlet gets its own users and devices." },
  { q: "Which plan has the waiter app and QR ordering?", a: "Waiter Pro and guest QR ordering come with Pro and Enterprise / Brand. Pro Lite adds purchases, vendor management, guest loyalty and table reservations to Basic." },
  { q: "How do I pay for a plan?", a: "There's no online payment on this website. Send an enquiry with your requirement and the XTSY team sets you up and shares the payment details." },
  { q: "What is in the Enterprise / Brand plan?", a: "Everything in Pro, with unlimited Billdesk and Waiter users, up to 5 admins, and full access to audit logs and reports. For chains and brands with special requirements, send an enquiry and we'll fulfil them." },
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
