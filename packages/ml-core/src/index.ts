/**
 * @audiio/ml-core
 *
 * Core ML engine and orchestrator for Audiio.
 *
 * This package provides:
 * - Core Algorithm (HybridScorer, NeuralScorer, Trainer, RadioGenerator)
 * - Core Providers (Essentia, Emotion, Embedding, Lyrics, Fingerprint)
 * - ML Engine for orchestrating algorithm plugins
 * - Algorithm Registry for managing plugins
 * - Feature Aggregator for combining data from providers (with override/supplement modes)
 * - Smart Queue for intelligent playback
 * - Event recording and preference learning
 * - Training scheduler for automatic model updates
 *
 * @example
 * ```typescript
 * import { getMLEngine } from '@audiio/ml-core';
 *
 * const engine = getMLEngine();
 *
 * // Initialize (uses built-in core algorithm)
 * await engine.initialize();
 *
 * // Score tracks
 * const score = await engine.scoreTrack(track, context);
 *
 * // Get next tracks for queue
 * const nextTracks = await engine.getNextTracks(10, context);
 *
 * // Register a plugin provider (override or supplement mode)
 * engine.registerFeatureProvider(myProvider, 'supplement');
 *
 * // Record user events
 * await engine.recordEvent({
 *   type: 'listen',
 *   track,
 *   duration: 180,
 *   completed: true,
 *   // ...
 * });
 * ```
 */

// Engine
export { MLEngine, getMLEngine, resetMLEngine } from './engine';
export type { MLEngineConfig } from './engine';

export { AlgorithmRegistry } from './engine/algorithm-registry';
export { FeatureAggregator } from './engine/feature-aggregator';
export type { ExtendedFeatureProvider, ExtendedAggregationConfig } from './engine/feature-aggregator';

// Core Algorithm
export { HybridScorer } from './algorithm/hybrid-scorer';
export { NeuralScorer } from './algorithm/neural-scorer';
export { Trainer } from './algorithm/trainer';
export { RadioGenerator } from './algorithm/radio-generator';

// Core Providers (browser-safe only)
// Note: EssentiaProvider and FingerprintProvider require Node.js - import from '@audiio/ml-core/node'
export { EmotionProvider } from './providers/emotion-provider';
export { EmbeddingProvider } from './providers/embedding-provider';
export { LyricsProvider } from './providers/lyrics-provider';

// Features
export {
  extractTrackFeatures,
  extractContextFeatures,
  extractAllFeatures,
  extractBatchFeatures,
  initializeScalers,
  getDefaultScalers,
  getDefaultUserInteraction,
  encodeGenres,
  normalizeValue,
  calculateTrackMood,
  PRIMARY_GENRES,
  TRACK_FEATURE_DIM,
  CONTEXT_FEATURE_DIM,
  TOTAL_FEATURE_DIM,
  GENRE_ENERGY_MAP,
} from './features/feature-extractor';
export type {
  FeatureScalers,
  TrackFeatures,
  ExtractedFeatures,
  UserInteractionData,
  PrimaryGenre,
} from './features/feature-extractor';

// Learning
export { EventRecorder } from './learning/event-recorder';
export { PreferenceStore } from './learning/preference-store';
export { TrainingScheduler } from './learning/training-scheduler';

// Storage (browser-safe only - for NodeStorage use '@audiio/ml-core/node')
export {
  BrowserStorage,
  MemoryStorage,
  createStorage,
  type StorageAdapter,
} from './storage/browser-storage';

// Queue
export { SmartQueue } from './queue/smart-queue';

// Endpoints
export { createEndpoints } from './endpoints';

// Mood
export { MoodMatcher, getMoodMatcher } from './mood/mood-matcher';
export type { AudioFeatures, TrackWithFeatures } from './mood/mood-matcher';

// Embeddings - Vector-based recommendation engine
export {
  // Core components
  EmbeddingEngine,
  getEmbeddingEngine,
  resetEmbeddingEngine,
  VectorIndex,
  getVectorIndex,
  resetVectorIndex,
  TasteProfileManager,
  CoOccurrenceMatrix,
  getCoOccurrenceMatrix,
  resetCoOccurrenceMatrix,
  PlaylistGenerator,
  // Types
  type TrackData,
  type TrackEmbedding,
  type UserTasteProfile,
  type SimilarityResult,
  type EmbeddingConfig,
  type VectorIndexConfig,
  type TasteProfileConfig,
  type TrackInteraction,
  type CoOccurrenceConfig,
  type ContextType,
  type PlaylistOptions,
  type GeneratedPlaylist,
  type PlaylistTrack,
  type PlaylistMethod,
  // Constants
  DEFAULT_EMBEDDING_CONFIG,
  DEFAULT_INDEX_CONFIG,
  DEFAULT_TASTE_CONFIG,
  DEFAULT_COOCCURRENCE_CONFIG,
  GENRE_VECTORS,
  MOOD_VECTORS,
} from './embeddings';

// Re-export SDK types for convenience
export type {
  AlgorithmPlugin,
  AlgorithmManifest,
  Track,
  ScoredTrack,
  TrackScore,
  ScoringContext,
  UserEvent,
  MLCoreEndpoints,
  FeatureProvider,
} from '@audiio/ml-sdk';
