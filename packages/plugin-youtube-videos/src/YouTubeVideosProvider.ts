/**
 * YouTube Videos Provider
 *
 * Provides music videos from YouTube Data API v3.
 * Used for the Music Videos section on artist pages.
 */

import type {
  AddonManifest,
  ArtistEnrichmentProvider,
  MusicVideo,
} from '@audiio/core';
import type {
  YouTubeSearchResponse,
  YouTubeVideoDetails,
  YouTubeVideosSettings,
} from './types';

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

export class YouTubeVideosProvider implements ArtistEnrichmentProvider {
  readonly id = 'youtube-videos';
  readonly name = 'YouTube Music Videos';
  readonly enrichmentType = 'videos' as const;

  private apiKey: string = '';
  private cache: Map<string, { data: MusicVideo[]; timestamp: number }> = new Map();
  private cacheTTL = 1800000; // 30 minutes

  get manifest(): AddonManifest {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      description: 'YouTube Data API integration for artist music videos',
      roles: ['artist-enrichment'],
    };
  }

  async initialize(): Promise<void> {
    console.log('[YouTube Videos] Initializing...');
    if (!this.apiKey) {
      console.warn('[YouTube Videos] No API key configured. Music videos will not be available.');
    }
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  updateSettings(settings: Partial<YouTubeVideosSettings>): void {
    if (settings.apiKey) {
      this.apiKey = settings.apiKey;
      console.log('[YouTube Videos] API key updated');
    }
  }

  /**
   * Get artist music videos
   */
  async getArtistVideos(artistName: string, limit = 10): Promise<MusicVideo[]> {
    if (!this.apiKey) {
      console.warn('[YouTube Videos] No API key configured');
      return [];
    }

    const cacheKey = `${artistName}-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // Search for official music videos
      const searchQuery = `${artistName} official music video`;
      const searchParams = new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        videoCategoryId: '10', // Music category
        maxResults: String(limit),
        order: 'relevance',
        key: this.apiKey,
      });

      const searchResponse = await fetch(`${YOUTUBE_API_URL}/search?${searchParams}`);
      if (!searchResponse.ok) {
        throw new Error(`YouTube API error: ${searchResponse.status}`);
      }

      const searchData = (await searchResponse.json()) as YouTubeSearchResponse;
      const videoIds = searchData.items.map((item) => item.id.videoId).join(',');

      if (!videoIds) {
        return [];
      }

      // Get video details for view counts and durations
      const detailsParams = new URLSearchParams({
        part: 'contentDetails,statistics',
        id: videoIds,
        key: this.apiKey,
      });

      const detailsResponse = await fetch(`${YOUTUBE_API_URL}/videos?${detailsParams}`);
      const detailsData = (await detailsResponse.json()) as YouTubeVideoDetails;

      const detailsMap = new Map(
        detailsData.items.map((item) => [
          item.id,
          {
            duration: this.parseDuration(item.contentDetails.duration),
            viewCount: parseInt(item.statistics.viewCount, 10) || 0,
          },
        ])
      );

      const videos: MusicVideo[] = searchData.items.map((item) => {
        const details = detailsMap.get(item.id.videoId);
        return {
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url,
          publishedAt: item.snippet.publishedAt,
          viewCount: details?.viewCount,
          duration: details?.duration,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          source: 'youtube',
        };
      });

      // Cache the result
      this.cache.set(cacheKey, { data: videos, timestamp: Date.now() });

      return videos;
    } catch (error) {
      console.error('[YouTube Videos] Failed to fetch videos:', error);
      return [];
    }
  }

  /**
   * Parse ISO 8601 duration to human-readable format
   */
  private parseDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
