-- APPLIED 14 Nov 2026.
-- Brand P&L: purchase cost per outlet per day, to sit beside outlet_sales.
--
-- Counts the same entries the apps count (purchase-logic.ts `counts`): an entry with no
-- approval block was recorded by an admin and is approved; otherwise only status 'approved'.
-- Linked supplier returns come off the total, so the figure is what the brand actually spent.
--
-- STABLE, not SECURITY DEFINER: it reads restaurant_records through RLS, so a caller only ever
-- sees outlets they are a member of — the same rule outlet_sales relies on.

CREATE OR REPLACE FUNCTION public.outlet_purchases(_outlets uuid[], _from timestamptz, _to timestamptz)
 RETURNS TABLE(restaurant_id uuid, day date, entries bigint, spend numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH e AS (
    SELECT r.restaurant_id,
           (to_timestamp((r.payload ->> 'at')::numeric / 1000))::date AS day,
           r.payload ->> 'type' AS type,
           r.record_id,
           r.payload -> 'items' AS items
    FROM restaurant_records r
    WHERE r.restaurant_id = ANY(_outlets)
      AND r.kind = 'stock_entry'
      AND NOT r.deleted
      AND r.payload ->> 'type' IN ('purchase', 'return')
      AND coalesce(r.payload #>> '{approval,status}', 'approved') = 'approved'
      AND to_timestamp((r.payload ->> 'at')::numeric / 1000) >= _from
      AND to_timestamp((r.payload ->> 'at')::numeric / 1000) <= _to
  ), lines AS (
    SELECT e.restaurant_id, e.day, e.type, e.record_id,
           coalesce(sum(abs((i ->> 'qty')::numeric) * coalesce((i ->> 'unitCost')::numeric, 0)), 0) AS amount
    FROM e LEFT JOIN LATERAL jsonb_array_elements(coalesce(e.items, '[]'::jsonb)) i ON true
    GROUP BY e.restaurant_id, e.day, e.type, e.record_id
  )
  SELECT l.restaurant_id, l.day,
         count(*) FILTER (WHERE l.type = 'purchase') AS entries,
         coalesce(sum(CASE WHEN l.type = 'purchase' THEN l.amount ELSE -l.amount END), 0) AS spend
  FROM lines l
  GROUP BY l.restaurant_id, l.day
  ORDER BY l.day
$function$;

REVOKE ALL ON FUNCTION public.outlet_purchases(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outlet_purchases(uuid[], timestamptz, timestamptz) TO authenticated;
