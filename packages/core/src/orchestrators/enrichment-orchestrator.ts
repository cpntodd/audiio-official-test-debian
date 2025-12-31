/**
 * EnrichmentOrchestrator - Routes artist enrichment requests to appropriate providers
 *
 * Uses the registry to discover artist enrichment providers and routes requests
 * based on enrichment type. Aggregates data from multiple providers.
 */

import type { AddonRegistry } from '../registry/addon-registry';
import type {
  MusicVideo,
  TimelineEntry,
  Setlist,
  Concert,
  ArtistImages,
  ArtistEnrichmentData,
} from '../types/addon';

export class EnrichmentOrchestrator {
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private cacheTTL = 30 * 60 * 1000; // 30 minutes

  constructor(private registry: AddonRegistry) {}

  /**
   * Get all enrichment data for an artist
   */
  async getArtistEnrichment(
    artistName: string,
    mbid?: string
  ): Promise<ArtistEnrichmentData> {
    const results: ArtistEnrichmentData = {};

    // Fetch all enrichment types in parallel
    const [videos, timeline, setlists, concerts, gallery, merchUrl] =
      await Promise.allSettled([
        this.getArtistVideos(artistName),
        this.getArtistTimeline(artistName),
        this.getArtistSetlists(artistName, mbid),
        this.getUpcomingConcerts(artistName),
        mbid ? this.getArtistGallery(mbid) : Promise.resolve(null),
        this.getMerchandiseUrl(artistName),
      ]);

    if (videos.status === 'fulfilled' && videos.value.length > 0) {
      results.musicVideos = videos.value;
    }
    if (timeline.status === 'fulfilled' && timeline.value.length > 0) {
      results.timeline = timeline.value;
    }
    if (setlists.status === 'fulfilled' && setlists.value.length > 0) {
      results.recentSetlists = setlists.value;
    }
    if (concerts.status === 'fulfilled' && concerts.value.length > 0) {
      results.upcomingShows = concerts.value;
    }
    if (gallery.status === 'fulfilled' && gallery.value) {
      results.gallery = gallery.value;
    }
    if (merchUrl.status === 'fulfilled' && merchUrl.value) {
      results.merchandiseUrl = merchUrl.value;
    }
    if (mbid) {
      results.mbid = mbid;
    }

    return results;
  }

  /**
   * Get artist music videos
   */
  async getArtistVideos(
    artistName: string,
    limit: number = 10
  ): Promise<MusicVideo[]> {
    const cacheKey = `videos:${artistName.toLowerCase()}`;
    const cached = this.getFromCache<MusicVideo[]>(cacheKey);
    if (cached) return cached;

    const providers = this.registry.getArtistEnrichmentProvidersByType('videos');
    if (providers.length === 0) {
      console.log('[EnrichmentOrchestrator] No video providers available');
      return [];
    }

    for (const provider of providers) {
      if (provider.getArtistVideos) {
        try {
          const videos = await provider.getArtistVideos(artistName, limit);
          if (videos.length > 0) {
            this.setCache(cacheKey, videos);
            return videos;
          }
        } catch (error) {
          console.error(
            `[EnrichmentOrchestrator] Video provider ${provider.id} failed:`,
            error
          );
        }
      }
    }

    return [];
  }

  /**
   * Get artist timeline/discography history
   */
  async getArtistTimeline(artistName: string): Promise<TimelineEntry[]> {
    const cacheKey = `timeline:${artistName.toLowerCase()}`;
    const cached = this.getFromCache<TimelineEntry[]>(cacheKey);
    if (cached) return cached;

    const providers =
      this.registry.getArtistEnrichmentProvidersByType('timeline');
    if (providers.length === 0) {
      console.log('[EnrichmentOrchestrator] No timeline providers available');
      return [];
    }

    for (const provider of providers) {
      if (provider.getArtistTimeline) {
        try {
          const timeline = await provider.getArtistTimeline(artistName);
          if (timeline.length > 0) {
            // Sort by year descending
            timeline.sort((a, b) => b.year - a.year);
            this.setCache(cacheKey, timeline);
            return timeline;
          }
        } catch (error) {
          console.error(
            `[EnrichmentOrchestrator] Timeline provider ${provider.id} failed:`,
            error
          );
        }
      }
    }

    return [];
  }

