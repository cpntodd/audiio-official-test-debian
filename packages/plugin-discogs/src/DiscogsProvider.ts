/**
 * Discogs Provider
 *
 * Provides artist timeline/discography from Discogs API.
 * Used for the Timeline section on artist pages.
 */

import type {
  AddonManifest,
  ArtistEnrichmentProvider,
  TimelineEntry,
} from '@audiio/core';
import type {
  DiscogsSearchResponse,
  DiscogsArtist,
  DiscogsReleasesResponse,
  DiscogsSettings,
} from './types';

const DISCOGS_API_URL = 'https://api.discogs.com';

export class DiscogsProvider implements ArtistEnrichmentProvider {
  readonly id = 'discogs';
  readonly name = 'Discogs Timeline';
  readonly enrichmentType = 'timeline' as const;

  private apiKey: string = '';
  private apiSecret: string = '';
  private cache: Map<string, { data: TimelineEntry[]; timestamp: number }> = new Map();
  private cacheTTL = 3600000; // 1 hour (Discogs has rate limits)

  get manifest(): AddonManifest {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      description: 'Discogs API integration for artist timeline and discography',
      roles: ['artist-enrichment'],
    };
  }

  async initialize(): Promise<void> {
    console.log('[Discogs] Initializing...');
    if (!this.apiKey) {
      console.warn('[Discogs] No API key configured. Timeline will not be available.');
    }
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  updateSettings(settings: Partial<DiscogsSettings>): void {
    if (settings.apiKey) {
      this.apiKey = settings.apiKey;
      console.log('[Discogs] API key updated');
    }
    if (settings.apiSecret) {
      this.apiSecret = settings.apiSecret;
    }
  }

  /**
   * Search for an artist by name
   */
  async searchArtist(artistName: string): Promise<{ id: string; name: string } | null> {
    try {
      const params = new URLSearchParams({
        q: artistName,
        type: 'artist',
        per_page: '5',
      });

      if (this.apiKey) {
        params.append('key', this.apiKey);
        if (this.apiSecret) {
          params.append('secret', this.apiSecret);
        }
      }

      const response = await fetch(`${DISCOGS_API_URL}/database/search?${params}`, {
        headers: {
          'User-Agent': 'Audiio/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Discogs API error: ${response.status}`);
      }

      const data = (await response.json()) as DiscogsSearchResponse;

      if (data.results && data.results.length > 0) {
        const artist = data.results[0];
        return {
          id: String(artist.id),
          name: artist.title,
        };
      }

      return null;
    } catch (error) {
      console.error('[Discogs] Artist search failed:', error);
      return null;
    }
  }

  /**
   * Get artist timeline (discography by year)
   */
  async getArtistTimeline(artistName: string): Promise<TimelineEntry[]> {
    const cacheKey = artistName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // First, search for the artist
      const artist = await this.searchArtist(artistName);
      if (!artist) {
        return [];
      }

      // Get artist releases
      const params = new URLSearchParams({
        sort: 'year',
        sort_order: 'asc',
        per_page: '100',
      });

      if (this.apiKey) {
        params.append('key', this.apiKey);
        if (this.apiSecret) {
          params.append('secret', this.apiSecret);
        }
      }

      const response = await fetch(
        `${DISCOGS_API_URL}/artists/${artist.id}/releases?${params}`,
        {
          headers: {
            'User-Agent': 'Audiio/1.0',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Discogs API error: ${response.status}`);
      }

      const data = (await response.json()) as DiscogsReleasesResponse;

      // Transform releases to timeline entries
      // Filter to only include main releases (not appearances/compilations where they're featured)
      const mainRoles = ['Main', 'TrackAppearance'];
      const releases = data.releases
        .filter((r) => r.year && r.year > 0)
        .filter((r) => mainRoles.includes(r.role) || !r.role);

      // Group by release to avoid duplicates (masters and releases)
      const seenTitles = new Set<string>();
      const timeline: TimelineEntry[] = [];

      for (const release of releases) {
        const normalizedTitle = release.title.toLowerCase().trim();

        // Skip if we've already seen this title in the same year
        const key = `${release.year}-${normalizedTitle}`;
        if (seenTitles.has(key)) {
          continue;
        }
        seenTitles.add(key);

        timeline.push({
          year: release.year,
          type: this.determineReleaseType(release.format, release.type),
          title: release.title,
          artwork: release.thumb || undefined,
          label: release.label || undefined,
          id: String(release.id),
          source: 'discogs',
        });
      }

      // Sort by year
      timeline.sort((a, b) => a.year - b.year);

      // Cache the result
      this.cache.set(cacheKey, { data: timeline, timestamp: Date.now() });

      return timeline;
    } catch (error) {
      console.error('[Discogs] Failed to fetch timeline:', error);
      return [];
    }
  }

  private determineReleaseType(format?: string, type?: string): 'album' | 'single' | 'ep' | 'compilation' | 'live' {
    if (!format) {
      return 'album';
    }

    const formatLower = format.toLowerCase();

    if (formatLower.includes('single') || formatLower.includes('7"')) {
      return 'single';
    }
    if (formatLower.includes('ep') || formatLower.includes('mini')) {
      return 'ep';
    }
    if (formatLower.includes('comp') || formatLower.includes('compilation')) {
      return 'compilation';
    }
    if (formatLower.includes('live')) {
      return 'live';
    }

    return 'album';
  }
}
