import type { WorkingGroupFeedItem } from './types.js';

const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/g;

// Strict-enough RSS field extraction. Discourse feeds always nest each field
// directly under <item> as a direct child, so a non-greedy match keyed on the
// tag name is sufficient — we do not parse arbitrary RSS.
function pick(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = block.match(re);
  return m?.[1];
}

function unwrapCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const EXCERPT_MAX = 180;

function makeExcerpt(html: string): string {
  const text = decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= EXCERPT_MAX) return text;
  const cut = text.slice(0, EXCERPT_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return cut.slice(0, lastSpace > EXCERPT_MAX * 0.5 ? lastSpace : EXCERPT_MAX) + '…';
}

function feedLabel(rssUrl: string): string {
  try {
    const u = new URL(rssUrl);
    const segments = u.pathname.split('/').filter(Boolean);
    const slug = segments[segments.length - 2] ?? u.hostname;
    return `Discourse · ${slug}`;
  } catch {
    return 'Discourse';
  }
}

export async function fetchDiscourseRss(rssUrl: string): Promise<WorkingGroupFeedItem[]> {
  const res = await fetch(rssUrl, { headers: { Accept: 'application/rss+xml,application/xml' } });
  if (!res.ok) throw new Error(`Discourse RSS ${rssUrl} returned ${res.status}`);
  const xml = await res.text();

  const label = feedLabel(rssUrl);
  const channelLink = pick(xml.split('<item')[0] ?? '', 'link');

  const items: WorkingGroupFeedItem[] = [];
  for (const match of xml.matchAll(ITEM_RE)) {
    const block = match[1];
    const titleRaw = pick(block, 'title');
    const linkRaw = pick(block, 'link');
    const guidRaw = pick(block, 'guid');
    const dateRaw = pick(block, 'pubDate');
    const descRaw = pick(block, 'description');
    const creatorRaw = pick(block, 'dc:creator');

    if (!titleRaw || !linkRaw || !dateRaw) continue;

    const title = decodeEntities(unwrapCdata(titleRaw));
    const url = unwrapCdata(linkRaw);
    const id = guidRaw ? unwrapCdata(guidRaw) : url;
    const publishedAt = new Date(dateRaw.trim());
    if (Number.isNaN(publishedAt.getTime())) continue;

    const excerpt = descRaw ? makeExcerpt(unwrapCdata(descRaw)) : undefined;
    const handle = creatorRaw ? unwrapCdata(creatorRaw) : undefined;

    items.push({
      id,
      title,
      url,
      excerpt,
      publishedAt,
      source: {
        kind: 'discourse-rss',
        label,
        url: channelLink ? unwrapCdata(channelLink) : rssUrl,
      },
      author: handle ? { handle } : undefined,
    });
  }

  return items;
}
