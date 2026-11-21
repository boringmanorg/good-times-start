import { queryOptions } from '@tanstack/react-query';
import { getTabWebsite } from './tab-website.functions';

export const tabWebsiteQuery = queryOptions({ queryKey: ['tab-public-website'], queryFn: () => getTabWebsite(), staleTime: 60_000 });
export const TAB_HOURS: string | null = null;
export function tabHead(title: string, description: string, path: string) {
  const url = `https://posbyxtsy.club${path}`;
  return { meta: [{ title }, { name: 'description', content: description },
    { property: 'og:title', content: title }, { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' }, { property: 'og:url', content: url },
    { name: 'twitter:card', content: 'summary_large_image' }], links: [{ rel: 'canonical', href: url }] };
}