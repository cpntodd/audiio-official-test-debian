/**
 * Smart Queue Store - Auto-queue and Radio Mode
 *
 * Provides:
 * - Smart auto-queue: Automatically adds tracks when queue runs low
 * - Radio mode: Infinite playback from a seed (track, artist, genre)
 * - Session history tracking to prevent repetition
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { UnifiedTrack } from '@audiio/core';
import { usePlayerStore } from './player-store';
import { useRecommendationStore } from './recommendation-store';
import { useMLStore } from './ml-store';
import { useLibraryStore } from './library-store';
import { useSearchStore } from './search-store';
import {
  batchEnhancedScore,
  getAudioFeatures,
  getFeatureProviders,
  type ScoringContext,
  type EnhancedScore,
  type AudioFeatures
} from '../ml/advanced-scoring';

// ============================================
// Types
// ============================================

export type QueueMode = 'manual' | 'auto-queue' | 'radio';
export type RadioSeedType = 'track' | 'artist' | 'genre';

// Queue source tracking - why was this track added?
export type QueueSourceType =
  | 'manual'       // User explicitly added
  | 'artist'       // Same/similar artist
  | 'album'        // Same album
  | 'genre'        // Genre match
  | 'similar'      // Similar track (ML/audio features)
  | 'radio'        // Radio station
  | 'mood'         // Mood/energy match
  | 'discovery'    // New discovery from API
  | 'trending'     // Trending tracks
  | 'search'       // From search results
  | 'liked'        // From user's liked tracks
  | 'playlist'     // From user's playlists
  | 'ml'           // ML recommendation
  | 'auto';        // Generic auto-queue

export interface QueueSource {
  type: QueueSourceType;
  label: string;           // Human-readable description
  context?: string;        // Additional context (artist name, genre, etc.)
  score?: number;          // ML/relevance score when added
  timestamp: number;       // When it was added
  seedTrackId?: string;    // What track triggered this recommendation
}

export interface RadioSeed {
  type: RadioSeedType;
  id: string;
  name: string;
  artwork?: string;
  // Additional context for better recommendations
  genres?: string[];
  artistIds?: string[];
  // Audio features for ML-enhanced matching
  audioFeatures?: Partial<AudioFeatures>;
}

export interface SmartQueueConfig {
  autoQueueEnabled: boolean;
  autoQueueThreshold: number;     // Trigger when queue has <= this many tracks left
  autoQueueBatchSize: number;     // How many tracks to add at a time
  limitArtistRepetition: boolean; // Avoid too many tracks from same artist
  maxArtistPerBatch: number;      // Max tracks per artist in a batch
  useMLRecommendations: boolean;  // Use ML vs rule-based
}

export interface RadioConfig {
  seedWeight: number;        // 0-1, how much to prioritize seed similarity
  diversityFactor: number;   // 0-1, how much variety to introduce
  progressiveDrift: boolean; // Gradually drift from seed over time
}

export interface SessionHistory {
  playedTrackIds: string[];
  playedArtistIds: string[];
  sessionStartTime: number;
}

// Track with source metadata for queue
export interface QueuedTrack {
  track: UnifiedTrack;
  source: QueueSource;
}

interface SmartQueueState {
  // Mode state
  mode: QueueMode;

  // Radio state
  radioSeed: RadioSeed | null;
  radioTracksPlayed: number;

  // Session tracking
  sessionHistory: SessionHistory;

  // Fetch state
  isAutoQueueFetching: boolean;
  lastAutoQueueFetch: number;
  autoQueueError: string | null;
  consecutiveFailures: number;

  // Configuration
  config: SmartQueueConfig;
  radioConfig: RadioConfig;

  // Candidate cache (tracks fetched but not yet added)
  pendingCandidates: UnifiedTrack[];

  // Queue source tracking - why was each track added?
  queueSources: Record<string, QueueSource>;

  // Actions - Mode
  setMode: (mode: QueueMode) => void;
  enableAutoQueue: () => void;
  disableAutoQueue: () => void;
  toggleAutoQueue: () => void;

  // Actions - Radio
  startRadio: (seed: RadioSeed, availableTracks?: UnifiedTrack[]) => Promise<void>;
  stopRadio: () => void;

  // Actions - Queue Management
  checkAndReplenish: (availableTracks: UnifiedTrack[]) => Promise<void>;
  fetchMoreTracks: (availableTracks: UnifiedTrack[]) => Promise<UnifiedTrack[]>;
  recordTrackPlayed: (track: UnifiedTrack) => void;
  determineTrackSource: (track: UnifiedTrack, currentTrack: UnifiedTrack | null) => QueueSource;

  // Actions - Queue Source Tracking
  setQueueSource: (trackId: string, source: QueueSource) => void;
  getQueueSource: (trackId: string) => QueueSource | undefined;
  clearQueueSources: () => void;

  // Actions - Session
  clearSession: () => void;
  resetSession: () => void;

  // Actions - Configuration
  updateConfig: (config: Partial<SmartQueueConfig>) => void;
  updateRadioConfig: (config: Partial<RadioConfig>) => void;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_CONFIG: SmartQueueConfig = {
  autoQueueEnabled: false,
  autoQueueThreshold: 2,
  autoQueueBatchSize: 10,
  limitArtistRepetition: true,
  maxArtistPerBatch: 2,
  useMLRecommendations: true
};

const DEFAULT_RADIO_CONFIG: RadioConfig = {
  seedWeight: 0.7,
  diversityFactor: 0.3,
  progressiveDrift: true
};

const MIN_FETCH_INTERVAL_MS = 5000;
const MAX_SESSION_HISTORY = 200;
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

// ============================================
// Helper Functions
// ============================================

/**
 * Normalize a title for comparison (lowercase, remove common suffixes/prefixes)
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical content (remix, live, etc.)
    .replace(/\s*\[.*?\]\s*/g, '') // Remove bracketed content
    .replace(/\s*-\s*(remaster|remix|live|acoustic|demo|radio edit|extended|original).*$/i, '')
    .replace(/^(the|a|an)\s+/i, '') // Remove leading articles
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if two titles are too similar (likely same song)
 */
