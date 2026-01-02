/**
 * Local Metadata Service
 *
 * Handles reading/writing ID3 tags from local audio files,
 * matching tracks with online providers to fill missing metadata,
 * and downloading/embedding artwork.
 */

import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

// Dynamic imports for ESM modules
// We use Function() constructor to create a real ESM import that TypeScript won't transform
let musicMetadataParseFile: ((filePath: string) => Promise<any>) | null = null;
let NodeID3: any = null;

// This creates a proper ESM import that bypasses TypeScript's CJS transformation
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

async function loadMusicMetadata(): Promise<(filePath: string) => Promise<any>> {
  if (musicMetadataParseFile) {
    return musicMetadataParseFile;
  }

  try {
    // Use the dynamic import function that bypasses TypeScript
    const mm = await dynamicImport('music-metadata');

    // music-metadata exports parseFile directly in v10+
    if (typeof mm.parseFile === 'function') {
      musicMetadataParseFile = mm.parseFile;
      console.log('[LocalMetadata] Loaded music-metadata parseFile successfully');
      return mm.parseFile;
    }

    // Check if it's wrapped in default
    if (mm.default && typeof mm.default.parseFile === 'function') {
      musicMetadataParseFile = mm.default.parseFile;
      console.log('[LocalMetadata] Loaded music-metadata parseFile from default export');
      return mm.default.parseFile;
    }

    // Log what we got for debugging
    console.error('[LocalMetadata] music-metadata module structure:', {
      keys: Object.keys(mm),
      hasDefault: !!mm.default,
      defaultKeys: mm.default ? Object.keys(mm.default) : []
    });
    throw new Error('Could not find parseFile function in music-metadata module');
  } catch (e) {
    console.error('[LocalMetadata] Failed to import music-metadata:', e);
    throw e;
  }
}

async function loadNodeID3(): Promise<any> {
  if (!NodeID3) {
    try {
      // Try normal import first (node-id3 supports CJS)
      const id3Module = await import('node-id3');
      NodeID3 = id3Module.default || id3Module;
    } catch {
      // Fallback to dynamic import
      const id3Module = await dynamicImport('node-id3');
      NodeID3 = id3Module.default || id3Module;
    }
  }
  return NodeID3;
}

// Types
export interface LocalTrackMetadata {
  title?: string;
  artists?: string[];
  album?: string;
  albumArtist?: string;
  genre?: string[];
  year?: number;
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  duration?: number; // seconds
  bitrate?: number;
  sampleRate?: number;
  artwork?: {
    data: Buffer;
    mimeType: string;
  };
  isrc?: string;
}

export interface MatchResult {
  matched: boolean;
  confidence: number;
  source?: string;
  metadata?: {
    title: string;
    artists: string[];
    album?: string;
    albumArtist?: string;
    genre?: string[];
    year?: number;
    artwork?: {
      small?: string;
      medium?: string;
      large?: string;
    };
    isrc?: string;
    duration?: number;
  };
}

export interface EnrichmentResult {
  filePath: string;
  status: 'enriched' | 'skipped' | 'failed';
  fieldsUpdated: string[];
  artworkSaved: boolean;
  error?: string;
}

/**
 * Read metadata from an audio file using music-metadata
 */
export async function readFileMetadata(filePath: string): Promise<LocalTrackMetadata> {
  const parseFile = await loadMusicMetadata();

  try {
    const metadata = await parseFile(filePath);
    const common = metadata.common;
    const format = metadata.format;

    // Extract artwork if present
    let artwork: LocalTrackMetadata['artwork'] = undefined;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      if (pic) {
        artwork = {
          data: Buffer.from(pic.data),
          mimeType: pic.format || 'image/jpeg'
        };
      }
    }

    return {
      title: common.title,
      artists: common.artists || (common.artist ? [common.artist] : undefined),
      album: common.album,
      albumArtist: common.albumartist,
      genre: common.genre,
      year: common.year,
      trackNumber: common.track?.no || undefined,
      totalTracks: common.track?.of || undefined,
      discNumber: common.disk?.no || undefined,
      duration: format.duration,
      bitrate: format.bitrate,
      sampleRate: format.sampleRate,
      artwork,
      isrc: common.isrc?.[0]
    };
  } catch (error) {
    console.error(`[LocalMetadata] Error reading metadata from ${filePath}:`, error);
    return {};
  }
}

/**
 * Write metadata to an audio file using node-id3
 * Only works with MP3 files
 */
