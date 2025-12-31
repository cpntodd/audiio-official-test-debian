/**
 * Bandcamp types
 */

export interface BandcampArtist {
  name: string;
  url: string;
  imageUrl?: string;
  hasMerch: boolean;
  merchUrl?: string;
}

export interface BandcampSearchResult {
  type: 'artist' | 'album' | 'track';
  name: string;
  url: string;
  imageUrl?: string;
  artist?: string;
}

export interface BandcampSettings {
  // No settings needed - uses public web scraping
}
