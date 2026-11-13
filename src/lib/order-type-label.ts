import type { Order } from "@/lib/types";

export const ORDER_TYPE_LABEL: Record<Order["orderType"], string> = {
  "dine-in": "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
  swiggy: "Swiggy",
  zomato: "Zomato",
};
