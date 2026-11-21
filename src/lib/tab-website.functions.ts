import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { Storefront } from './guest-order-logic';

export const getTabWebsite = createServerFn({ method: 'GET' }).handler(async () => {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return null;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
      headers.set('apikey', key);
      return fetch(input, { ...init, headers });
    } },
  });
  try {
    const { data, error } = await client.rpc('public_storefront', { _slug: 'tab-bistro-qr' });
    if (error || !data) return null;
    const s = data as unknown as Storefront;
    // The website exposes only restaurant identity and public dishes, never table states or payment configuration.
    return { name: s.name, slug: s.slug, address: s.address, phone: s.phone,
      branding: s.branding ?? {}, menu: s.menu, categoryOrder: s.categoryOrder,
      pricesIncludeGst: s.pricesIncludeGst, online: s.online && s.live && !s.paused };
  } catch { return null; }
});