function areTitlesTooSimilar(title1: string, title2: string): boolean {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);

  // Exact match after normalization
  if (norm1 === norm2) return true;

  // One contains the other (e.g., "Flagpole" vs "Flagpole Sitta")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    // Only if the shorter one is at least 5 chars (avoid matching "I" in everything)
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    if (shorter.length >= 5) return true;
  }

  // Check word overlap - if most words match, it's too similar
  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  if (words1.length === 0 || words2.length === 0) return false;

  const commonWords = words1.filter(w => words2.includes(w));
  const overlapRatio = commonWords.length / Math.min(words1.length, words2.length);

  return overlapRatio >= 0.8; // 80% word overlap = too similar
}

/**
 * Apply diversity filter to avoid too many tracks from same artist
 */
function applyDiversityFilter(
  tracks: UnifiedTrack[],
  limit: number,
  maxPerArtist: number
): UnifiedTrack[] {
  if (!tracks.length) return [];

  const result: UnifiedTrack[] = [];
  const artistCounts = new Map<string, number>();

  for (const track of tracks) {
    if (result.length >= limit) break;

    const mainArtist = track.artists[0]?.name?.toLowerCase() || 'unknown';
    const artistCount = artistCounts.get(mainArtist) || 0;

    if (artistCount < maxPerArtist) {
      result.push(track);
      artistCounts.set(mainArtist, artistCount + 1);
    }
  }

  // If we couldn't fill the limit, add remaining tracks
  if (result.length < limit) {
    const remaining = tracks.filter(t => !result.includes(t));
    result.push(...remaining.slice(0, limit - result.length));
  }

  return result;
}

/**
 * Circle of Fifths key compatibility
 * Adjacent keys are compatible (0 = same key, 1-2 = compatible, 3+ = less compatible)
 */
const KEY_POSITIONS: Record<string, number> = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5,
  'F#': 6, 'Gb': 6, 'C#': 7, 'Db': 7, 'Ab': 8, 'G#': 8,
  'Eb': 9, 'D#': 9, 'Bb': 10, 'A#': 10, 'F': 11,
  // Minor keys (parallel to major)
  'Am': 0, 'Em': 1, 'Bm': 2, 'F#m': 3, 'C#m': 4, 'G#m': 5,
  'D#m': 6, 'Ebm': 6, 'A#m': 7, 'Bbm': 7, 'Fm': 8,
  'Cm': 9, 'Gm': 10, 'Dm': 11
};

/**
 * Calculate key compatibility using Circle of Fifths
 */
function calculateKeyCompatibility(key1: string | undefined, key2: string | undefined): number {
  if (!key1 || !key2) return 0.5; // Unknown = neutral

  const pos1 = KEY_POSITIONS[key1];
  const pos2 = KEY_POSITIONS[key2];

  if (pos1 === undefined || pos2 === undefined) return 0.5;

  // Calculate distance on Circle of Fifths
  const distance = Math.min(
    Math.abs(pos1 - pos2),
    12 - Math.abs(pos1 - pos2)
  );

  // Same key = 1.0, adjacent = 0.8, 2 away = 0.6, etc.
  return Math.max(0, 1 - (distance * 0.2));
}

/**
 * Calculate seed relevance for radio mode
 * Enhanced with ML-based audio feature matching
 */
