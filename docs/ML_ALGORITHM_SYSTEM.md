# Audiio ML & Algorithm System Documentation

## Architecture Overview

The ML system is organized into **3 main layers**:

1. **`@audiio/ml-core`** - Backend ML engine
2. **`@audiio/ml-sdk`** - Type definitions and base classes
3. **UI hooks** - React integration (`useMLRanking`, `useEmbeddingPlaylist`)

---

## Data Flow

```
User Actions (listen, skip, like, dislike)
    ↓
Event Recorder → Preference Store (artist/genre affinities)
    ↓
Taste Profile Manager (user embedding vector)
    ↓
Vector Index (HNSW for fast similarity search)
    ↓
Scoring Engine (7-factor weighted ranking)
    ↓
Smart Queue → UI
```

---

## Key Components

### 1. Embedding System (128-dimensional vectors)

Tracks are converted to vectors using multiple sources:

| Source | Confidence |
|--------|------------|
| Audio features (energy, valence, danceability, BPM) | 80% |
| Genre tags | 60% |
| Mood tags | Variable |

**Vector Generation Process:**
- Maps audio features to dimensions using golden ratio spacing
- Includes second-order feature interactions (energy×valence, danceability×bpm)
- Genre embeddings expanded from base vectors to full dimensions
- Mood vectors blended with other sources
- Final vectors normalized to unit length for cosine similarity

**VectorIndex** uses **HNSW algorithm** (Hierarchical Navigable Small World):
- `efConstruction`: 200
- `efSearch`: 50
- `mMax`: 16 connections per element
- `mMax0`: 32 connections at base layer
- Supports up to 100k tracks efficiently
- Falls back to brute force for small indices (<1000 tracks)

### 2. User Taste Profile

**Interaction Weights:**

| Action | Weight | Points |
|--------|--------|--------|
| Like (strong) | 3.0x | 15 |
| Like (regular) | 3.0x | 10 |
| Download | 3.6x | - |
| Playlist add | 2.4x | - |
| Listen (completed) | 1.0x | 5 |
| Listen (partial) | 1.0x | duration/total × 3 |

**Contextual Profiles:**
- **Time-based:** Morning (6-12), Afternoon (12-18), Evening (18-22), Night (22-6)
- **Day-based:** Weekday vs Weekend
- Blended: 50% main profile + 30% time context + 20% day context

**Recency Decay:**
```
weight = baseWeight × 0.5^(daysSince / 30)
```

**Profile Requirements:**
- Minimum 5 tracks for valid profile
- Max 1,000 tracks considered
- Genre/artist distribution tracked

### 3. Scoring Algorithm (7 Weighted Factors)

| Factor | Weight | Description |
|--------|--------|-------------|
| Base Score | 40% | From ML model or affinity store |
| Exploration | 10% | Bonus for new artists/genres |
| Serendipity | 15% | Genre jumps, unexpected discoveries |
| Diversity | 15% | Penalize same artist repetition |
| Flow | 10% | Energy/BPM/key transitions |
| Temporal | 5% | Time-of-day preferences |
| Plugin | 5% | External audio features |

**Exploration Bonus (max +25):**
```
New artist: +15
New genre: +10
Epsilon-greedy: 15% chance for +12.5
Decay: 0.9^playCount (novelty wears off)
```

**Serendipity Score (max +30):**
```
Genre jump (different but liked): +15
Unexpected artist in liked genre: +20
Genre-bridging track: +10
```

**Diversity Score:**
```
Same artist penalty: -30 per occurrence (max -90)
Genre overrepresentation: -10 × (ratio - 0.4)
New genre to session: +15
```

**Flow Score:**
```
Energy transition (max jump 0.3):
  Smooth: +15 × (1 - diff/0.3)
  Jarring: -20 × (diff - 0.3)

BPM transition:
  Similar (<15% diff): +10
  Acceptable: +5
  Large jump: -10

Key compatibility (Circle of Fifths):
  Adjacent: +10
  2 steps: +8
  3 steps: +5
  Far: +2
```

**Temporal Score:**
```
Genre match to hour preference: +genre_pref × 100 × 0.25
Energy match: +(1 - |trackEnergy - preferredEnergy|) × 50 × 0.25

Weekend high energy (>0.6): +5
Weekday morning focus (0.3-0.6): +5
Weekday evening relaxation (0.4-0.7): +5
```

**Mode Adjustments:**
```
Explore mode: finalScore += explorationBonus × 0.5
Exploit mode: finalScore += baseScore × 0.2
```

### 4. Affinity Learning

**Event Processing:**

```typescript
// Listen Event
Artist affinity += (completed ? 5 : duration/track.duration * 3)
Genre affinity += (completed ? 3 : duration/track.duration * 2)
Update hourly patterns and temporal stats

// Skip Event
Artist affinity += (earlySkip ? -3 : -1)
Genre affinity += (earlySkip ? -2 : -0.5)

// Dislike Event
Artist affinity -= 10 * DISLIKE_REASON_WEIGHT[reason]
Genre affinity -= 5 * DISLIKE_REASON_WEIGHT[reason]
// Reasons: poor-quality, not-mood, repetitive, explicit, other

// Like Event
Artist affinity += (strength=2 ? 15 : 10)
Genre affinity += (strength=2 ? 8 : 5)
```

**Affinity Bounds:** -100 to +100 (normalized to -1 to 1)

**Daily Decay:** 0.98 factor prevents old preferences from dominating

