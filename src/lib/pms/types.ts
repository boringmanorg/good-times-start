/**
 * PMS by XTSY (Hotel / Hostel / Resort POS): what the front desk keeps.
 * Records live in IndexedDB and sync through restaurant_records like every POS record,
 * so the desk keeps working offline. Dates are property-local "YYYY-MM-DD"; a stay's
 * nights are checkIn … the night before checkOut.
 */

export type IsoDate = string;

/** How a unit type is sold: one bed in a dorm, or a whole room. */
export type SoldAs = "bed" | "room";

/** GST on the stay. "auto" follows the tariff per unit per night (stay-gst.ts). */
export type StayGstSlab = "auto" | "0" | "5" | "18";

export interface UnitType {
  id: string;
  name: string;
  soldAs: SoldAs;
  /** Nightly rate per unit, in rupees, before GST. */
  rate: number;
  /** Guests one unit holds (1 for a dorm bed). */
  maxGuests: number;
  femaleOnly: boolean;
  gst: StayGstSlab;
  /** Sort order on the calendar. */
  order: number;
  /** The id the channel manager knows this type by (ZimmerStack room-type ref). */
  channelRef?: string;
  archived?: boolean;
}

export type Housekeeping = "clean" | "dirty" | "inspect" | "out_of_order";

/** One sellable bed or room, e.g. "8A" in Room 8, or "666". */
export interface Unit {
  id: string;
  typeId: string;
  label: string;
  /** The room a bed belongs to ("Room 8"); a private room is its own room. */
  room: string;
  housekeeping: Housekeeping;
  /** Why it's out of order, or a housekeeping note. */
  note?: string;
  archived?: boolean;
}

export type StaySource = "walk_in" | "phone" | "website" | "ota";
export type StayStatus = "booked" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type PayMode = "cash" | "upi" | "card" | "bank" | "ota_collect";

export interface StayLine {
  typeId: string;
  /** Beds or rooms of this type. */
  units: number;
  guests: number;
  /** Nightly rate per unit agreed for this booking (rupees, before GST). */
  rate: number;
  /** Beds/rooms given to this line; filled at booking or at check-in. */
  unitIds: string[];
}

export interface StayCharge {
  id: string;
  label: string;
  /** Rupees before GST. */
  amount: number;
  gstPct: number;
  at: number;
  by: string;
}

export interface StayPayment {
  id: string;
  kind: "advance" | "payment" | "refund";
  amount: number;
  mode: PayMode;
  at: number;
  by: string;
  reference?: string;
}

export interface StayGuest {
  name: string;
  phone: string;
  email?: string;
  /** Country of the passport, "IN" for Indian guests. A foreign guest needs Form-III within 24 hours. */
  nationality?: string;
  /** Which ID was seen at check-in (Aadhaar, passport…). The number itself is not kept here. */
  idSeen?: string;
}

export interface Stay {
  id: string;
  /** STY/0001: shown on the folio and given to the guest. */
  reference: string;
  source: StaySource;
  /** Booking site name for OTA stays, and its booking id. */
  ota?: { name: string; bookingId: string };
  status: StayStatus;
  checkIn: IsoDate;
  checkOut: IsoDate;
  guest: StayGuest;
  /** Female guests in the group: female-only dorm beds go only to them. */
  femaleGuests?: number;
  lines: StayLine[];
  charges: StayCharge[];
  payments: StayPayment[];
  notes?: string;
  createdAt: number;
  createdBy: string;
  checkedInAt?: number;
  checkedOutAt?: number;
  cancelled?: { at: number; by: string; reason: string };
  /** Form-III filed for a foreign guest (filed on the government portal; this records that it was). */
  formIII?: { at: number; by: string; reference?: string };
  /** POS room bills settled with this stay at check-out (bill uids). */
  roomBills?: string[];
}
