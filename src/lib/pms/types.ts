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
  /** Per-night changes from the rates & availability calendar: a different rate, or closed to sale. */
  calendar?: Record<IsoDate, NightPlan>;
  /** Rate plans sold on top of the room: room only, with breakfast, non-refundable… (rates.ts). */
  plans?: RatePlan[];
  /** The booking engine's id for this type (xtsy.one): set when the type came from the engine's feed. */
  engineRef?: string;
  /** Shown under the name ("Without lockers"). */
  descriptor?: string;
}

/** What a rate plan includes. */
export type MealPlan = "room_only" | "breakfast" | "half_board" | "full_board";

/**
 * A way of selling a room type: its nightly rate is the room's rate for that night plus `adjust`
 * rupees (or `adjustPct` percent; negative for a discount). Channel managers map these one to one.
 */
export interface RatePlan {
  id: string;
  name: string;
  meal: MealPlan;
  /** False for a non-refundable rate: cancelling keeps the money (the property's policy decides). */
  refundable: boolean;
  adjust?: number;
  adjustPct?: number;
  /** The id the channel manager knows this plan by. */
  channelRef?: string;
  active: boolean;
}

/** One night of one room type on the rates & availability calendar. */
export interface NightPlan {
  /** Rate for that night, rupees before GST; the type's base rate when absent. */
  rate?: number;
  /** Stop-sell: not offered to the website or booking sites that night (the desk can still book). */
  closed?: boolean;
  /** Minimum nights for a stay arriving this night (online; the desk sees a warning). */
  minStay?: number;
  /** Closed to arrival / departure: online stays may not start / end on this night. */
  cta?: boolean;
  ctd?: boolean;
  /**
   * Beds/rooms already sold outside Hostel POS that night (the booking engine's count: website,
   * booking sites, the owner's sheet). Taken off what the desk and channels can sell.
   */
  held?: number;
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
  /** Housekeeping task on the board: who is on it and since when. */
  task?: { assignee: string; at: number; by: string };
  /** When it was last made clean. */
  cleanedAt?: number;
  archived?: boolean;
  /** Came from the booking engine's feed (kept in step with it on each sync). */
  fromEngine?: boolean;
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
  /** Rate plan sold (room only, with breakfast…), kept with its name as booked. */
  planId?: string;
  planName?: string;
}

export interface StayCharge {
  id: string;
  label: string;
  /** Rupees before GST. */
  amount: number;
  gstPct: number;
  at: number;
  by: string;
  /** From the property's extras list (bike, breakfast, laundry…), with the quantity sold. */
  extraId?: string;
  qty?: number;
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
  /** Strict GST stay invoice taken at check-out from the cloud series (STAY/0001). */
  invoice?: { no: string; at: number };
  /** What changed after booking (room moves, new dates), oldest first. */
  history?: { at: number; by: string; what: string }[];
  /** Made by the integration sandbox (test property only): never a real guest. */
  sandbox?: boolean;
}

/** An extra the property sells on the folio (Settings → Extras). */
export interface StayExtra {
  id: string;
  label: string;
  /** Rupees before GST, per unit of `per`. */
  price: number;
  gstPct: number;
  per: "item" | "night" | "guest_night";
  active: boolean;
}

/** One closed day: what the night audit found and did. */
export interface NightAudit {
  id: string;
  /** The business day closed (property-local). */
  date: IsoDate;
  at: number;
  by: string;
  arrivals: number;
  departures: number;
  inHouse: number;
  occupancyPct: number;
  roomRevenue: number;
  collected: Record<string, number>;
  noShows: string[];
  notes?: string;
}
