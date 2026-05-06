export type WorkingGroupSource =
  | { kind: 'discourse-rss'; url: string }
  | { kind: 'semble-collection'; handle: string; rkey: string };

export interface WorkingGroup extends Record<string, unknown> {
  slug: string;
  name: string;
  remit: string;
  memberCount: number;
  sources: WorkingGroupSource[];
}

export interface WorkingGroupFeedItem {
  id: string;
  title: string;
  url: string;
  excerpt?: string;
  publishedAt: Date;
  source: {
    kind: WorkingGroupSource['kind'];
    label: string;
    url?: string;
  };
  author?: {
    handle?: string;
    displayName?: string;
  };
}