function calculateSeedRelevance(track: UnifiedTrack, seed: RadioSeed): number {
  let relevance = 0;

  // Basic metadata matching
  switch (seed.type) {
    case 'track':
      // Check artist match
      if (seed.artistIds?.some(id =>
        track.artists.some(a => a.id === id || a.name.toLowerCase() === id.toLowerCase())
      )) {
        relevance += 30; // Reduced from 40 to leave room for audio features
      }
      // Check genre match
      if (seed.genres?.some(g =>
        track.genres?.some(tg => tg.toLowerCase().includes(g.toLowerCase()))
      )) {
        relevance += 20; // Reduced from 30
      }
      break;

    case 'artist':
      // Direct artist match = high relevance
      if (track.artists.some(a =>
        a.id === seed.id || a.name.toLowerCase() === seed.name.toLowerCase()
      )) {
        relevance += 50; // Reduced from 60
      }
      // Genre match from artist
      if (seed.genres?.some(g =>
        track.genres?.some(tg => tg.toLowerCase().includes(g.toLowerCase()))
      )) {
        relevance += 20; // Reduced from 25
      }
      break;

    case 'genre':
      // Genre match
      if (track.genres?.some(g =>
        g.toLowerCase().includes(seed.id.toLowerCase()) ||
        seed.id.toLowerCase().includes(g.toLowerCase())
      )) {
        relevance += 60; // Reduced from 70
      }
      break;
  }

  // ML-enhanced audio feature matching (up to +40 points)
  if (seed.audioFeatures) {
    const seedFeatures = seed.audioFeatures;
    const trackFeatures = track.audioFeatures || {};

    let audioBonus = 0;
    let audioFactors = 0;

    // BPM compatibility (+12 max)
    if (seedFeatures.bpm !== undefined && trackFeatures.bpm !== undefined) {
      const bpmDiff = Math.abs(seedFeatures.bpm - trackFeatures.bpm);
      const bpmRatio = Math.min(bpmDiff / seedFeatures.bpm, 1);
      // Within 10% BPM = full bonus, scales down linearly
      if (bpmRatio <= 0.1) {
        audioBonus += 12;
      } else if (bpmRatio <= 0.2) {
        audioBonus += 8;
      } else if (bpmRatio <= 0.3) {
        audioBonus += 4;
      }
      audioFactors++;
    }

    // Energy compatibility (+12 max)
    if (seedFeatures.energy !== undefined && trackFeatures.energy !== undefined) {
      const energyDiff = Math.abs(seedFeatures.energy - trackFeatures.energy);
      // Within 0.2 energy = full bonus
      if (energyDiff <= 0.15) {
        audioBonus += 12;
      } else if (energyDiff <= 0.25) {
        audioBonus += 8;
      } else if (energyDiff <= 0.35) {
        audioBonus += 4;
      }
      audioFactors++;
    }

    // Key compatibility using Circle of Fifths (+10 max)
    if (seedFeatures.key !== undefined && trackFeatures.key !== undefined) {
      const keyCompat = calculateKeyCompatibility(seedFeatures.key, trackFeatures.key);
      audioBonus += Math.round(keyCompat * 10);
      audioFactors++;
    }

    // Valence/mood compatibility (+6 max)
    if (seedFeatures.valence !== undefined && trackFeatures.valence !== undefined) {
      const valenceDiff = Math.abs(seedFeatures.valence - trackFeatures.valence);
      if (valenceDiff <= 0.2) {
        audioBonus += 6;
      } else if (valenceDiff <= 0.35) {
        audioBonus += 3;
      }
      audioFactors++;
    }

    // Add audio bonus to relevance
    relevance += audioBonus;

    // Log audio feature matching for debugging
    if (audioFactors > 0) {
      console.log(`[RadioSeed] Audio match for "${track.title}": +${audioBonus} (${audioFactors} factors)`);
    }
  }

  return Math.min(100, relevance);
}

// ============================================
// Store Implementation
// ============================================

