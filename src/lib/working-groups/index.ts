import yaml from 'js-yaml';
import workingGroupsRaw from '../../data/working-groups.yml?raw';
import { fetchDiscourseRss } from './discourse.js';
import { fetchSembleCollection } from './semble.js';
import type { WorkingGroup, WorkingGroupFeedItem, WorkingGroupSource } from './types.js';

export type { WorkingGroup, WorkingGroupFeedItem, WorkingGroupSource } from './types.js';

const groups = yaml.load(workingGroupsRaw) as WorkingGroup[];

export function getWorkingGroups(): WorkingGroup[] {
  return groups;
}

export function getWorkingGroup(slug: string): WorkingGroup | undefined {
  return groups.find((g) => g.slug === slug);
}

async function fetchSource(source: WorkingGroupSource): Promise<WorkingGroupFeedItem[]> {
  switch (source.kind) {
    case 'discourse-rss':
      return fetchDiscourseRss(source.url);
    case 'semble-collection':
      return fetchSembleCollection(source.handle, source.rkey);
  }
}

export async function fetchAllSources(group: WorkingGroup): Promise<WorkingGroupFeedItem[]> {
  // allSettled so a single failing source never blanks the whole feed.
  const results = await Promise.allSettled(group.sources.map(fetchSource));

  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') {
      console.warn(
        `[working-groups/${group.slug}] source ${group.sources[i].kind} failed:`,
        result.reason,
      );
    }
  }

  const items = results
    .filter((r): r is PromiseFulfilledResult<WorkingGroupFeedItem[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  // Dedupe by canonical URL (an item shared via Semble that links to a Discourse
  // topic shouldn't appear twice). Keep the entry with the earliest publishedAt
  // — usually the original source.
  const byUrl = new Map<string, WorkingGroupFeedItem>();
  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing || item.publishedAt.getTime() < existing.publishedAt.getTime()) {
      byUrl.set(item.url, item);
    }
  }

  return [...byUrl.values()].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}
