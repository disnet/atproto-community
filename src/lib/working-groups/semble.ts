import { DidResolver, MemoryCache, getPds } from '@atproto/identity';
import { resolveHandleToDid } from '../community/identity.js';
import type { WorkingGroupFeedItem } from './types.js';

const didCache = new MemoryCache();
const didResolver = new DidResolver({ didCache });

const COLLECTION_LINK_NSID = 'network.cosmik.collectionLink';
const CARD_NSID = 'network.cosmik.card';

const LINK_PAGES_MAX = 8; // 8 × 100 = up to 800 most-recent links scanned per fetch
const CARD_CACHE_LIMIT = 500;
const cardCache = new Map<string, CosmikCard>();

interface CosmikCard {
  url?: string;
  title?: string;
  description?: string;
  createdAt?: string;
  text?: string;
}

interface CollectionLinkRecord {
  uri: string;
  value: {
    card: { uri: string };
    collection: { uri: string };
    addedAt?: string;
    createdAt?: string;
  };
}

interface ListRecordsResponse<T> {
  records: T[];
  cursor?: string;
}

async function getPdsEndpoint(did: string): Promise<string> {
  const doc = await didResolver.resolve(did);
  const pds = doc ? getPds(doc) : undefined;
  if (!pds) throw new Error(`No PDS for ${did}`);
  return pds;
}

async function listRecords<T>(
  pds: string,
  repo: string,
  collection: string,
  cursor?: string,
): Promise<ListRecordsResponse<T>> {
  const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
  u.searchParams.set('repo', repo);
  u.searchParams.set('collection', collection);
  u.searchParams.set('limit', '100');
  if (cursor) u.searchParams.set('cursor', cursor);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`listRecords ${collection} ${res.status}`);
  return (await res.json()) as ListRecordsResponse<T>;
}

async function getCard(pds: string, repo: string, rkey: string): Promise<CosmikCard | null> {
  const cacheKey = `${repo}/${rkey}`;
  const cached = cardCache.get(cacheKey);
  if (cached) return cached;

  const u = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
  u.searchParams.set('repo', repo);
  u.searchParams.set('collection', CARD_NSID);
  u.searchParams.set('rkey', rkey);
  const res = await fetch(u);
  if (!res.ok) return null;
  const body = (await res.json()) as { value?: Record<string, unknown> };
  const v = body.value ?? {};
  const content = (v.content ?? {}) as Record<string, unknown>;
  const metadata = (content.metadata ?? {}) as Record<string, unknown>;
  const card: CosmikCard = {
    url: (content.url as string) || (v.url as string) || undefined,
    title: (metadata.title as string) || undefined,
    description: (metadata.description as string) || undefined,
    text: (content.text as string) || undefined,
    createdAt: (v.createdAt as string) || undefined,
  };

  if (cardCache.size >= CARD_CACHE_LIMIT) {
    cardCache.delete(cardCache.keys().next().value!);
  }
  cardCache.set(cacheKey, card);
  return card;
}

function rkeyFromAtUri(atUri: string): string | null {
  // at://did:plc:.../collection/rkey
  const parts = atUri.split('/');
  return parts[parts.length - 1] || null;
}

export async function fetchSembleCollection(
  handle: string,
  collectionRkey: string,
): Promise<WorkingGroupFeedItem[]> {
  const did = await resolveHandleToDid(handle);
  const pds = await getPdsEndpoint(did);
  const targetCollectionUri = `at://${did}/network.cosmik.collection/${collectionRkey}`;

  // Page through collectionLink records (newest-first by rkey/TID) and pick out
  // those pointing at our target collection. Cap at LINK_PAGES_MAX to bound work
  // for repos with thousands of links.
  const matchingLinks: CollectionLinkRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LINK_PAGES_MAX; page++) {
    const resp = await listRecords<CollectionLinkRecord>(
      pds,
      did,
      COLLECTION_LINK_NSID,
      cursor,
    );
    for (const link of resp.records) {
      if (link.value.collection?.uri === targetCollectionUri) {
        matchingLinks.push(link);
      }
    }
    if (!resp.cursor || resp.records.length === 0) break;
    cursor = resp.cursor;
  }

  // Resolve each link's card. allSettled: a single missing card shouldn't blank
  // the rest of the collection.
  const items = await Promise.allSettled(
    matchingLinks.map(async (link) => {
      const cardRkey = rkeyFromAtUri(link.value.card.uri);
      if (!cardRkey) return null;
      const card = await getCard(pds, did, cardRkey);
      if (!card) return null;

      const url = card.url;
      if (!url) return null;

      const addedAt = link.value.addedAt ?? link.value.createdAt;
      const publishedAtStr = addedAt ?? card.createdAt;
      if (!publishedAtStr) return null;
      const publishedAt = new Date(publishedAtStr);
      if (Number.isNaN(publishedAt.getTime())) return null;

      const title = card.title || card.text?.slice(0, 120) || url;
      const item: WorkingGroupFeedItem = {
        id: link.uri,
        title,
        url,
        excerpt: card.description || (card.text && card.text !== title ? card.text : undefined),
        publishedAt,
        source: {
          kind: 'semble-collection',
          label: `Semble · @${handle}`,
          url: `https://semble.so/profile/${handle}/collections/${collectionRkey}`,
        },
        author: { handle },
      };
      return item;
    }),
  );

  return items
    .filter((r): r is PromiseFulfilledResult<WorkingGroupFeedItem | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is WorkingGroupFeedItem => v !== null);
}
