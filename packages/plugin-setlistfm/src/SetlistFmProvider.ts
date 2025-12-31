/**
 * Setlist.fm Provider
 *
 * Provides past concert setlists from Setlist.fm API.
 * Used for the Recent Setlists section on artist pages.
 */

import type {
  AddonManifest,
  ArtistEnrichmentProvider,
  Setlist,
} from '@audiio/core';
import type {
  SetlistFmSearchResponse,
  SetlistFmSetlist,
  SetlistFmSettings,
} from './types';

const SETLISTFM_API_URL = 'https://api.setlist.fm/rest/1.0';

export class SetlistFmProvider implements ArtistEnrichmentProvider {
  readonly id = 'setlistfm';
  readonly name = 'Setlist.fm';
  readonly enrichmentType = 'setlists' as const;

  private apiKey: string = '';
  private cache: Map<string, { data: Setlist[]; timestamp: number }> = new Map();
  private cacheTTL = 1800000; // 30 minutes

  get manifest(): AddonManifest {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      description: 'Setlist.fm API integration for past concert setlists',
      roles: ['artist-enrichment'],
    };
  }

  async initialize(): Promise<void> {
    console.log('[Setlist.fm] Initializing...');
    if (!this.apiKey) {
      console.warn('[Setlist.fm] No API key configured. Setlists will not be available.');
    }
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  updateSettings(settings: Partial<SetlistFmSettings>): void {
    if (settings.apiKey) {
      this.apiKey = settings.apiKey;
      console.log('[Setlist.fm] API key updated');
    }
  }

  /**
   * Search for an artist by name or MBID
   */
  async searchArtist(artistName: string): Promise<{ id: string; name: string } | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const response = await fetch(
        `${SETLISTFM_API_URL}/search/artists?artistName=${encodeURIComponent(artistName)}&p=1&sort=relevance`,
        {
          headers: {
            Accept: 'application/json',
            'x-api-key': this.apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Setlist.fm API error: ${response.status}`);
      }

      const data = (await response.json()) as SetlistFmSearchResponse;

      if (data.artist && data.artist.length > 0) {
        return {
          id: data.artist[0].mbid,
          name: data.artist[0].name,
        };
      }

      return null;
    } catch (error) {
      console.error('[Setlist.fm] Artist search failed:', error);
      return null;
    }
  }

  /**
   * Get artist setlists by name or MBID
   */
  async getArtistSetlists(artistName: string, mbid?: string, limit = 5): Promise<Setlist[]> {
    if (!this.apiKey) {
      console.warn('[Setlist.fm] No API key configured');
      return [];
    }

    const cacheKey = mbid || artistName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // If we don't have MBID, search for the artist first
      let artistMbid = mbid;
      if (!artistMbid) {
        const artist = await this.searchArtist(artistName);
        if (!artist) {
          return [];
        }
        artistMbid = artist.id;
      }

      const response = await fetch(
        `${SETLISTFM_API_URL}/artist/${artistMbid}/setlists?p=1`,
        {
          headers: {
            Accept: 'application/json',
            'x-api-key': this.apiKey,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new Error(`Setlist.fm API error: ${response.status}`);
      }

      const data = (await response.json()) as SetlistFmSearchResponse;

      if (!data.setlist) {
        return [];
      }

      // Filter setlists that have songs and limit results
      const setlistsWithSongs = data.setlist
        .filter((s) => s.sets?.set?.some((set) => set.song?.length > 0))
        .slice(0, limit);

      const setlists: Setlist[] = setlistsWithSongs.map((s) => this.transformSetlist(s));

      // Cache the result
      this.cache.set(cacheKey, { data: setlists, timestamp: Date.now() });

      return setlists;
    } catch (error) {
      console.error('[Setlist.fm] Failed to fetch setlists:', error);
      return [];
    }
  }

  private transformSetlist(setlist: SetlistFmSetlist): Setlist {
    // Flatten all songs from all sets
    const songs = setlist.sets?.set?.flatMap((set) =>
      (set.song || []).map((song) => ({
        name: song.name,
        info: song.info || (set.encore ? `Encore ${set.encore}` : set.name) || undefined,
        cover: song.cover ? true : undefined,
      }))
    ) || [];

    return {
      id: setlist.id,
      eventDate: this.formatDate(setlist.eventDate),
      venue: {
        name: setlist.venue.name,
        city: setlist.venue.city.name,
        country: setlist.venue.city.country.name,
      },
      tour: setlist.tour?.name,
      songs,
      url: setlist.url,
      source: 'setlistfm',
    };
  }

  /**
   * Convert Setlist.fm date format (dd-MM-yyyy) to ISO format
   */
  private formatDate(dateStr: string): string {
    const [day, month, year] = dateStr.split('-');
    return `${year}-${month}-${day}`;
  }
}
