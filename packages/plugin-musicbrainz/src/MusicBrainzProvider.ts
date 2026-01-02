/**
 * MusicBrainz Metadata Provider
 *
 * Provides metadata enrichment from the audiio-musicbrainz API server.
 * This provider is primarily used for:
 * - Looking up MBIDs for tracks, artists, albums
 * - Enriching metadata with genres and tags
 * - ISRC-based lookups for accurate matching
 */

import type {
  AddonManifest,
  MetadataProvider,
  MetadataSearchResult,
  MetadataSearchOptions,
  MetadataTrack,
  Artist,
  Album,
} from '@audiio/core';
import type {
  MBArtist,
  MBRecording,
  MBRelease,
  MBSearchResult,
  IsrcBatchResponse,
} from './types';

const DEFAULT_API_URL = 'https://audiio-musicbrainz.fly.dev';

export class MusicBrainzProvider implements MetadataProvider {
  readonly id = 'musicbrainz';
  readonly name = 'MusicBrainz';
  readonly priority = 30; // Lower priority - used for enrichment, not primary search

  private apiUrl: string;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTTL = 3600000; // 1 hour

  get manifest(): AddonManifest {
    return {
      id: this.id,
      name: this.name,
      version: '1.0.0',
      description: 'MusicBrainz metadata provider for MBIDs, genres, and tags',
      roles: ['metadata-provider'],
    };
  }

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || process.env.MUSICBRAINZ_API_URL || DEFAULT_API_URL;
  }

  async initialize(): Promise<void> {
    console.log(`[MusicBrainz] Initializing with API: ${this.apiUrl}`);

    // Verify API is accessible
    try {
      const response = await fetch(`${this.apiUrl}/health`);
      if (response.ok) {
        console.log('[MusicBrainz] API connection successful');
      } else {
        console.warn('[MusicBrainz] API health check failed:', response.status);
      }
    } catch (error) {
      console.warn('[MusicBrainz] Could not connect to API:', error);
    }
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  /**
   * Search for tracks/recordings
   */
  async search(query: string, options?: MetadataSearchOptions): Promise<MetadataSearchResult> {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    try {
      const params = new URLSearchParams({
        title: query,
        limit: String(limit),
        offset: String(offset),
      });

      const response = await this.fetchWithCache<MBSearchResult<MBRecording>>(
        `/recordings/search?${params}`
      );

      const tracks: MetadataTrack[] = (response.recordings || []).map((r) =>
        this.recordingToTrack(r)
      );

      return {
        tracks,
        artists: [],
        albums: [],
      };
    } catch (error) {
      console.error('[MusicBrainz] Search failed:', error);
      return { tracks: [], artists: [], albums: [] };
    }
  }

  /**
   * Get track by MusicBrainz ID (MBID)
   */
  async getTrack(id: string): Promise<MetadataTrack | null> {
    try {
      const recording = await this.fetchWithCache<MBRecording>(`/recordings/${id}`);
      return this.recordingToTrack(recording);
    } catch (error) {
      console.error('[MusicBrainz] getTrack failed:', error);
      return null;
    }
  }

  /**
   * Get artist by MusicBrainz ID
   */
  async getArtist(id: string): Promise<Artist | null> {
    try {
      const artist = await this.fetchWithCache<MBArtist>(`/artists/${id}`);
      return this.mbArtistToArtist(artist);
    } catch (error) {
      console.error('[MusicBrainz] getArtist failed:', error);
      return null;
    }
  }

  /**
   * Get album/release by MusicBrainz ID
   */
  async getAlbum(id: string): Promise<(Album & { tracks: MetadataTrack[] }) | null> {
    try {
      const release = await this.fetchWithCache<MBRelease>(`/releases/${id}`);
      return this.releaseToAlbum(release);
    } catch (error) {
      console.error('[MusicBrainz] getAlbum failed:', error);
      return null;
    }
  }

  // ==================== MusicBrainz-specific methods ====================

  /**
   * Look up recording by ISRC
   */
  async getRecordingByIsrc(isrc: string): Promise<MBRecording | null> {
    try {
      return await this.fetchWithCache<MBRecording>(`/recordings/isrc/${isrc}`);
    } catch {
      return null;
    }
  }

  /**
   * Batch lookup recordings by ISRCs
   */
  async batchIsrcLookup(isrcs: string[]): Promise<IsrcBatchResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/lookup/isrc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isrcs }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as IsrcBatchResponse;
    } catch (error) {
      console.error('[MusicBrainz] Batch ISRC lookup failed:', error);
      return { results: [] };
    }
  }

  /**
   * Search artists by name
   */
  async searchArtists(name: string, limit = 10): Promise<MBArtist[]> {
    try {
      const params = new URLSearchParams({
        name,
        limit: String(limit),
      });

      const response = await this.fetchWithCache<MBSearchResult<MBArtist>>(
        `/artists/search?${params}`
      );

      return response.artists || [];
    } catch {
      return [];
    }
  }

  /**
   * Get genres for a track (by MBID or ISRC)
   */
  async getTrackGenres(mbidOrIsrc: string): Promise<string[]> {
    try {
      // Try as MBID first
      let recording = await this.fetchWithCache<MBRecording>(`/recordings/${mbidOrIsrc}`).catch(
        () => null
      );

      // If not found, try as ISRC
      if (!recording) {
        recording = await this.getRecordingByIsrc(mbidOrIsrc);
      }

      return recording?.genres || [];
    } catch {
      return [];
    }
  }

  /**
   * Get tags for a track (user-submitted MusicBrainz tags)
   */
  async getTrackTags(mbid: string): Promise<{ name: string; count: number }[]> {
    try {
      const recording = await this.fetchWithCache<MBRecording>(`/recordings/${mbid}`);
      return recording?.tags || [];
    } catch {
      return [];
    }
  }

  // ==================== Private helpers ====================

  private async fetchWithCache<T>(path: string): Promise<T> {
    const cacheKey = path;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T;
    }

    const response = await fetch(`${this.apiUrl}${path}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as T;
    this.cache.set(cacheKey, { data, timestamp: Date.now() });

    return data;
  }

  private recordingToTrack(recording: MBRecording): MetadataTrack {
    return {
      id: recording.mbid,
      title: recording.title,
      artists: [
        {
          id: recording.artist_mbids[0] || '',
          name: recording.artist_credit,
        },
      ],
      duration: recording.duration_ms ? recording.duration_ms / 1000 : 0,
      externalIds: {
        musicbrainz: recording.mbid,
        isrc: recording.isrc,
      },
      genres: recording.genres,
      _provider: this.id,
    };
  }

  private mbArtistToArtist(artist: MBArtist): Artist {
    return {
      id: artist.mbid,
      name: artist.name,
      genres: artist.genres,
    };
  }

  private releaseToAlbum(release: MBRelease): Album & { tracks: MetadataTrack[] } {
    return {
      id: release.mbid,
      title: release.title,
      artists: [
        {
          id: release.artist_mbids[0] || '',
          name: release.artist_credit,
        },
      ],
      releaseDate: release.date,
      trackCount: release.track_count,
      tracks: [], // Would need additional API call for track listing
    };
  }
}
