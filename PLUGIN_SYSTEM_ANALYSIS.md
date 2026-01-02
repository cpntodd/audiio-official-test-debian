# Plugin System Deep Analysis & Fix Plan

## Executive Summary

The Discover page is not loading data due to **Deezer API being IP-blocked at Akamai CDN level**. This is NOT a code bug - the plugins ARE loading correctly. However, this exposed several architectural issues that need addressing.

---

## Timeline: What Happened

### Before (1 hour ago)
```
[MetadataOrchestrator] No metadata provider available for charts
[SearchOrchestrator] No metadata provider available
[TrackResolver] Available stream providers: []
```
**Status:** NO plugins were loaded. The app had no data sources.

### After Our Fixes
```
Search error: Error: Deezer API error: 403
    at DeezerMetadataProvider.search (C:\Users\magic\AppData\Roaming\Electron\plugins\deezer\dist\index.js:41:19)
```
**Status:** Plugins ARE loading! But Deezer's CDN is blocking our IP entirely.

### Root Cause of 403
```html
<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD>
<BODY><H1>Access Denied</H1>
You don't have permission to access "http://api.deezer.com/chart/0/tracks?"
Reference #18.65fe3d17.1766989430.414aa087
https://errors.edgesuite.net/18.65fe3d17.1766989430.414aa087
</BODY></HTML>
```
**This is Akamai CDN blocking**, not rate limiting. Likely causes:
- Geographic restriction
- IP reputation (VPN, datacenter, etc.)
- Previous excessive requests triggered a ban

---

## Architecture Issues Discovered

### Issue 1: Two Competing Plugin Systems

