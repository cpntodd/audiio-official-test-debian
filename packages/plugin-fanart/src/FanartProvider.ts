/**
 * Fanart.tv Provider
 *
 * Provides high-quality artist images from Fanart.tv API.
 * Used for the gallery section on artist pages.
 */

import type {
  AddonManifest,
  ArtistEnrichmentProvider,
  ArtistImages,
} from '@audiio/core';
import type { FanartArtistResponse, FanartSettings } from './types';

const FANART_API_URL = 'https://webservice.fanart.tv/v3/music';

export class FanartProvider implements ArtistEnrichmentProvider {
  readonly id = 'fanart';
  readonly name = 'Fanart.tv';
  readonly enrichmentType = 'gallery' as const;

  private apiKey: string = '';
  private cache: Map<string, { data: ArtistImages; timestamp: number }> = new Map();
  private cacheTTL = 3600000; // 1 hour

  get manifest(): AddonManifest {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      description: 'Fanart.tv integration for artist images and gallery',
      roles: ['artist-enrichment'],
    };
  }

  async initialize(): Promise<void> {
    console.log('[Fanart.tv] Initializing...');
    if (!this.apiKey) {
      console.warn('[Fanart.tv] No API key configured. Gallery will not be available.');
    }
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  updateSettings(settings: Partial<FanartSettings>): void {
    if (settings.apiKey) {
      this.apiKey = settings.apiKey;
      console.log('[Fanart.tv] API key updated');
    }
  }

  /**
   * Get artist gallery images by MusicBrainz ID
   */
  async getArtistGallery(mbid: string): Promise<ArtistImages> {
    if (!this.apiKey) {
      console.warn('[Fanart.tv] No API key configured');
      return this.emptyResult();
    }

    // Check cache
    const cached = this.cache.get(mbid);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const response = await fetch(`${FANART_API_URL}/${mbid}?api_key=${this.apiKey}`);

      if (!response.ok) {
        if (response.status === 404) {
          // No images found for this artist
          return this.emptyResult();
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as FanartArtistResponse;
      const result = this.transformResponse(data);

      // Cache the result
      this.cache.set(mbid, { data: result, timestamp: Date.now() });

      return result;
    } catch (error) {
      console.error('[Fanart.tv] Failed to fetch artist images:', error);
      return this.emptyResult();
    }
  }

  private transformResponse(data: FanartArtistResponse): ArtistImages {
    return {
      backgrounds: (data.artistbackground || []).map((img) => ({
        url: img.url,
        likes: parseInt(img.likes, 10) || 0,
      })),
      thumbs: (data.artistthumb || []).map((img) => ({
        url: img.url,
        likes: parseInt(img.likes, 10) || 0,
      })),
      logos: (data.musiclogo || []).map((img) => ({
        url: img.url,
        likes: parseInt(img.likes, 10) || 0,
      })),
      hdLogos: (data.hdmusiclogo || []).map((img) => ({
        url: img.url,
        likes: parseInt(img.likes, 10) || 0,
      })),
      banners: (data.musicbanner || []).map((img) => ({
        url: img.url,
        likes: parseInt(img.likes, 10) || 0,
      })),
    };
  }

  private emptyResult(): ArtistImages {
    return {
      backgrounds: [],
      thumbs: [],
      logos: [],
      hdLogos: [],
      banners: [],
    };
  }
}