### 5. Playlist Generation Methods

| Method | Blend Ratio | Description |
|--------|-------------|-------------|
| Mood-based | 40% mood + 60% taste | Match requested mood |
| Genre-based | 70% genre + 30% taste | Focus on genre |
| Seed tracks | 80% seed + 20% taste | "Song Radio" |
| Artist radio | 85% artist + 15% taste | More like artist |
| Personalized | 100% taste + context | Pure personalization |
| Discovery | High exploration (0.7) | Find new music |

**Generation Process:**
1. Generate query vector (from mood/genre/seed/taste)
2. Blend with user taste profile
3. Search vector index for candidates (3×limit)
4. Filter disliked and recently played
5. Rank with collaborative boost
6. Select with diversity (max 3 per artist)

### 6. Co-occurrence Matrix (Collaborative Filtering)

**Purpose:** "Users who liked X also liked Y" without millions of users

**Tracked Contexts:**
- Queue (user's manual queue)
- Playlist (user-created playlists)
- Session (tracks played together)
- Radio (artist radio, similar tracks)

**Configuration:**
- Max 50,000 pairs tracked
- Daily decay: 0.98
- Minimum count: 2 occurrences
- Session window: 30 minutes
- Max tracks per session: 20

**Merging with Embeddings:**
```
If seed tracks provided:
  Embedding results: 60%
  Collaborative results: 40%
  Both match bonus: +log(score) × 0.1
```

### 7. Smart Queue Management

**Configuration:**
- Replenish threshold: 2 tracks remaining
- Replenish count: 10 new tracks
- Max same artist consecutive: 2
- Session history: 200 tracks max

**Candidate Sources:**
1. Library - User's full library
2. Liked - Favorited tracks
3. Similar - Similar to current track
4. Discovery - New recommendations
5. Trending - Popular tracks
6. Radio - From radio seed

---

## Key Algorithms & Formulas

### Cosine Similarity
```
similarity = dot(a, b) / (norm(a) × norm(b))
Range: -1 to 1 (0.5 neutral, 1 identical, -1 opposite)
```

### Recency Decay
```
weight = baseWeight × 0.5^(daysSince / halfLifeDays)
```

### Energy Transition
```
If |energy1 - energy2| ≤ 0.3:
  bonus = smooth × (1 - diff/0.3)
Else:
  penalty = jarring × (diff - 0.3)
```

### Final Score Calculation
```typescript
const finalScore =
  baseScore * 0.40 +
  explorationBonus * 0.10 +
  serendipityScore * 0.15 +
  diversityScore * 0.15 +
  flowScore * 0.10 +
  temporalScore * 0.05 +
  pluginScore * 0.05;
```

---

## Configuration Constants

### Embedding
- Dimensions: 128
- Audio feature weights: energy (1.5), valence (1.5), danceability (1.2)

### Vector Index (HNSW)
- Max elements: 100,000
- efConstruction: 200
- efSearch: 50
- mMax: 16
- mMax0: 32

### Taste Profile
- Min tracks: 5
- Recency decay days: 30
- Context time slots: 4
- Max tracks: 1,000

### Co-occurrence
- Max pairs: 50,000
- Decay: 0.98
- Min count: 2
- Session window: 30 minutes

### Preferences
- Decay factor: 0.98
- Max/min affinity: 100/-100
- Max recent plays: 1,000

---

## Data Persistence

**Stored Components:**
- Event history (localStorage/nodeStorage)
- Preference store (artist/genre affinities)
- Embeddings (track vectors)
- Vector index (HNSW structure)
- Taste profiles (user vectors)
- Queue configuration

**Storage Adapters:**
- BrowserStorage (localStorage)
- NodeStorage (file system for desktop)
- MemoryStorage (volatile, testing)

---

## React Integration

### useMLRanking Hook

```typescript
const {
  rankTracks,      // Async full scoring
  rankTracksSync,  // Fast sync scoring
  getTrackScore,   // Single track score
  isMLReady,       // Model loaded
  isTraining       // Training in progress
} = useMLRanking();
```

**Ranking Options:**
```typescript
{
  enabled?: boolean;
  explorationMode?: 'exploit' | 'explore' | 'balanced';
  minScore?: number;
  limit?: number;
  shuffle?: boolean;
  shuffleIntensity?: number; // 0-1
}
```

### useEmbeddingPlaylist Hook

```typescript
const {
  generateMoodPlaylist,
  generateGenrePlaylist,
  generatePersonalizedPlaylist,
  generateDiscoveryPlaylist,
  generateArtistRadio,
  generateSeedPlaylist,
  getTracksFromPlaylist,
  isReady,
  tracksIndexed
} = useEmbeddingPlaylist();
```

---

## Summary

This is a sophisticated **multi-level recommendation system** combining:

1. **Vector embeddings** for semantic similarity (HNSW index)
2. **User taste profiling** with contextual variations
3. **Collaborative filtering** via co-occurrence patterns
4. **Advanced scoring** with 7 weighted factors
5. **Temporal awareness** (time of day, day of week)
6. **Exploration/exploitation balance** (epsilon-greedy)
7. **Session flow awareness** (energy transitions, key compatibility)
8. **Plugin extensibility** (audio features from providers)
9. **Smart queue management** with automatic replenishment
10. **Automatic learning** from user events

The system learns from every interaction (listen, skip, like, dislike) and continuously refines recommendations through embeddings, affinities, and temporal patterns while maintaining diversity and serendipity.
