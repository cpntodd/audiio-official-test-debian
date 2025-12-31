/**
 * Discogs API response types
 */

export interface DiscogsSearchResponse {
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
    urls: {
      last?: string;
      next?: string;
    };
  };
  results: DiscogsSearchResult[];
}

export interface DiscogsSearchResult {
  id: number;
  type: 'artist' | 'release' | 'master' | 'label';
  title: string;
  thumb: string;
  cover_image: string;
  resource_url: string;
  uri: string;
}

export interface DiscogsArtist {
  id: number;
  name: string;
  realname?: string;
  profile?: string;
  data_quality: string;
  namevariations?: string[];
  aliases?: Array<{
    id: number;
    name: string;
    resource_url: string;
  }>;
  members?: Array<{
    id: number;
    name: string;
    active: boolean;
    resource_url: string;
  }>;
  groups?: Array<{
    id: number;
    name: string;
    active: boolean;
    resource_url: string;
  }>;
  urls?: string[];
  images?: DiscogsImage[];
  uri: string;
  releases_url: string;
}

export interface DiscogsImage {
  type: 'primary' | 'secondary';
  uri: string;
  uri150: string;
  width: number;
  height: number;
}

export interface DiscogsReleasesResponse {
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
    urls: {
      last?: string;
      next?: string;
    };
  };
  releases: DiscogsRelease[];
}

export interface DiscogsRelease {
  id: number;
  type: 'release' | 'master';
  title: string;
  main_release?: number;
  artist: string;
  role: string;
  resource_url: string;
  year: number;
  thumb: string;
  stats: {
    community: {
      in_wantlist: number;
      in_collection: number;
    };
  };
  format?: string;
  label?: string;
  status?: string;
}

export interface DiscogsSettings {
  apiKey: string;
  apiSecret?: string;
}
