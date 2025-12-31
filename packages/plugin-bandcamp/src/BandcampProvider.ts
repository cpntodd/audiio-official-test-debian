/**
 * Bandcamp Provider
 *
 * Provides merchandise detection by searching Bandcamp.
 * Used for the Merchandise section on artist pages.
 */

import type {
  AddonManifest,
  ArtistEnrichmentProvider,
} from '@audiio/core';
import type { BandcampArtist } from './types';

export class BandcampProvider implements ArtistEnrichmentProvider {
  readonly id = 'bandcamp';
  readonly name = 'Bandcamp Merch';
  readonly enrichmentType = 'merchandise' as const;

  private cache: Map<string, { data: string | null; timestamp: number }> = new Map();
  private cacheTTL = 3600000; // 1 hour

  get manifest(): AddonManifest {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      description: 'Bandcamp integration for artist merchandise detection',
      roles: ['artist-enrichment'],
    };
  }

  async initialize(): Promise<void> {
    console.log('[Bandcamp] Initializing...');
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Search for an artist on Bandcamp and return their info
   * (Internal method - not part of the ArtistEnrichmentProvider interface)
   */
  private async findArtistOnBandcamp(artistName: string): Promise<BandcampArtist | null> {
    try {
      // Search Bandcamp for the artist
      const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(artistName)}&item_type=b`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Audiio/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Bandcamp search failed: ${response.status}`);
      }

      const html = await response.text();

      // Parse the search results
      // Look for first band result
      const bandMatch = html.match(/<li class="searchresult band"[\s\S]*?<a href="(https:\/\/[^"]+\.bandcamp\.com\/?)"/);

      if (bandMatch) {
        const artistUrl = bandMatch[1];

        // Extract artist name from page
        const nameMatch = html.match(/<li class="searchresult band"[\s\S]*?class="heading"[^>]*>([^<]+)/);
        const name = nameMatch ? nameMatch[1].trim() : artistName;

        return {
          name,
          url: artistUrl,
          hasMerch: true, // Will check for merch in getMerchandiseUrl
          merchUrl: `${artistUrl.replace(/\/$/, '')}/merch`,
        };
      }

      return null;
    } catch (error) {
      console.error('[Bandcamp] Search failed:', error);
      return null;
    }
  }

  /**
   * Get merchandise URL for an artist
   */
  async getMerchandiseUrl(artistName: string): Promise<string | null> {
    const cacheKey = artistName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // First, search for the artist
      const artist = await this.findArtistOnBandcamp(artistName);

      if (!artist || !artist.merchUrl) {
        this.cache.set(cacheKey, { data: null, timestamp: Date.now() });
        return null;
      }

      // Verify the merch page exists
      const merchResponse = await fetch(artist.merchUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Audiio/1.0',
        },
      });

      if (merchResponse.ok) {
        // Check if it's not a redirect to a 404 or empty page
        const contentLength = merchResponse.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > 1000) {
          this.cache.set(cacheKey, { data: artist.merchUrl, timestamp: Date.now() });
          return artist.merchUrl;
        }
      }

      // If merch page doesn't exist, just return the artist page
      this.cache.set(cacheKey, { data: artist.url, timestamp: Date.now() });
      return artist.url;
    } catch (error) {
      console.error('[Bandcamp] Failed to get merchandise URL:', error);
      this.cache.set(cacheKey, { data: null, timestamp: Date.now() });
      return null;
    }
  }
}