  /**
   * Get artist setlists from past concerts
   */
  async getArtistSetlists(
    artistName: string,
    mbid?: string,
    limit: number = 5
  ): Promise<Setlist[]> {
    const cacheKey = `setlists:${mbid || artistName.toLowerCase()}`;
    const cached = this.getFromCache<Setlist[]>(cacheKey);
    if (cached) return cached;

    const providers =
      this.registry.getArtistEnrichmentProvidersByType('setlists');
    if (providers.length === 0) {
      console.log('[EnrichmentOrchestrator] No setlist providers available');
      return [];
    }

    for (const provider of providers) {
      if (provider.getArtistSetlists) {
        try {
          const setlists = await provider.getArtistSetlists(
            artistName,
            mbid,
            limit
          );
          if (setlists.length > 0) {
            this.setCache(cacheKey, setlists);
            return setlists;
          }
        } catch (error) {
          console.error(
            `[EnrichmentOrchestrator] Setlist provider ${provider.id} failed:`,
            error
          );
        }
      }
    }

    return [];
  }

  /**
   * Get upcoming concerts for artist
   */
  async getUpcomingConcerts(artistName: string): Promise<Concert[]> {
    const cacheKey = `concerts:${artistName.toLowerCase()}`;
    const cached = this.getFromCache<Concert[]>(cacheKey);
    if (cached) return cached;

    const providers =
      this.registry.getArtistEnrichmentProvidersByType('concerts');
    if (providers.length === 0) {
      console.log('[EnrichmentOrchestrator] No concert providers available');
      return [];
    }

    for (const provider of providers) {
      if (provider.getUpcomingConcerts) {
        try {
          const concerts = await provider.getUpcomingConcerts(artistName);
          if (concerts.length > 0) {
            // Sort by date ascending (nearest first)
            concerts.sort(
              (a, b) =>
                new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
            );
            this.setCache(cacheKey, concerts);
            return concerts;
          }
        } catch (error) {
          console.error(
            `[EnrichmentOrchestrator] Concert provider ${provider.id} failed:`,
            error
          );
        }
      }
    }

    return [];
  }

  /**
   * Get artist gallery/images
   */
  async getArtistGallery(mbid: string): Promise<ArtistImages | null> {
    const cacheKey = `gallery:${mbid}`;
    const cached = this.getFromCache<ArtistImages>(cacheKey);
    if (cached) return cached;

    const providers =
      this.registry.getArtistEnrichmentProvidersByType('gallery');
    if (providers.length === 0) {
      console.log('[EnrichmentOrchestrator] No gallery providers available');
      return null;
    }

    for (const provider of providers) {
      if (provider.getArtistGallery) {
        try {
          const gallery = await provider.getArtistGallery(mbid);
          if (gallery) {
            this.setCache(cacheKey, gallery);
            return gallery;
          }
        } catch (error) {
          console.error(
            `[EnrichmentOrchestrator] Gallery provider ${provider.id} failed:`,
            error
          );
        }
      }
    }

    return null;
  }

  /**
   * Get merchandise URL for artist
   */
  async getMerchandiseUrl(artistName: string): Promise<string | null> {
    const cacheKey = `merch:${artistName.toLowerCase()}`;
    const cached = this.getFromCache<string>(cacheKey);
    if (cached) return cached;

    const providers =
      this.registry.getArtistEnrichmentProvidersByType('merchandise');
    if (providers.length === 0) {
      console.log('[EnrichmentOrchestrator] No merchandise providers available');
      return null;
    }

    for (const provider of providers) {
      if (provider.getMerchandiseUrl) {
        try {
          const url = await provider.getMerchandiseUrl(artistName);
          if (url) {
            this.setCache(cacheKey, url);
            return url;
          }
        } catch (error) {
          console.error(
            `[EnrichmentOrchestrator] Merchandise provider ${provider.id} failed:`,
            error
          );
        }
      }
    }

    return null;
  }

  /**
   * Check if any enrichment providers are available
   */
  hasProviders(): boolean {
    return this.registry.getArtistEnrichmentProviders().length > 0;
  }

  /**
   * Get available enrichment types based on registered providers
   */
  getAvailableEnrichmentTypes(): string[] {
    const providers = this.registry.getArtistEnrichmentProviders();
    const types = new Set<string>();
    for (const provider of providers) {
      types.add(provider.enrichmentType);
    }
    return Array.from(types);
  }

  /**
   * Clear the enrichment cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.data as T;
    }
    return null;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}
