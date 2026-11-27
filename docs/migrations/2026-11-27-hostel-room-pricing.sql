-- Hostel POS prices by rooms (owner, 27 Nov 2026).
-- included_rooms: rooms in the base price per property; extra_room_price: ₹ per room a month above that.
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS included_rooms integer;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS extra_room_price integer;

UPDATE public.plans SET monthly_price = 2299, included_rooms = 8,  extra_room_price = 300, max_outlets = 1,
  billdesk_seats = 2, admin_seats = 1, waiter_seats = 0, tagline = 'PMS and your own booking engine, up to 8 rooms'
WHERE id = 'hostel_essential';
UPDATE public.plans SET monthly_price = 2899, included_rooms = 15, extra_room_price = 300, max_outlets = 1,
  billdesk_seats = 4, admin_seats = 2, waiter_seats = 0, tagline = 'Adds the channel manager and smart rates, up to 15 rooms'
WHERE id = 'hostel_connect';
-- Group: one price for up to 5 properties; Front Desk unlimited, 2 Property Manager devices per property (seats count per property).
UPDATE public.plans SET monthly_price = 7999, included_rooms = NULL, extra_room_price = NULL, max_outlets = 5,
  billdesk_seats = NULL, admin_seats = 2, waiter_seats = 0, tagline = 'Up to 5 properties, accounts and purchases'
WHERE id = 'hostel_group';
