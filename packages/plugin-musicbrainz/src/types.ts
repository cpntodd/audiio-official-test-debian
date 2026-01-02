/**
 * MusicBrainz API types
 */

export interface MBTag {
  name: string;
  count: number;
}

export interface MBArtist {
  mbid: string;
  name: string;
  sort_name?: string;
  artist_type?: string;
  country?: string;
  disambiguation?: string;
  begin_date?: string;
  end_date?: string;
  genres: string[];
  tags: MBTag[];
}

export interface MBRecording {
  mbid: string;
  title: string;
  artist_credit: string;
  artist_mbids: string[];
  duration_ms?: number;
  isrc?: string;
  genres: string[];
  tags: MBTag[];
  release_mbids: string[];
}

export interface MBRelease {
  mbid: string;
  title: string;
  artist_credit: string;
  artist_mbids: string[];
  release_group_mbid?: string;
  release_type?: string;
  date?: string;
  country?: string;
  barcode?: string;
  genres: string[];
  tags: MBTag[];
  track_count: number;
}

export interface MBSearchResult<T> {
  total: number;
  offset: number;
  limit: number;
  artists?: T[];
  recordings?: T[];
  releases?: T[];
}

export interface IsrcLookupResult {
  isrc: string;
  recording: MBRecording | null;
}

export interface IsrcBatchResponse {
  results: IsrcLookupResult[];
}

export interface MBStats {
  artists: number;
  recordings: number;
  releases: number;
  genres: number;
  tags: number;
}