export async function writeFileMetadata(
  filePath: string,
  metadata: Partial<LocalTrackMetadata>,
  artworkUrl?: string
): Promise<boolean> {
  const nodeId3 = await loadNodeID3();

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.mp3') {
    console.log(`[LocalMetadata] Skipping non-MP3 file for writing: ${filePath}`);
    return false;
  }

  try {
    // Build ID3 tags object
    const tags: Record<string, unknown> = {};

    if (metadata.title) {
      tags.title = metadata.title;
    }
    if (metadata.artists && metadata.artists.length > 0) {
      tags.artist = metadata.artists.join(', ');
    }
    if (metadata.album) {
      tags.album = metadata.album;
    }
    if (metadata.albumArtist) {
      tags.performerInfo = metadata.albumArtist;
    }
    if (metadata.genre && metadata.genre.length > 0) {
      tags.genre = metadata.genre[0];
    }
    if (metadata.year) {
      tags.year = metadata.year.toString();
    }
    if (metadata.trackNumber) {
      tags.trackNumber = metadata.trackNumber.toString();
    }
    if (metadata.isrc) {
      tags.ISRC = metadata.isrc;
    }

    // Handle artwork - either from buffer or URL
    if (metadata.artwork) {
      tags.image = {
        mime: metadata.artwork.mimeType,
        type: { id: 3, name: 'Front Cover' },
        description: 'Cover',
        imageBuffer: metadata.artwork.data
      };
    } else if (artworkUrl) {
      // Download artwork and embed it
      const artworkBuffer = await downloadImage(artworkUrl);
      if (artworkBuffer) {
        const mimeType = artworkUrl.includes('.png') ? 'image/png' : 'image/jpeg';
        tags.image = {
          mime: mimeType,
          type: { id: 3, name: 'Front Cover' },
          description: 'Cover',
          imageBuffer: artworkBuffer
        };
      }
    }

    // Only write if we have something to write
    if (Object.keys(tags).length === 0) {
      console.log(`[LocalMetadata] No metadata to write for ${filePath}`);
      return false;
    }

    // Write tags to file
    const success = nodeId3.write(tags as any, filePath);
    if (success) {
      console.log(`[LocalMetadata] Successfully wrote metadata to ${filePath}`);
      return true;
    } else {
      console.error(`[LocalMetadata] Failed to write metadata to ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`[LocalMetadata] Error writing metadata to ${filePath}:`, error);
    return false;
  }
}

/**
 * Download an image from URL and return as Buffer
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, { timeout: 10000 }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl).then(resolve);
          return;
        }
      }

      if (response.statusCode !== 200) {
        console.error(`[LocalMetadata] Failed to download image: ${response.statusCode}`);
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(null));
    });

    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}

/**
 * Check if a track has missing metadata that should be enriched
 */
export function needsEnrichment(metadata: LocalTrackMetadata): { needs: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!metadata.title || metadata.title === 'Unknown') {
    missing.push('title');
  }
  if (!metadata.artists || metadata.artists.length === 0 || metadata.artists[0] === 'Unknown Artist') {
    missing.push('artists');
  }
  if (!metadata.album) {
    missing.push('album');
  }
  if (!metadata.artwork) {
    missing.push('artwork');
  }
  if (!metadata.genre || metadata.genre.length === 0) {
    missing.push('genre');
  }
  if (!metadata.year) {
    missing.push('year');
  }

  return {
    needs: missing.length > 0,
    missing
  };
}

/**
 * Parse basic metadata from filename when file metadata is missing
 * Supports formats:
 * - "Artist - Title.mp3"
 * - "01 - Title.mp3" (track number prefix)
 * - "01. Artist - Title.mp3"
 * - "Artist - Album - Title.mp3"
 */
export function parseFilename(filePath: string): Partial<LocalTrackMetadata> {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const parentDir = path.basename(path.dirname(filePath));

  let title = basename;
  let artist: string | undefined;
  let trackNumber: number | undefined;

  // Remove track number prefix like "01 - " or "01. "
  const trackNumMatch = basename.match(/^(\d{1,3})[\s.\-_]+(.+)/);
  if (trackNumMatch && trackNumMatch[1] && trackNumMatch[2]) {
    trackNumber = parseInt(trackNumMatch[1], 10);
    title = trackNumMatch[2];
  }

  // Try to parse "Artist - Title" format
  const dashIndex = title.indexOf(' - ');
  if (dashIndex > 0) {
    artist = title.substring(0, dashIndex).trim();
    title = title.substring(dashIndex + 3).trim();
  }

  // Clean up common patterns
  title = title
    .replace(/\s*\(Official\s*(Video|Audio|Music Video)\)/gi, '')
    .replace(/\s*\[Official\s*(Video|Audio|Music Video)\]/gi, '')
    .replace(/\s*\(Lyrics?\)/gi, '')
    .replace(/\s*\[Lyrics?\]/gi, '')
    .replace(/\s*\(HD\)/gi, '')
    .replace(/\s*\(HQ\)/gi, '')
    .trim();

  return {
    title: title || undefined,
    artists: artist ? [artist] : undefined,
    album: parentDir !== '.' ? parentDir : undefined,
    trackNumber
  };
}

/**
 * Create a track object from file path with all available metadata
 */
export async function createTrackFromFile(filePath: string): Promise<{
  id: string;
  title: string;
  artists: Array<{ id: string; name: string }>;
  album: { id: string; title: string; artwork?: { small?: string; medium?: string; large?: string } };
  duration: number;
  genre?: string;
  artwork?: { small?: string; medium?: string; large?: string };
  streamInfo: {
    url: string;
    format: string;
    quality: string;
    expiresAt: null;
  };
  streamSources: Array<{
    providerId: string;
    trackId: string;
    available: boolean;
  }>;
  _meta: {
    metadataProvider: string;
    lastUpdated: Date;
    hasEmbeddedArt: boolean;
    needsEnrichment: boolean;
    missingFields: string[];
  };
  _localPath: string;
}> {
  // Read actual metadata from file
  const fileMetadata = await readFileMetadata(filePath);
  const filenameMetadata = parseFilename(filePath);

  // Merge: prefer file metadata, fall back to filename parsing
  const title = fileMetadata.title || filenameMetadata.title || path.basename(filePath, path.extname(filePath));
  const artists = fileMetadata.artists || filenameMetadata.artists || ['Unknown Artist'];
  const album = fileMetadata.album || filenameMetadata.album || path.basename(path.dirname(filePath));
  const duration = fileMetadata.duration || 0;
  const genre = fileMetadata.genre?.[0];

  const ext = path.extname(filePath).slice(1);
  const trackId = `local:${Buffer.from(filePath).toString('base64')}`;

  // Check what's missing
  const enrichmentCheck = needsEnrichment({
    ...fileMetadata,
    title,
    artists,
    album
  });

  // Handle artwork - if embedded, create a data URL reference
  let artwork: { small?: string; medium?: string; large?: string } | undefined;
  if (fileMetadata.artwork) {
    // We'll use a special URL scheme that the app can handle
    const artworkDataUrl = `embedded-art://${trackId}`;
    artwork = {
      small: artworkDataUrl,
      medium: artworkDataUrl,
      large: artworkDataUrl
    };
  }

  return {
    id: trackId,
    title,
    artists: artists.map(name => ({
      id: `local-artist:${Buffer.from(name).toString('base64')}`,
      name
    })),
    album: {
      id: `local-album:${Buffer.from(album).toString('base64')}`,
      title: album,
      artwork
    },
    duration: Math.round(duration),
    genre,
    artwork,
    streamInfo: {
      url: `local-audio://localhost${filePath}`,
      format: ext,
      quality: 'lossless',
      expiresAt: null
    },
    streamSources: [{
      providerId: 'local-file',
      trackId: filePath,
      available: true
    }],
    _meta: {
      metadataProvider: 'local-file',
      lastUpdated: new Date(),
      hasEmbeddedArt: !!fileMetadata.artwork,
      needsEnrichment: enrichmentCheck.needs,
      missingFields: enrichmentCheck.missing
    },
    _localPath: filePath
  };
}

/**
 * Batch enrich tracks by matching with online providers
 * This is called from the main process with access to the Spotify matcher
 */
export async function enrichTracks(
  tracks: Array<{
    id: string;
    title: string;
    artists: string[];
    album?: string;
    duration?: number;
    filePath: string;
  }>,
  matchFn: (tracks: Array<{ id: string; title: string; artist: string; album?: string; duration?: number }>) => Promise<Array<MatchResult>>,
  progressCallback?: (current: number, total: number, status: string) => void
): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = [];
  const tracksToMatch: Array<{ id: string; title: string; artist: string; album?: string; duration?: number; filePath: string }> = [];

  // Prepare tracks for matching
  for (const track of tracks) {
    tracksToMatch.push({
      id: track.id,
      title: track.title,
      artist: track.artists.join(', '),
      album: track.album,
      duration: track.duration,
      filePath: track.filePath
    });
  }

  if (tracksToMatch.length === 0) {
    return results;
  }

  progressCallback?.(0, tracksToMatch.length, 'Matching tracks...');

  // Match tracks in batches
  const batchSize = 20;
  const allMatches: Array<{ track: typeof tracksToMatch[0]; match: MatchResult }> = [];

  for (let i = 0; i < tracksToMatch.length; i += batchSize) {
    const batch = tracksToMatch.slice(i, i + batchSize);

    try {
      const matches = await matchFn(batch.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration
      })));

      batch.forEach((track, idx) => {
        allMatches.push({ track, match: matches[idx] || { matched: false, confidence: 0 } });
      });
    } catch (error) {
      console.error('[LocalMetadata] Batch match error:', error);
      // Add failed results for this batch
      batch.forEach(track => {
        allMatches.push({ track, match: { matched: false, confidence: 0 } });
      });
    }

    progressCallback?.(Math.min(i + batchSize, tracksToMatch.length), tracksToMatch.length, 'Matching tracks...');
  }

  // Process matches and update files
  progressCallback?.(0, allMatches.length, 'Updating files...');

  for (let i = 0; i < allMatches.length; i++) {
    const matchEntry = allMatches[i];
    if (!matchEntry) continue;
    const { track, match } = matchEntry;

    if (!match.matched || !match.metadata) {
      results.push({
        filePath: track.filePath,
        status: 'skipped',
        fieldsUpdated: [],
        artworkSaved: false
      });
      continue;
    }

    try {
      // Read current metadata
      const currentMetadata = await readFileMetadata(track.filePath);
      const fieldsToUpdate: Partial<LocalTrackMetadata> = {};
      const fieldsUpdated: string[] = [];

      // Only update missing fields
      if (!currentMetadata.title && match.metadata.title) {
        fieldsToUpdate.title = match.metadata.title;
        fieldsUpdated.push('title');
      }
      if ((!currentMetadata.artists || currentMetadata.artists.length === 0) && match.metadata.artists) {
        fieldsToUpdate.artists = match.metadata.artists;
        fieldsUpdated.push('artists');
      }
      if (!currentMetadata.album && match.metadata.album) {
        fieldsToUpdate.album = match.metadata.album;
        fieldsUpdated.push('album');
      }
      if (!currentMetadata.genre && match.metadata.genre) {
        fieldsToUpdate.genre = match.metadata.genre;
        fieldsUpdated.push('genre');
      }
      if (!currentMetadata.year && match.metadata.year) {
        fieldsToUpdate.year = match.metadata.year;
        fieldsUpdated.push('year');
      }
      if (!currentMetadata.isrc && match.metadata.isrc) {
        fieldsToUpdate.isrc = match.metadata.isrc;
        fieldsUpdated.push('isrc');
      }

      // Handle artwork
      let artworkSaved = false;
      const artworkUrl = match.metadata.artwork?.large || match.metadata.artwork?.medium;
      if (!currentMetadata.artwork && artworkUrl) {
        fieldsUpdated.push('artwork');
        artworkSaved = true;
      }

      if (fieldsUpdated.length > 0) {
        const success = await writeFileMetadata(track.filePath, fieldsToUpdate, artworkUrl);
        results.push({
          filePath: track.filePath,
          status: success ? 'enriched' : 'failed',
          fieldsUpdated,
          artworkSaved,
          error: success ? undefined : 'Failed to write metadata'
        });
      } else {
        results.push({
          filePath: track.filePath,
          status: 'skipped',
          fieldsUpdated: [],
          artworkSaved: false
        });
      }
    } catch (error) {
      results.push({
        filePath: track.filePath,
        status: 'failed',
        fieldsUpdated: [],
        artworkSaved: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    progressCallback?.(i + 1, allMatches.length, 'Updating files...');
  }

  return results;
}

/**
 * Get embedded artwork from a local file as a data URL
 */
export async function getEmbeddedArtwork(filePath: string): Promise<string | null> {
  try {
    const metadata = await readFileMetadata(filePath);
    if (metadata.artwork) {
      const base64 = metadata.artwork.data.toString('base64');
      return `data:${metadata.artwork.mimeType};base64,${base64}`;
    }
    return null;
  } catch {
    return null;
  }
}