#### Internal Addons (in main repo)
- **Location:** `audiio-official/addons/` (symlinked to node_modules)
- **Naming:** `@audiio/deezer-metadata`, `@audiio/sposify`, `@audiio/karaoke`, etc.
- **Status:** NOT loaded by PluginLoader (doesn't match `plugin-*` pattern)

#### External Plugins (in plugins repo)
- **Location:** `audiio-official-plugins/packages/`
- **Naming:** `@audiio/plugin-deezer`, `@audiio/plugin-sposify`, etc.
- **Status:** Must be manually installed to userData

#### The Problem
```typescript
// plugin-loader.ts line 305
if (!entry.startsWith('plugin-')) continue;
```
The loader only scans for `plugin-*` packages, completely ignoring internal addons.

### Issue 2: Dev vs Production userData Path

```typescript
// In dev mode (electron dist/main.js --dev):
app.getPath('userData') → C:\Users\magic\AppData\Roaming\Electron\

// In production:
app.getPath('userData') → C:\Users\magic\AppData\Roaming\@audiio\desktop\
```

We copied plugins to `@audiio\desktop\plugins\` but dev mode uses `Electron\plugins\`.

### Issue 3: No Request Caching/Deduplication

Each Discover section independently calls the API:
```
[Trending] Calling metadataOrchestrator.getCharts...
[Trending] Calling metadataOrchestrator.getCharts...
[Trending] Calling metadataOrchestrator.getCharts...
[Trending] Calling metadataOrchestrator.getCharts...
... (dozens of times)
```

10+ sections × component re-renders = API spam → ban

### Issue 4: Single Point of Failure

Deezer is the ONLY metadata provider. When it fails, everything fails.

### Issue 5: Plugin Installation UX

Users must:
1. Manually add repository URL
2. Browse and click Install
3. Wait for git clone + npm install + build
4. Restart app

No feedback if something fails silently.

---

## Comprehensive Fix Plan

### Phase 1: Immediate - Alternative Metadata Source

**Goal:** Get Discover working NOW without Deezer

#### Option A: Use MusicBrainz (Free, No Auth)
```typescript
// New provider: packages/ui/src/components/Discover/musicbrainz-provider.ts
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';

// Search: https://musicbrainz.org/ws/2/recording?query=artist:radiohead&fmt=json
// No rate limit issues, just 1 req/sec guideline
```

#### Option B: Use Last.fm (Free API Key)
```typescript
// Charts: http://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=XXX&format=json
// Similar artists: method=artist.getsimilar
// Very generous rate limits
```

#### Option C: Use Spotify Web API (Requires OAuth)
- Best data quality
- Requires user auth flow
- 30-second previews available

**Recommendation:** Implement Last.fm as immediate fallback, add MusicBrainz for search.

### Phase 2: Request Caching Layer

**Goal:** Prevent API spam, improve performance

```typescript
// packages/core/src/services/api-cache.ts
class APICache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();

  async fetch<T>(key: string, fetcher: () => Promise<T>, ttl: number = 60000): Promise<T> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    // Deduplicate in-flight requests
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key)!;
    }

    // Fetch and cache
    const promise = fetcher().then(data => {
      this.cache.set(key, { data, timestamp: Date.now() });
      this.inFlight.delete(key);
      return data;
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}

export const apiCache = new APICache();
```

**Usage in MetadataOrchestrator:**
```typescript
async getCharts(limit = 20) {
  return apiCache.fetch(
    `charts:${limit}`,
    () => this.provider.getCharts(limit),
    5 * 60 * 1000 // 5 min TTL
  );
}
```

### Phase 3: Unify Plugin Systems

**Goal:** One consistent plugin system that works in dev and production

#### Option A: Load Both Patterns
```typescript
// plugin-loader.ts - Update discoverNpmPlugins
for (const entry of scopeEntries) {
  // Load BOTH patterns
  if (!entry.startsWith('plugin-') && !entry.endsWith('-metadata') &&
      !entry.endsWith('-lyrics') && entry !== 'sposify' && entry !== 'karaoke') {
    continue;
  }
  // ... rest of loading logic
}
```

#### Option B: Rename Internal Addons (Breaking Change)
Rename all internal addons to `plugin-*` pattern.

#### Option C: Separate Loading Paths (Recommended)
```typescript
// In main.ts initialization
async function loadPlugins() {
  // 1. Load workspace plugins (internal addons in node_modules/@audiio/*)
  await loadWorkspacePlugins();

  // 2. Load user plugins (userData/plugins/*)
  await pluginLoader.loadAllPlugins();
}

async function loadWorkspacePlugins() {
  const workspacePlugins = [
    '@audiio/deezer-metadata',
    '@audiio/sposify',
    '@audiio/karaoke',
    '@audiio/lrclib-lyrics',
    '@audiio/applemusic-artwork',
    '@audiio/algo',
  ];

  for (const pkg of workspacePlugins) {
    try {
      const module = await import(pkg);
      const Provider = module.default || Object.values(module)[0];
      if (Provider && typeof Provider === 'function') {
        const instance = new Provider();
        await instance.initialize();
        addonRegistry.register(instance);
        console.log(`[PluginLoader] Loaded workspace plugin: ${pkg}`);
      }
    } catch (error) {
      console.warn(`[PluginLoader] Failed to load workspace plugin ${pkg}:`, error);
    }
  }
}
```

### Phase 4: Fix Dev/Production Path Issue

**Goal:** Consistent behavior in dev and production

```typescript
// packages/desktop/src/main.ts - Add near top
if (process.argv.includes('--dev')) {
  app.setName('@audiio/desktop');
  // This ensures userData is consistent
}
```

OR set explicit path:
```typescript
const isDev = process.argv.includes('--dev');
const pluginsDir = isDev
  ? path.join(app.getPath('userData'), 'plugins')
  : path.join(app.getPath('userData'), 'plugins');

// Force consistent by setting app name before ready
app.name = 'audiio-desktop';
```

### Phase 5: Multi-Provider Fallback Chain

**Goal:** Never have zero data sources

```typescript
// packages/core/src/orchestrators/metadata-orchestrator.ts
class MetadataOrchestrator {
  private providers: MetadataProvider[] = [];
  private fallbackOrder = ['deezer', 'lastfm', 'musicbrainz', 'spotify'];

  async getCharts(limit = 20) {
    for (const providerId of this.fallbackOrder) {
      const provider = this.providers.find(p => p.id === providerId && this.isProviderHealthy(p));
      if (!provider) continue;

      try {
        const result = await provider.getCharts(limit);
        if (result.tracks.length > 0) {
          return result;
        }
      } catch (error) {
        this.markProviderUnhealthy(providerId, error);
        console.warn(`[MetadataOrchestrator] ${providerId} failed, trying next...`);
      }
    }

    return { tracks: [], artists: [], albums: [] };
  }

  private healthStatus: Map<string, { healthy: boolean; retryAfter: number }> = new Map();

  private isProviderHealthy(provider: MetadataProvider): boolean {
    const status = this.healthStatus.get(provider.id);
    if (!status) return true;
    return status.healthy || Date.now() > status.retryAfter;
  }

  private markProviderUnhealthy(providerId: string, error: Error) {
    const is403 = error.message.includes('403');
    this.healthStatus.set(providerId, {
      healthy: false,
      retryAfter: Date.now() + (is403 ? 30 * 60 * 1000 : 60 * 1000) // 30min for 403, 1min otherwise
    });
  }
}
```

### Phase 6: Plugin Installation Improvements

**Goal:** Make plugin installation user-friendly and reliable

#### 6.1 Pre-built Plugin Bundles
Instead of git clone + npm install + build:
```json
// registry.json
{
  "plugins": [{
    "id": "deezer",
    "downloadUrl": "https://github.com/.../releases/download/v1.0.0/plugin-deezer-v1.0.0.zip"
  }]
}
```
Just download and extract - no build step.

#### 6.2 Installation Progress UI
```typescript
// Show real progress in UI
ipcMain.on('plugin-install-progress', (progress) => {
  mainWindow?.webContents.send('plugin-install-progress', {
    phase: progress.phase, // 'downloading' | 'extracting' | 'complete' | 'error'
    percent: progress.progress,
    message: progress.message
  });
});
```

#### 6.3 One-Click Quick Install
```typescript
// Pre-configured popular plugins
const QUICK_INSTALL_BUNDLES = {
  'essential': ['deezer', 'sposify', 'lrclib'],
  'full': ['deezer', 'sposify', 'lrclib', 'karaoke', 'algo'],
};
```

### Phase 7: Proxy Support for Blocked APIs

**Goal:** Work around IP blocks

```typescript
// Option: Route through CORS proxy for blocked APIs
const PROXY_URL = 'https://corsproxy.io/?';

async function fetchWithProxy(url: string, useProxy = false): Promise<Response> {
  const targetUrl = useProxy ? `${PROXY_URL}${encodeURIComponent(url)}` : url;
  return fetch(targetUrl);
}

// Or: Let users configure their own proxy
// Settings → Network → API Proxy URL
```

---

## Implementation Priority

### Immediate (Today)
1. **Add Last.fm as fallback metadata provider**
2. **Add API caching layer**
3. **Fix workspace plugin loading**

### Short-term (This Week)
4. **Implement provider health tracking & fallback**
5. **Fix dev/production path consistency**
6. **Add MusicBrainz provider**

### Medium-term
7. **Pre-built plugin bundles**
8. **One-click plugin installation**
9. **Proxy support**

---

## Files to Create/Modify

| Priority | File | Action |
|----------|------|--------|
| P0 | `packages/core/src/providers/lastfm-provider.ts` | Create - fallback metadata |
| P0 | `packages/core/src/services/api-cache.ts` | Create - request caching |
| P0 | `packages/desktop/src/main.ts` | Modify - load workspace plugins |
| P1 | `packages/core/src/orchestrators/metadata-orchestrator.ts` | Modify - fallback chain |
| P1 | `packages/desktop/src/services/plugin-loader.ts` | Modify - load both patterns |
| P2 | `packages/core/src/providers/musicbrainz-provider.ts` | Create - free search |
| P2 | `registry.json` | Modify - pre-built download URLs |

---

## Testing Checklist

- [ ] Discover loads with Deezer blocked (fallback works)
- [ ] API cache prevents duplicate requests
- [ ] Internal addons load in dev mode
- [ ] External plugins load from userData
- [ ] Plugin installation works from UI
- [ ] Provider health tracking marks failing providers
- [ ] Fallback chain progresses through providers