export const useSmartQueueStore = create<SmartQueueState>()(
  persist(
    (set, get) => ({
      // Initial state
      mode: 'manual',
      radioSeed: null,
      radioTracksPlayed: 0,
      sessionHistory: {
        playedTrackIds: [],
        playedArtistIds: [],
        sessionStartTime: Date.now()
      },
      isAutoQueueFetching: false,
      lastAutoQueueFetch: 0,
      autoQueueError: null,
      consecutiveFailures: 0,
      config: DEFAULT_CONFIG,
      radioConfig: DEFAULT_RADIO_CONFIG,
      pendingCandidates: [],
      queueSources: {},

      // ==========================================
      // Mode Actions
      // ==========================================

      setMode: (mode) => set({ mode }),

      enableAutoQueue: () => set({
        mode: 'auto-queue',
        config: { ...get().config, autoQueueEnabled: true }
      }),

      disableAutoQueue: () => set({
        mode: 'manual',
        config: { ...get().config, autoQueueEnabled: false }
      }),

      toggleAutoQueue: () => {
        const { config, mode } = get();
        if (config.autoQueueEnabled || mode === 'auto-queue') {
          get().disableAutoQueue();
        } else {
          get().enableAutoQueue();
        }
      },

      // ==========================================
      // Radio Actions
      // ==========================================

      startRadio: async (seed, availableTracks = []) => {
        const playerStore = usePlayerStore.getState();

        // Try to fetch audio features for the seed (enhances ML matching)
        let enrichedSeed = seed;
        if (seed.type === 'track' && !seed.audioFeatures) {
          try {
            const audioFeatures = await getAudioFeatures(seed.id);
            if (audioFeatures) {
              enrichedSeed = { ...seed, audioFeatures };
              console.log('[SmartQueue] Enriched seed with audio features:', audioFeatures);
            }
          } catch (error) {
            console.warn('[SmartQueue] Could not fetch audio features for seed:', error);
          }
        }

        // Set radio mode
        set({
          mode: 'radio',
          radioSeed: enrichedSeed,
          radioTracksPlayed: 0,
          sessionHistory: {
            playedTrackIds: [],
            playedArtistIds: [],
            sessionStartTime: Date.now()
          },
          autoQueueError: null,
          consecutiveFailures: 0
        });

        console.log('[SmartQueue] Starting radio with seed:', enrichedSeed);

        // Fetch initial tracks
        if (availableTracks.length > 0) {
          const tracks = await get().fetchMoreTracks(availableTracks);

          if (tracks.length > 0) {
            // Set queue and start playing
            playerStore.setQueue(tracks, 0);
            await playerStore.play(tracks[0]);

            // Record first track
            get().recordTrackPlayed(tracks[0]);
          }
        }
      },

      stopRadio: () => {
        set({
          mode: 'manual',
          radioSeed: null,
          radioTracksPlayed: 0,
          pendingCandidates: []
        });
        console.log('[SmartQueue] Radio stopped');
      },

      // ==========================================
      // Queue Management
      // ==========================================

      checkAndReplenish: async (availableTracks) => {
        const state = get();
        const { config, mode, isAutoQueueFetching, lastAutoQueueFetch } = state;

        // Only replenish if in auto-queue or radio mode
        if (mode === 'manual') return;
        if (!config.autoQueueEnabled && mode !== 'radio') return;

        // Prevent concurrent fetches
        if (isAutoQueueFetching) return;

        // Rate limiting
        if (Date.now() - lastAutoQueueFetch < MIN_FETCH_INTERVAL_MS) return;

        const playerStore = usePlayerStore.getState();
        const { queue, queueIndex } = playerStore;

        // Calculate remaining tracks
        const remainingTracks = queue.length - queueIndex - 1;

        if (remainingTracks <= config.autoQueueThreshold) {
          console.log('[SmartQueue] Replenishing queue, remaining:', remainingTracks);

          set({ isAutoQueueFetching: true });

          try {
            const newTracks = await state.fetchMoreTracks(availableTracks);

            if (newTracks.length > 0) {
              const currentTrack = playerStore.currentTrack;

              // Add to queue and track sources
              const newSources: Record<string, QueueSource> = {};
              newTracks.forEach(track => {
                playerStore.addToQueue(track);
                // Determine and store source
                const source = state.determineTrackSource(track, currentTrack);
                newSources[track.id] = source;
              });

              set(prev => ({
                isAutoQueueFetching: false,
                lastAutoQueueFetch: Date.now(),
                autoQueueError: null,
                consecutiveFailures: 0,
                queueSources: { ...prev.queueSources, ...newSources }
              }));

              console.log('[SmartQueue] Added', newTracks.length, 'tracks to queue with source tracking');
            } else {
              set({
                isAutoQueueFetching: false,
                lastAutoQueueFetch: Date.now(),
                autoQueueError: 'No matching tracks found',
                consecutiveFailures: state.consecutiveFailures + 1
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch tracks';
            console.error('[SmartQueue] Fetch error:', message);

            set({
              isAutoQueueFetching: false,
              lastAutoQueueFetch: Date.now(),
              autoQueueError: message,
              consecutiveFailures: state.consecutiveFailures + 1
            });
          }
        }
      },

      fetchMoreTracks: async (availableTracks) => {
        const state = get();
        const { config, radioConfig, mode, radioSeed, sessionHistory, radioTracksPlayed } = state;

        const playerStore = usePlayerStore.getState();
        const recStore = useRecommendationStore.getState();
        const mlStore = useMLStore.getState();
        const searchStore = useSearchStore.getState();

        const currentTrack = playerStore.currentTrack;

        // Build exclusion set
        const excludeIds = new Set<string>();
        playerStore.queue.forEach(t => excludeIds.add(t.id));
        sessionHistory.playedTrackIds.forEach(id => excludeIds.add(id));
        Object.keys(recStore.dislikedTracks).forEach(id => excludeIds.add(id));

        // Track sources separately for better weighting
        const localTracks: UnifiedTrack[] = [];    // User's library (likes, playlists)
        const discoveryTracks: UnifiedTrack[] = []; // New music from API/search
        const similarTracks: UnifiedTrack[] = [];   // Similar to current track

        console.log('[SmartQueue] Gathering candidates from multiple sources...');
        console.log(`[SmartQueue] Current track: ${currentTrack?.title || 'none'} by ${currentTrack?.artists[0]?.name || 'unknown'}`);

        // ========================================
        // SOURCE 1: Local Library (availableTracks already contains likes + playlists)
        // ========================================
        if (availableTracks.length > 0) {
          localTracks.push(...availableTracks);
          console.log(`[SmartQueue] Local library: ${availableTracks.length} tracks`);
        }

        // ========================================
        // SOURCE 2: Plugin-based similar track discovery
        // ========================================
        if (currentTrack) {
          // Try to get similar tracks from registered plugins
          for (const provider of getFeatureProviders()) {
            if (provider.getSimilarTracks) {
              try {
                const similarIds = await provider.getSimilarTracks(currentTrack.id, 20);
                if (similarIds.length > 0) {
                  console.log(`[SmartQueue] Plugin ${provider.pluginId} returned ${similarIds.length} similar tracks`);
                  // Note: These are IDs, we'd need to resolve them to full tracks
                  // For now, log that we got them - actual resolution depends on backend
                }
              } catch (error) {
                console.warn(`[SmartQueue] Plugin ${provider.pluginId} similar tracks failed:`, error);
              }
            }
          }
        }

        // ========================================
        // SOURCE 3: API-based similar/recommended tracks
        // ========================================
        try {
          // Similar tracks based on current track
          if (window.api?.getSimilarTracks && currentTrack) {
            const similar = await window.api.getSimilarTracks(currentTrack.id);
            if (similar && similar.length > 0) {
              similarTracks.push(...similar);
              console.log(`[SmartQueue] API similar: ${similar.length} tracks`);
            }
          }

          // Recommendations based on context
          if (window.api?.getRecommendedTracks) {
            // For radio mode, use the seed
            if (mode === 'radio' && radioSeed) {
              const seedType = radioSeed.type === 'track' ? 'artist' : radioSeed.type;
              const recs = await window.api.getRecommendedTracks(seedType as 'artist' | 'genre', radioSeed.id);
              if (recs?.length > 0) {
                discoveryTracks.push(...recs);
                console.log(`[SmartQueue] Radio seed recs: ${recs.length} tracks`);
              }
            }

            // Always get artist-based recommendations if we have a current track
            if (currentTrack?.artists[0]) {
              const artistId = currentTrack.artists[0].id || currentTrack.artists[0].name;
              const artistRecs = await window.api.getRecommendedTracks('artist', artistId);
              if (artistRecs?.length > 0) {
                discoveryTracks.push(...artistRecs);
                console.log(`[SmartQueue] Artist recs (${currentTrack.artists[0].name}): ${artistRecs.length} tracks`);
              }
            }

            // Get genre-based recommendations
            if (currentTrack?.genres?.[0]) {
              const genreRecs = await window.api.getRecommendedTracks('genre', currentTrack.genres[0]);
              if (genreRecs?.length > 0) {
                discoveryTracks.push(...genreRecs);
                console.log(`[SmartQueue] Genre recs (${currentTrack.genres[0]}): ${genreRecs.length} tracks`);
              }
            }

            // Also try user's top genres for discovery
            const topGenres = Object.entries(recStore.userProfile.genrePreferences)
              .sort((a, b) => (b[1] as any).score - (a[1] as any).score)
              .slice(0, 2)
              .map(([genre]) => genre);

            for (const genre of topGenres) {
              if (genre !== currentTrack?.genres?.[0]) { // Don't duplicate
                try {
                  const genreRecs = await window.api.getRecommendedTracks('genre', genre);
                  if (genreRecs?.length > 0) {
                    discoveryTracks.push(...genreRecs.slice(0, 10)); // Limit per genre
                    console.log(`[SmartQueue] User genre recs (${genre}): ${Math.min(genreRecs.length, 10)} tracks`);
                  }
                } catch { /* ignore */ }
              }
            }
          }

          // ========================================
          // SOURCE 4: Smart search queries for discovery
          // ========================================
          const needMoreDiscovery = discoveryTracks.length < 20;
          if (needMoreDiscovery && window.api?.search) {
            const searchQueries: string[] = [];

            // Build smart search queries
            if (currentTrack) {
              // "fans also like" style query
              if (currentTrack.artists[0]) {
                searchQueries.push(`${currentTrack.artists[0].name} fans also like`);
                searchQueries.push(`similar to ${currentTrack.artists[0].name}`);
              }
              // Genre + mood query
              if (currentTrack.genres?.[0]) {
                searchQueries.push(`best ${currentTrack.genres[0]} 2024`);
                searchQueries.push(`${currentTrack.genres[0]} playlist`);
              }
            }

            // User preference based queries
            const topArtists = Object.entries(recStore.userProfile.artistPreferences)
              .sort((a, b) => (b[1] as any).score - (a[1] as any).score)
              .slice(0, 3)
              .map(([_, pref]) => (pref as any).artistName);

            for (const artist of topArtists) {
              if (artist && artist !== currentTrack?.artists[0]?.name) {
                searchQueries.push(`${artist} popular songs`);
              }
            }

            // Execute searches (limit API calls)
            for (const query of searchQueries.slice(0, 3)) {
              try {
                const results = await window.api.search({ query, type: 'track' });
                if (results?.length > 0) {
                  discoveryTracks.push(...results.slice(0, 15));
                  console.log(`[SmartQueue] Search "${query}": ${Math.min(results.length, 15)} tracks`);
                }
              } catch {
                console.warn(`[SmartQueue] Search failed: "${query}"`);
              }
            }
          }

          // ========================================
          // SOURCE 5: Trending as fallback for discovery
          // ========================================
          if (discoveryTracks.length < 10 && window.api?.getTrending) {
            const trending = await window.api.getTrending();
            if (trending?.tracks?.length > 0) {
              discoveryTracks.push(...trending.tracks.slice(0, 20));
              console.log(`[SmartQueue] Trending fallback: ${Math.min(trending.tracks.length, 20)} tracks`);
            }
          }

          // ========================================
          // SOURCE 6: Cached search results (low priority)
          // ========================================
          if (searchStore.results.tracks.length > 0) {
            discoveryTracks.push(...searchStore.results.tracks);
            console.log(`[SmartQueue] Search cache: ${searchStore.results.tracks.length} tracks`);
          }

        } catch (error) {
          console.warn('[SmartQueue] API fetch failed:', error);
        }

        // ========================================
        // COMBINE sources with smart weighting
        // ========================================
        // Goal: Balance familiarity (local) with discovery (new)
        // If we have lots of local tracks, favor discovery
        // If we have few discovery tracks, use more local

        let candidates: UnifiedTrack[] = [];
        const localCount = localTracks.length;
        const discoveryCount = discoveryTracks.length + similarTracks.length;

        console.log(`[SmartQueue] Source breakdown - Local: ${localCount}, Similar: ${similarTracks.length}, Discovery: ${discoveryTracks.length}`);

        // Smart interleaving: alternate between discovery and local
        // Prioritize: similar > discovery > local
        const interleaved: UnifiedTrack[] = [];
        let simIdx = 0, discIdx = 0, localIdx = 0;

        // First, add all similar tracks (highest priority)
        while (simIdx < similarTracks.length) {
          interleaved.push(similarTracks[simIdx++]);
        }

        // Then interleave discovery and local (2:1 ratio favoring discovery)
        while (discIdx < discoveryTracks.length || localIdx < localTracks.length) {
          // Add 2 discovery tracks
          if (discIdx < discoveryTracks.length) interleaved.push(discoveryTracks[discIdx++]);
          if (discIdx < discoveryTracks.length) interleaved.push(discoveryTracks[discIdx++]);
          // Add 1 local track
          if (localIdx < localTracks.length) interleaved.push(localTracks[localIdx++]);
        }

        candidates = interleaved;

        // Deduplicate and filter
        const seen = new Set<string>();
        const seenTitles: string[] = []; // Track normalized titles to avoid similar songs

        // Add current track title to avoid recommending same song
        if (currentTrack?.title) {
          seenTitles.push(normalizeTitle(currentTrack.title));
        }

        // Also add recent queue titles
        const recentQueueTitles = playerStore.queue
          .slice(Math.max(0, playerStore.queueIndex - 3), playerStore.queueIndex + 1)
          .map(t => t.title)
          .filter(Boolean);
        recentQueueTitles.forEach(title => {
          const norm = normalizeTitle(title);
          if (!seenTitles.includes(norm)) seenTitles.push(norm);
        });

        candidates = candidates.filter(track => {
          if (!track?.id) return false;
          if (seen.has(track.id)) return false;
          if (excludeIds.has(track.id)) return false;

          // Check title similarity - avoid same song with different ID
          const normTitle = normalizeTitle(track.title);
          const isTooSimilar = seenTitles.some(existingTitle =>
            areTitlesTooSimilar(track.title, existingTitle) ||
            normTitle === existingTitle
          );

          if (isTooSimilar) {
            console.log(`[SmartQueue] Filtered out similar title: "${track.title}"`);
            return false;
          }

          seen.add(track.id);
          seenTitles.push(normTitle);
          return true;
        });

        console.log(`[SmartQueue] ${candidates.length} unique candidates after deduplication + title filtering`);

        if (candidates.length === 0) {
          console.warn('[SmartQueue] No candidates available for auto-queue');
          return [];
        }

        // Build scoring context from session
        const now = new Date();
        const recentTracks = playerStore.queue.slice(
          Math.max(0, playerStore.queueIndex - 5),
          playerStore.queueIndex + 1
        );

        // Try to get energy levels from recent tracks for flow scoring
        const recentEnergy: number[] = [];
        for (const track of recentTracks.slice(-3)) {
          // Check if track has audio features (from plugin or embedded)
          const features = track.audioFeatures || await getAudioFeatures(track.id);
          if (features?.energy !== undefined) {
            recentEnergy.push(features.energy);
          }
        }

        // Determine exploration mode dynamically
        // More discovery tracks available = more exploitation (we have options)
        // Fewer discovery = more exploration (need to find new things)
        const discoveryRatio = discoveryCount / Math.max(1, localCount + discoveryCount);
        let explorationMode: 'exploit' | 'explore' | 'balanced' = 'balanced';
        if (discoveryRatio > 0.6) {
          explorationMode = 'exploit'; // Lots of discovery, focus on user prefs
        } else if (discoveryRatio < 0.3) {
          explorationMode = 'explore'; // Few discovery, find new things
        }

        console.log(`[SmartQueue] Exploration mode: ${explorationMode} (discovery ratio: ${(discoveryRatio * 100).toFixed(0)}%)`);

        const scoringContext: ScoringContext = {
          hour: now.getHours(),
          dayOfWeek: now.getDay(),
          sessionTracks: recentTracks,
          recentGenres: recentTracks.flatMap(t => t.genres || []).slice(0, 10),
          recentArtists: recentTracks.map(t => t.artists[0]?.name).filter(Boolean).slice(0, 5),
          recentEnergy,
          explorationMode,
          userMood: 'auto'
        };

        // Get user profile data for advanced scoring
        const userProfile = {
          genrePreferences: recStore.userProfile.genrePreferences as unknown as Record<string, number>,
          artistPreferences: recStore.userProfile.artistPreferences as unknown as Record<string, number>,
          artistHistory: recStore.getArtistHistory(),
          genreHistory: recStore.getGenreHistory(),
          timePatterns: recStore.getTimePatternsForScoring()
        };

        const playCounts = recStore.getPlayCounts();

        // Get base scores (ML or rule-based)
        const baseScores = new Map<string, number>();
        const useML = config.useMLRecommendations && mlStore.isModelLoaded;

        for (const track of candidates) {
          let baseScore: number;

          if (mode === 'radio' && radioSeed) {
            // Radio mode: combine base score with seed relevance
            const rawScore = useML
              ? mlStore.getHybridScore(track)
              : recStore.calculateTrackScore(track);

            const seedRelevance = calculateSeedRelevance(track, radioSeed);

            // Progressive drift
            let effectiveSeedWeight = radioConfig.seedWeight;
            if (radioConfig.progressiveDrift) {
              effectiveSeedWeight = Math.max(0.3, radioConfig.seedWeight - (radioTracksPlayed * 0.02));
            }

            baseScore = (rawScore * (1 - effectiveSeedWeight)) +
                       (seedRelevance * effectiveSeedWeight);
          } else {
            baseScore = useML
              ? mlStore.getHybridScore(track)
              : recStore.calculateTrackScore(track);
          }

          baseScores.set(track.id, baseScore);
        }

        console.log(`[SmartQueue] Using ${useML ? 'ML hybrid' : 'rule-based'} + advanced scoring...`);

        // Apply advanced scoring (exploration, serendipity, diversity, flow)
        const enhancedScores = await batchEnhancedScore(
          candidates,
          baseScores,
          scoringContext,
          userProfile,
          playCounts
        );

        // Convert to array and sort
        const scored = candidates.map(track => {
          const enhanced = enhancedScores.get(track.id);
          return {
            track,
            score: enhanced?.finalScore ?? baseScores.get(track.id) ?? 0,
            explanation: enhanced?.explanation || []
          };
        });

        scored.sort((a, b) => b.score - a.score);

        // Log top candidates with explanations
        console.log('[SmartQueue] Top 5 candidates:');
        scored.slice(0, 5).forEach((s, i) => {
          const reasons = s.explanation.length > 0 ? ` [${s.explanation.join(', ')}]` : '';
          console.log(`  ${i + 1}. ${s.track.title} by ${s.track.artists[0]?.name} (${s.score.toFixed(1)})${reasons}`);
        });

        // Apply diversity filter to avoid same-artist repetition
        let selected = scored.map(s => s.track);
        if (config.limitArtistRepetition) {
          selected = applyDiversityFilter(
            selected,
            config.autoQueueBatchSize,
            config.maxArtistPerBatch
          );
        } else {
          selected = selected.slice(0, config.autoQueueBatchSize);
        }

        console.log(`[SmartQueue] Selected ${selected.length} tracks for queue`);
        return selected;
      },

      recordTrackPlayed: (track) => {
        set(state => {
          const newPlayedTrackIds = [...state.sessionHistory.playedTrackIds, track.id];
          const newPlayedArtistIds = [
            ...state.sessionHistory.playedArtistIds,
            ...track.artists.map(a => a.id || a.name)
          ];

          // Limit history size
          const playedTrackIds = newPlayedTrackIds.slice(-MAX_SESSION_HISTORY);
          const playedArtistIds = newPlayedArtistIds.slice(-MAX_SESSION_HISTORY * 2);

          return {
            sessionHistory: {
              ...state.sessionHistory,
              playedTrackIds,
              playedArtistIds
            },
            radioTracksPlayed: state.mode === 'radio'
              ? state.radioTracksPlayed + 1
              : state.radioTracksPlayed
          };
        });
      },

      /**
       * Determine why a track was added to the queue
       */
      determineTrackSource: (track, currentTrack) => {
        const state = get();
        const { mode, radioSeed } = state;
        const libraryStore = useLibraryStore.getState();
        const now = Date.now();

        // Radio mode - check seed type
        if (mode === 'radio' && radioSeed) {
          // Check if track is from seed artist
          if (radioSeed.type === 'artist' && track.artists.some(a =>
            a.id === radioSeed.id || a.name.toLowerCase() === radioSeed.name.toLowerCase()
          )) {
            return {
              type: 'artist' as QueueSourceType,
              label: `More from ${radioSeed.name}`,
              context: radioSeed.name,
              timestamp: now,
              seedTrackId: radioSeed.id
            };
          }

          // Genre radio
          if (radioSeed.type === 'genre') {
            return {
              type: 'genre' as QueueSourceType,
              label: `${radioSeed.name} radio`,
              context: radioSeed.name,
              timestamp: now
            };
          }

          // Track radio
          if (radioSeed.type === 'track') {
            return {
              type: 'similar' as QueueSourceType,
              label: `Similar to ${radioSeed.name}`,
              context: radioSeed.name,
              timestamp: now,
              seedTrackId: radioSeed.id
            };
          }

          // Generic radio
          return {
            type: 'radio' as QueueSourceType,
            label: `${radioSeed.name} Radio`,
            context: radioSeed.name,
            timestamp: now
          };
        }

        // Check if from user's liked tracks
        if (libraryStore.isLiked(track.id)) {
          return {
            type: 'liked' as QueueSourceType,
            label: 'From your Likes',
            timestamp: now
          };
        }

        // Check artist match with current track
        if (currentTrack) {
          const matchingArtist = track.artists.find(a =>
            currentTrack.artists.some(ca =>
              ca.name.toLowerCase() === a.name.toLowerCase() || ca.id === a.id
            )
          );
          if (matchingArtist) {
            return {
              type: 'artist' as QueueSourceType,
              label: `More from ${matchingArtist.name}`,
              context: matchingArtist.name,
              timestamp: now,
              seedTrackId: currentTrack.id
            };
          }

          // Check album match
          if (currentTrack.album?.id && track.album?.id === currentTrack.album.id) {
            return {
              type: 'album' as QueueSourceType,
              label: `From ${currentTrack.album.title}`,
              context: currentTrack.album.title,
              timestamp: now,
              seedTrackId: currentTrack.id
            };
          }

          // Check genre match
          const trackGenres = track.genres?.map(g => g.toLowerCase()) || [];
          const currentGenres = currentTrack.genres?.map(g => g.toLowerCase()) || [];
          if (trackGenres.length && currentGenres.length) {
            const sharedGenre = currentTrack.genres?.find(g =>
              trackGenres.includes(g.toLowerCase())
            );
            if (sharedGenre) {
              return {
                type: 'genre' as QueueSourceType,
                label: `${sharedGenre} vibes`,
                context: sharedGenre,
                timestamp: now,
                seedTrackId: currentTrack.id
              };
            }
          }
        }

        // Default: ML recommendation
        return {
          type: 'ml' as QueueSourceType,
          label: 'Recommended for you',
          timestamp: now,
          seedTrackId: currentTrack?.id
        };
      },

      // ==========================================
      // Session Actions
      // ==========================================

      clearSession: () => {
        set({
          sessionHistory: {
            playedTrackIds: [],
            playedArtistIds: [],
            sessionStartTime: Date.now()
          },
          radioTracksPlayed: 0
        });
      },

      resetSession: () => {
        const { sessionHistory } = get();
        const timeSinceStart = Date.now() - sessionHistory.sessionStartTime;

        // Reset if session has timed out
        if (timeSinceStart > SESSION_TIMEOUT_MS) {
          get().clearSession();
        }
      },

      // ==========================================
      // Queue Source Tracking Actions
      // ==========================================

      setQueueSource: (trackId, source) => {
        set(state => ({
          queueSources: { ...state.queueSources, [trackId]: source }
        }));
      },

      getQueueSource: (trackId) => {
        return get().queueSources[trackId];
      },

      clearQueueSources: () => {
        set({ queueSources: {} });
      },

      // ==========================================
      // Configuration Actions
      // ==========================================

      updateConfig: (newConfig) => {
        set(state => ({
          config: { ...state.config, ...newConfig }
        }));
      },

      updateRadioConfig: (newConfig) => {
        set(state => ({
          radioConfig: { ...state.radioConfig, ...newConfig }
        }));
      }
    }),
    {
      name: 'audiio-smart-queue',
      partialize: (state) => ({
        // Only persist configuration
        config: state.config,
        radioConfig: state.radioConfig
        // Don't persist: mode, radioSeed, sessionHistory, etc.
      })
    }
  )
);

// ============================================
// Selectors and Hooks
// ============================================

/**
 * Get the current queue mode
 */
export function useQueueMode() {
  return useSmartQueueStore(state => state.mode);
}

/**
 * Get radio state - uses useShallow to prevent infinite re-renders
 */
export function useRadioState() {
  return useSmartQueueStore(
    useShallow(state => ({
      isRadioMode: state.mode === 'radio',
      seed: state.radioSeed,
      tracksPlayed: state.radioTracksPlayed
    }))
  );
}

/**
 * Get auto-queue status - uses useShallow to prevent infinite re-renders
 */
export function useAutoQueueStatus() {
  return useSmartQueueStore(
    useShallow(state => ({
      isEnabled: state.config.autoQueueEnabled || state.mode === 'auto-queue',
      isFetching: state.isAutoQueueFetching,
      error: state.autoQueueError
    }))
  );
}

/**
 * Get queue sources for all tracks
 */
export function useQueueSources() {
  return useSmartQueueStore(state => state.queueSources);
}

/**
 * Get source for a specific track
 */
export function useTrackSource(trackId: string | undefined) {
  return useSmartQueueStore(state =>
    trackId ? state.queueSources[trackId] : undefined
  );
}

/**
 * Get the smart queue store (for non-React contexts)
 */
export function getSmartQueueStore() {
  return useSmartQueueStore.getState();
}

// ============================================
// Queue Source Legend (for UI)
// ============================================

export const QUEUE_SOURCE_LEGEND: Record<QueueSourceType, { label: string; color: string; description: string }> = {
  manual: { label: 'Added by you', color: 'var(--text-primary)', description: 'You added this track' },
  artist: { label: 'Artist', color: '#a78bfa', description: 'Same or similar artist' },
  album: { label: 'Album', color: '#f472b6', description: 'From the same album' },
  genre: { label: 'Genre', color: '#60a5fa', description: 'Matches your genre' },
  similar: { label: 'Similar', color: '#34d399', description: 'Similar sound/style' },
  radio: { label: 'Radio', color: '#fbbf24', description: 'From your radio station' },
  mood: { label: 'Mood', color: '#fb923c', description: 'Matches current mood' },
  discovery: { label: 'Discovery', color: '#a3e635', description: 'New music to explore' },
  trending: { label: 'Trending', color: '#f43f5e', description: 'Popular right now' },
  search: { label: 'Search', color: '#8b5cf6', description: 'From your searches' },
  liked: { label: 'Liked', color: '#ec4899', description: 'From your Likes' },
  playlist: { label: 'Playlist', color: '#06b6d4', description: 'From your playlists' },
  ml: { label: 'For You', color: 'var(--accent)', description: 'ML recommended' },
  auto: { label: 'Auto', color: 'var(--text-muted)', description: 'Auto-queued' }
};
