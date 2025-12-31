/**
 * Bandsintown Provider
 *
 * Provides upcoming concert information from Bandsintown API.
 * Used for the Upcoming Shows section on artist pages.
 */

import type {
  AddonManifest,
  ArtistEnrichmentProvider,
  Concert,
} from '@audiio/core';
import type { BandsintownEvent, BandsintownSettings } from './types';

const BANDSINTOWN_API_URL = 'https://rest.bandsintown.com';

export class BandsintownProvider implements ArtistEnrichmentProvider {
  readonly id = 'bandsintown';
  readonly name = 'Bandsintown Concerts';
  readonly enrichmentType = 'concerts' as const;

  private appId: string = 'audiio';
  private cache: Map<string, { data: Concert[]; timestamp: number }> = new Map();
  private cacheTTL = 1800000; // 30 minutes

  get manifest(): AddonManifest {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      description: 'Bandsintown API integration for upcoming concerts',
      roles: ['artist-enrichment'],
    };
  }

  async initialize(): Promise<void> {
    console.log('[Bandsintown] Initializing with app_id:', this.appId);
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  updateSettings(settings: Partial<BandsintownSettings>): void {
    if (settings.appId) {
      this.appId = settings.appId;
      console.log('[Bandsintown] App ID updated');
    }
  }

  /**
   * Get upcoming concerts for an artist
   */
  async getUpcomingConcerts(artistName: string): Promise<Concert[]> {
    const cacheKey = artistName.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // URL encode the artist name
      const encodedArtist = encodeURIComponent(artistName);
      const url = `${BANDSINTOWN_API_URL}/artists/${encodedArtist}/events?app_id=${this.appId}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Artist not found
          return [];
        }
        throw new Error(`Bandsintown API error: ${response.status}`);
      }

      const data = await response.json();

      // Handle case where API returns an object with error
      if (!Array.isArray(data)) {
        console.warn('[Bandsintown] Unexpected response format:', data);
        return [];
      }

      const events = data as BandsintownEvent[];

      const concerts: Concert[] = events.map((event) => ({
        id: event.id,
        datetime: event.datetime,
        venue: {
          name: event.venue.name,
          city: event.venue.city,
          region: event.venue.region || undefined,
          country: event.venue.country,
        },
        lineup: event.lineup,
        ticketUrl: event.offers[0]?.url || event.url,
        onSaleDate: event.on_sale_datetime || undefined,
        offers: event.offers.map((offer) => ({
          type: offer.type,
          url: offer.url,
          status: offer.status,
        })),
        source: 'bandsintown',
      }));

      // Cache the result
      this.cache.set(cacheKey, { data: concerts, timestamp: Date.now() });

      return concerts;
    } catch (error) {
      console.error('[Bandsintown] Failed to fetch concerts:', error);
      return [];
    }
  }
}
