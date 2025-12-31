/**
 * ArtistDetailView - Apple + Spotify Hybrid Design
 * Features: Large hero section, collapsible sections, enrichment data
 * Layout: Hero -> Popular Tracks -> Discography -> Similar Artists -> Enrichment Sections
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigationStore } from '../../stores/navigation-store';
import { usePlayerStore } from '../../stores/player-store';
import { useArtistStore } from '../../stores/artist-store';
import { useLibraryStore } from '../../stores/library-store';
import { useSmartQueueStore, type RadioSeed } from '../../stores/smart-queue-store';
import { useTrackContextMenu, useAlbumContextMenu } from '../../contexts/ContextMenuContext';
import { showSuccessToast } from '../../stores/toast-store';
import { MusicNoteIcon, PlayIcon, ShuffleIcon, ChevronLeftIcon, RadioIcon } from '@audiio/icons';
import { getColorsForArtwork, getDefaultColors, type ExtractedColors } from '../../utils/color-extraction';
import { CollapsibleSection } from './CollapsibleSection';
import type { UnifiedTrack, MusicVideo, Concert, Setlist, ArtistImages, TimelineEntry } from '@audiio/core';
import type { SearchAlbum } from '../../stores/search-store';

type DiscographyTab = 'albums' | 'singles' | 'eps';

// Enrichment data state
interface EnrichmentState {
  musicVideos: MusicVideo[];
  timeline: TimelineEntry[];
  concerts: Concert[];
  setlists: Setlist[];
  gallery: ArtistImages | null;
  merchandiseUrl: string | null;
  loading: boolean;
  availableTypes: string[];
}

// Pill tab button for discography
const PillTab: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
  count?: number;
}> = ({ label, isActive, onClick, count }) => (
  <button
    className={`discography-pill-tab ${isActive ? 'active' : ''}`}
    onClick={onClick}
    role="tab"
    aria-selected={isActive}
  >
    {label}
    {count !== undefined && count > 0 && (
      <span className="pill-tab-count">{count}</span>
    )}
  </button>
);

// Album card for horizontal scroll (minimal design)
const AlbumCard: React.FC<{
  album: SearchAlbum;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}> = ({ album, onClick, onContextMenu }) => (
  <div
    className="album-card-minimal"
    onClick={onClick}
    onContextMenu={onContextMenu}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onClick()}
  >
    <div className="album-card-minimal-artwork">
      {album.artwork ? (
        <img src={album.artwork} alt={album.title} loading="lazy" />
      ) : (
        <div className="album-card-minimal-placeholder">
          <MusicNoteIcon size={32} />
        </div>
      )}
      <div className="album-card-minimal-play">
        <PlayIcon size={20} />
      </div>
    </div>
    <span className="album-card-minimal-title">{album.title}</span>
    {album.year && (
      <span className="album-card-minimal-year">{album.year}</span>
    )}
  </div>
);

// Circular artist card for Similar Artists
const SimilarArtistCard: React.FC<{
  artist: { id: string; name: string; image?: string };
  onClick?: () => void;
}> = ({ artist, onClick }) => (
  <div
    className="similar-artist-card-circular"
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
  >
    <div className="similar-artist-image-circular">
      {artist.image ? (
        <img src={artist.image} alt={artist.name} loading="lazy" />
      ) : (
        <div className="similar-artist-placeholder-circular">
          <MusicNoteIcon size={32} />
        </div>
      )}
    </div>
    <span className="similar-artist-name">{artist.name}</span>
  </div>
);

// Music Video Card
const MusicVideoCard: React.FC<{
  video: MusicVideo;
  onClick: () => void;
}> = ({ video, onClick }) => (
  <div className="music-video-card" onClick={onClick} role="button" tabIndex={0}>
    <div className="music-video-thumbnail">
      <img src={video.thumbnail} alt={video.title} loading="lazy" />
      <div className="music-video-play-overlay">
        <PlayIcon size={32} />
      </div>
      {video.duration && (
        <span className="music-video-duration">{video.duration}</span>
      )}
    </div>
    <div className="music-video-info">
      <span className="music-video-title">{video.title}</span>
      {video.viewCount && (
        <span className="music-video-views">
          {video.viewCount >= 1000000
            ? `${(video.viewCount / 1000000).toFixed(1)}M views`
            : video.viewCount >= 1000
            ? `${Math.floor(video.viewCount / 1000)}K views`
            : `${video.viewCount} views`}
        </span>
      )}
    </div>
  </div>
);

// Concert Card
const ConcertCard: React.FC<{
  concert: Concert;
}> = ({ concert }) => {
  const date = new Date(concert.datetime);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();

  return (
    <div className="concert-card">
      <div className="concert-date">
        <span className="concert-month">{month}</span>
        <span className="concert-day">{day}</span>
      </div>
      <div className="concert-info">
        <span className="concert-venue">{concert.venue.name}</span>
        <span className="concert-location">
          {concert.venue.city}, {concert.venue.country}
        </span>
      </div>
      {concert.ticketUrl && (
        <a
          href={concert.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="concert-tickets-btn"
          onClick={(e) => e.stopPropagation()}
        >
          Tickets
        </a>
      )}
    </div>
  );
};

// Setlist Card
const SetlistCard: React.FC<{
  setlist: Setlist;
}> = ({ setlist }) => {
  const songCount = setlist.songs.length;

  return (
    <div className="setlist-card">
      <div className="setlist-header">
        <span className="setlist-date">{setlist.eventDate}</span>
        <span className="setlist-venue">{setlist.venue.name}</span>
        <span className="setlist-location">
          {setlist.venue.city}, {setlist.venue.country}
        </span>
      </div>
      {setlist.tour && <span className="setlist-tour">{setlist.tour}</span>}
      <div className="setlist-songs">
        {setlist.songs.slice(0, 5).map((song, i) => (
          <span key={i} className="setlist-song">
            {song.name}
            {song.info && <em className="setlist-song-info"> ({song.info})</em>}
          </span>
        ))}
        {songCount > 5 && (
          <span className="setlist-more">+{songCount - 5} more songs</span>
        )}
      </div>
      {setlist.url && (
        <a
          href={setlist.url}
          target="_blank"
          rel="noopener noreferrer"
          className="setlist-link"
        >
          View Full Setlist
        </a>
      )}
    </div>
  );
};

// Timeline Entry Card
const TimelineCard: React.FC<{
  entry: TimelineEntry;
  onClick?: () => void;
}> = ({ entry, onClick }) => (
  <div className="timeline-card" onClick={onClick} role="button" tabIndex={0}>
    <span className="timeline-year">{entry.year}</span>
    <div className="timeline-content">
      {entry.artwork && (
        <img src={entry.artwork} alt={entry.title} className="timeline-artwork" loading="lazy" />
      )}
      <div className="timeline-info">
        <span className="timeline-title">{entry.title}</span>
        <span className="timeline-type">{entry.type}</span>
        {entry.label && <span className="timeline-label">{entry.label}</span>}
      </div>
    </div>
  </div>
);

// Gallery Image Card
const GalleryImage: React.FC<{
  url: string;
  onClick: () => void;
}> = ({ url, onClick }) => (
  <div className="gallery-image" onClick={onClick} role="button" tabIndex={0}>
    <img src={url} alt="Artist photo" loading="lazy" />
  </div>
);

export const ArtistDetailView: React.FC = () => {
  const { selectedArtistId, selectedArtistData, goBack, openAlbum, openArtist } = useNavigationStore();
  const { play, setQueue, currentTrack } = usePlayerStore();
  const { likedTracks } = useLibraryStore();
  const { startRadio } = useSmartQueueStore();
  const { fetchArtist, getArtist, loadingArtistId, error } = useArtistStore();
  const { showContextMenu: showTrackContextMenu } = useTrackContextMenu();
  const { showContextMenu: showAlbumContextMenu } = useAlbumContextMenu();

  const [colors, setColors] = useState<ExtractedColors>(getDefaultColors());
  const [activeTab, setActiveTab] = useState<DiscographyTab>('albums');
  const [enrichment, setEnrichment] = useState<EnrichmentState>({
    musicVideos: [],
    timeline: [],
    concerts: [],
    setlists: [],
    gallery: null,
    merchandiseUrl: null,
    loading: false,
    availableTypes: [],
  });
  const [galleryLightbox, setGalleryLightbox] = useState<string | null>(null);
  const discographyScrollRef = useRef<HTMLDivElement>(null);
  const similarArtistsScrollRef = useRef<HTMLDivElement>(null);

  // Get artist data
  const artistDetail = getArtist(selectedArtistId || '');
  const artist = artistDetail || selectedArtistData;
  const isLoading = loadingArtistId === selectedArtistId;

  // Extract colors from artwork
  useEffect(() => {
    if (artist?.image) {
      getColorsForArtwork(artist.image).then(setColors);
    }
  }, [artist?.image]);

  // Fetch artist data when ID changes
  useEffect(() => {
    if (selectedArtistId && selectedArtistData?.name) {
      fetchArtist(selectedArtistId, selectedArtistData.name, {
        image: selectedArtistData.image,
        followers: selectedArtistData.followers,
        source: selectedArtistData.source
      });
    }
  }, [selectedArtistId, selectedArtistData?.name]);

  // Fetch enrichment data
  useEffect(() => {
    const fetchEnrichment = async () => {
      if (!artistDetail?.name) return;

      // Check if enrichment API is available
      if (!window.api?.enrichment) return;

      setEnrichment(prev => ({ ...prev, loading: true }));

      try {
        // Check available types first
        const availableTypes = await window.api.enrichment.getAvailableTypes();

        // Fetch all enrichment data in parallel
        const [videos, timeline, concerts, setlists, gallery, merchUrl] = await Promise.allSettled([
          availableTypes.includes('videos')
            ? window.api.enrichment.getArtistVideos(artistDetail.name, 10)
            : Promise.resolve([]),
          availableTypes.includes('timeline')
            ? window.api.enrichment.getArtistTimeline(artistDetail.name)
            : Promise.resolve([]),
          availableTypes.includes('concerts')
            ? window.api.enrichment.getUpcomingConcerts(artistDetail.name)
            : Promise.resolve([]),
          availableTypes.includes('setlists')
            ? window.api.enrichment.getArtistSetlists(artistDetail.name, undefined, 5)
            : Promise.resolve([]),
          availableTypes.includes('gallery') && artistDetail.mbid
            ? window.api.enrichment.getArtistGallery(artistDetail.mbid)
            : Promise.resolve(null),
          availableTypes.includes('merchandise')
            ? window.api.enrichment.getMerchandiseUrl(artistDetail.name)
            : Promise.resolve(null),
        ]);

        setEnrichment({
          musicVideos: videos.status === 'fulfilled' ? videos.value : [],
          timeline: timeline.status === 'fulfilled' ? timeline.value : [],
          concerts: concerts.status === 'fulfilled' ? concerts.value : [],
          setlists: setlists.status === 'fulfilled' ? setlists.value : [],
          gallery: gallery.status === 'fulfilled' ? gallery.value : null,
          merchandiseUrl: merchUrl.status === 'fulfilled' ? merchUrl.value : null,
          loading: false,
          availableTypes,
        });
      } catch (err) {
        console.error('[ArtistDetailView] Enrichment fetch error:', err);
        setEnrichment(prev => ({ ...prev, loading: false }));
      }
    };

    fetchEnrichment();
  }, [artistDetail?.name, artistDetail?.mbid]);

  // Reset tab when artist changes
  useEffect(() => {
    setActiveTab('albums');
  }, [selectedArtistId]);

  if (!selectedArtistId) {
    return (
      <div className="artist-detail-view-spotify">
        <div className="artist-not-found">
          <p>Artist not found</p>
          <button onClick={goBack}>Go Back</button>
        </div>
      </div>
    );
  }

  const handlePlayAll = () => {
    if (artistDetail?.topTracks && artistDetail.topTracks.length > 0) {
      const firstTrack = artistDetail.topTracks[0];
      setQueue(artistDetail.topTracks, 0);
      if (firstTrack) play(firstTrack);
    }
  };

  const handleShufflePlay = () => {
    if (artistDetail?.topTracks && artistDetail.topTracks.length > 0) {
      const shuffled = [...artistDetail.topTracks].sort(() => Math.random() - 0.5);
      const firstTrack = shuffled[0];
      setQueue(shuffled, 0);
      if (firstTrack) play(firstTrack);
    }
  };

  const handleStartRadio = async () => {
    const artistName = artistDetail?.name || selectedArtistData?.name || 'Artist';
    const artistId = artistDetail?.id || selectedArtistId || '';
    const seed: RadioSeed = {
      type: 'artist',
      id: artistId,
      name: `${artistName} Radio`,
      artwork: artistDetail?.image,
      artistIds: [artistId],
      genres: artistDetail?.genres,
    };
    await startRadio(seed, [...likedTracks, ...(artistDetail?.topTracks || [])]);
    showSuccessToast(`Started ${artistName} Radio`);
  };

  const handleTrackClick = (track: UnifiedTrack, index: number) => {
    if (artistDetail?.topTracks) {
      setQueue(artistDetail.topTracks, index);
      play(track);
    }
  };

  const handleAlbumClick = (album: SearchAlbum) => {
    openAlbum(album.id, album);
  };

  const handleSimilarArtistClick = (similarArtist: { id: string; name: string; image?: string }) => {
    openArtist(similarArtist.id, {
      id: similarArtist.id,
      name: similarArtist.name,
      image: similarArtist.image,
      source: artistDetail?.source
    });
  };

  const handleVideoClick = (video: MusicVideo) => {
    window.open(video.url, '_blank');
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFollowers = (count?: number): string => {
    if (!count) return '';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M followers`;
    if (count >= 1000) return `${Math.floor(count / 1000)}K followers`;
    return `${count} followers`;
  };

  // Get content for current discography tab
  const getDiscographyContent = (): SearchAlbum[] => {
    switch (activeTab) {
      case 'albums':
        return artistDetail?.albums || [];
      case 'singles':
        return artistDetail?.singles || [];
      case 'eps':
        return artistDetail?.eps || [];
      default:
        return [];
    }
  };

  const discographyContent = getDiscographyContent();

  // Check if tabs have content
  const albumsCount = artistDetail?.albums?.length || 0;
  const singlesCount = artistDetail?.singles?.length || 0;
  const epsCount = artistDetail?.eps?.length || 0;
  const hasDiscography = albumsCount > 0 || singlesCount > 0 || epsCount > 0;

  // Gallery images
  const galleryImages = enrichment.gallery
    ? [
        ...(enrichment.gallery.backgrounds || []),
        ...(enrichment.gallery.thumbs || []),
      ].slice(0, 12)
    : [];

  return (
    <div
      className="artist-detail-view-spotify"
      style={{
        '--ambient-color': colors.dominant,
        '--ambient-muted': colors.muted,
        '--ambient-vibrant': colors.vibrant
      } as React.CSSProperties}
    >
      {/* ===== SPLIT MAGAZINE HEADER ===== */}
      <div className="artist-header-magazine">
        {/* Ambient Background */}
        <div className="artist-header-ambient" />

        {/* Back Button */}
        <button
          className="back-btn-round artist-back-btn-pos"
          onClick={goBack}
          aria-label="Go back"
        >
          <ChevronLeftIcon size={20} />
        </button>

        {/* Split Content */}
        <div className="artist-header-split">
          {/* Left: Artist Image */}
          <div className="artist-header-image-container">
            {artist?.image ? (
              <img
                className="artist-header-image"
                src={artist.image}
                alt={artist?.name || 'Artist'}
              />
            ) : (
              <div className="artist-header-image-placeholder">
                <MusicNoteIcon size={80} />
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div className="artist-header-info">
            {/* Verified + Artist Type */}
            <div className="artist-header-meta">
              {artistDetail?.verified && (
                <span className="artist-verified-pill">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  Verified
                </span>
              )}
              <span className="artist-type-label">Artist</span>
            </div>

            {/* Artist Name */}
            <h1 className="artist-name-magazine">{artist?.name || 'Unknown Artist'}</h1>

            {/* Genre Tags */}
            {artistDetail?.genres && artistDetail.genres.length > 0 && (
              <div className="artist-genres-magazine">
                {artistDetail.genres.slice(0, 3).map(genre => (
                  <span key={genre} className="artist-genre-tag">{genre}</span>
                ))}
              </div>
            )}

            {/* Bio Excerpt */}
            {artistDetail?.bio && (
              <p className="artist-bio-excerpt">
                {artistDetail.bio.length > 150
                  ? `${artistDetail.bio.substring(0, 150)}...`
                  : artistDetail.bio}
              </p>
            )}

            {/* Stats Row */}
            <div className="artist-stats-row">
              {artistDetail?.followers && artistDetail.followers > 0 && (
                <div className="artist-stat">
                  <span className="artist-stat-value">{formatFollowers(artistDetail.followers).replace(' followers', '')}</span>
                  <span className="artist-stat-label">Followers</span>
                </div>
              )}
              {artistDetail?.topTracks && artistDetail.topTracks.length > 0 && (
                <div className="artist-stat">
                  <span className="artist-stat-value">{artistDetail.topTracks.length}</span>
                  <span className="artist-stat-label">Top Tracks</span>
                </div>
              )}
              {albumsCount > 0 && (
                <div className="artist-stat">
                  <span className="artist-stat-value">{albumsCount}</span>
                  <span className="artist-stat-label">Albums</span>
                </div>
              )}
              {singlesCount > 0 && (
                <div className="artist-stat">
                  <span className="artist-stat-value">{singlesCount}</span>
                  <span className="artist-stat-label">Singles</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="artist-actions-magazine">
              <button
                className="artist-play-btn-magazine"
                onClick={handlePlayAll}
                disabled={!artistDetail?.topTracks?.length}
                aria-label="Play all tracks"
              >
                <PlayIcon size={18} />
                <span>Play</span>
              </button>

              <button
                className="artist-shuffle-btn-magazine"
                onClick={handleShufflePlay}
                disabled={!artistDetail?.topTracks?.length}
                aria-label="Shuffle play"
              >
                <ShuffleIcon size={16} />
                <span>Shuffle</span>
              </button>

              <button
                className="artist-radio-btn-magazine"
                onClick={handleStartRadio}
                aria-label="Start artist radio"
              >
                <RadioIcon size={16} />
                <span>Radio</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CONTENT SECTIONS ===== */}
      <div className="artist-content-spotify">
        {/* ===== LATEST RELEASE SECTION ===== */}
        {artistDetail?.latestRelease && (
          <CollapsibleSection id="latest-release" title="Latest Release" defaultExpanded={true}>
            <div
              className="latest-release-card"
              onClick={() => handleAlbumClick(artistDetail.latestRelease!)}
              onContextMenu={(e) => showAlbumContextMenu(e, artistDetail.latestRelease!)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleAlbumClick(artistDetail.latestRelease!)}
            >
              <div className="latest-release-artwork">
                {artistDetail.latestRelease.artwork ? (
                  <img src={artistDetail.latestRelease.artwork} alt={artistDetail.latestRelease.title} />
                ) : (
                  <div className="latest-release-artwork-placeholder">
                    <MusicNoteIcon size={48} />
                  </div>
                )}
                <span className="latest-release-badge">NEW</span>
                <div className="latest-release-play">
                  <PlayIcon size={28} />
                </div>
              </div>
              <div className="latest-release-info">
                <span className="latest-release-title">{artistDetail.latestRelease.title}</span>
                <span className="latest-release-meta">
                  {artistDetail.latestRelease.year}
                  {artistDetail.latestRelease.trackCount && ` • ${artistDetail.latestRelease.trackCount} songs`}
                </span>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* ===== UPCOMING CONCERTS SECTION ===== */}
        {enrichment.concerts.length > 0 && (
          <CollapsibleSection
            id="upcoming-concerts"
            title="Upcoming Shows"
            subtitle={`${enrichment.concerts.length} events`}
            defaultExpanded={true}
          >
            <div className="concerts-list">
              {enrichment.concerts.slice(0, 5).map(concert => (
                <ConcertCard key={concert.id} concert={concert} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ===== POPULAR TRACKS SECTION ===== */}
        <CollapsibleSection id="popular-tracks" title="Popular" defaultExpanded={true}>
          <div className="popular-tracks-list">
            {isLoading ? (
              <div className="popular-tracks-loading">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="track-row-skeleton skeleton" />
                ))}
              </div>
            ) : error ? (
              <p className="section-error">{error}</p>
            ) : artistDetail?.topTracks && artistDetail.topTracks.length > 0 ? (
              artistDetail.topTracks.slice(0, 5).map((track, index) => (
                <div
                  key={track.id}
                  className={`track-row-clean ${currentTrack?.id === track.id ? 'playing' : ''}`}
                  onClick={() => handleTrackClick(track, index)}
                  onContextMenu={(e) => showTrackContextMenu(e, track)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleTrackClick(track, index)}
                >
                  {/* Track Number / Play Icon */}
                  <div className="track-number-cell">
                    <span className="track-number">{index + 1}</span>
                    <span className="track-play-icon">
                      <PlayIcon size={16} />
                    </span>
                  </div>

                  {/* Artwork Thumbnail */}
                  <div className="track-artwork-cell">
                    {track.artwork?.small ? (
                      <img src={track.artwork.small} alt={track.title} />
                    ) : (
                      <div className="track-artwork-placeholder">
                        <MusicNoteIcon size={16} />
                      </div>
                    )}
                  </div>

                  {/* Title + Album */}
                  <div className="track-info-cell">
                    <span className="track-title-clean">{track.title}</span>
                    {track.album && (
                      <span className="track-album-clean">{track.album.title}</span>
                    )}
                  </div>

                  {/* Explicit Badge */}
                  {track.explicit && (
                    <span className="explicit-badge-small">E</span>
                  )}

                  {/* Duration */}
                  <span className="track-duration-cell">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              ))
            ) : (
              <p className="section-placeholder">No tracks available</p>
            )}
          </div>
        </CollapsibleSection>

        {/* ===== MUSIC VIDEOS SECTION ===== */}
        {enrichment.musicVideos.length > 0 && (
          <CollapsibleSection
            id="music-videos"
            title="Music Videos"
            subtitle={`${enrichment.musicVideos.length} videos`}
            defaultExpanded={true}
          >
            <div className="music-videos-grid">
              {enrichment.musicVideos.slice(0, 6).map(video => (
                <MusicVideoCard
                  key={video.id}
                  video={video}
                  onClick={() => handleVideoClick(video)}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ===== DISCOGRAPHY SECTION ===== */}
        {hasDiscography && (
          <CollapsibleSection id="discography" title="Discography" defaultExpanded={true}>
            {/* Pill-style Tabs */}
            <div className="discography-tabs-pills" role="tablist">
              {albumsCount > 0 && (
                <PillTab
                  label="Albums"
                  isActive={activeTab === 'albums'}
                  onClick={() => setActiveTab('albums')}
                  count={albumsCount}
                />
              )}
              {singlesCount > 0 && (
                <PillTab
                  label="Singles"
                  isActive={activeTab === 'singles'}
                  onClick={() => setActiveTab('singles')}
                  count={singlesCount}
                />
              )}
              {epsCount > 0 && (
                <PillTab
                  label="EPs"
                  isActive={activeTab === 'eps'}
                  onClick={() => setActiveTab('eps')}
                  count={epsCount}
                />
              )}
            </div>

            {/* Horizontal Scroll Album Cards */}
            <div className="discography-scroll-container" ref={discographyScrollRef}>
              {isLoading ? (
                <div className="discography-scroll-loading">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="album-card-skeleton skeleton" />
                  ))}
                </div>
              ) : discographyContent.length > 0 ? (
                <div className="discography-scroll">
                  {discographyContent.map(album => (
                    <AlbumCard
                      key={album.id}
                      album={album}
                      onClick={() => handleAlbumClick(album)}
                      onContextMenu={(e) => showAlbumContextMenu(e, album)}
                    />
                  ))}
                </div>
              ) : (
                <p className="section-placeholder">No {activeTab} found</p>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* ===== TIMELINE SECTION ===== */}
        {enrichment.timeline.length > 0 && (
          <CollapsibleSection
            id="timeline"
            title="Timeline"
            subtitle="Career history"
            defaultExpanded={false}
          >
            <div className="timeline-list">
              {enrichment.timeline.map((entry, i) => (
                <TimelineCard key={`${entry.year}-${i}`} entry={entry} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ===== APPEARS ON SECTION ===== */}
        {artistDetail?.appearsOn && artistDetail.appearsOn.length > 0 && (
          <CollapsibleSection id="appears-on" title="Appears On" defaultExpanded={true}>
            <div className="discography-scroll-container">
              <div className="discography-scroll">
                {artistDetail.appearsOn.map(album => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    onClick={() => handleAlbumClick(album)}
                    onContextMenu={(e) => showAlbumContextMenu(e, album)}
                  />
                ))}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* ===== GALLERY SECTION ===== */}
        {galleryImages.length > 0 && (
          <CollapsibleSection
            id="gallery"
            title="Gallery"
            subtitle={`${galleryImages.length} photos`}
            defaultExpanded={false}
          >
            <div className="gallery-grid">
              {galleryImages.map((img, i) => (
                <GalleryImage
                  key={i}
                  url={img.url}
                  onClick={() => setGalleryLightbox(img.url)}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ===== RECENT SETLISTS SECTION ===== */}
        {enrichment.setlists.length > 0 && (
          <CollapsibleSection
            id="setlists"
            title="Recent Setlists"
            subtitle="Past concerts"
            defaultExpanded={false}
          >
            <div className="setlists-list">
              {enrichment.setlists.map(setlist => (
                <SetlistCard key={setlist.id} setlist={setlist} />
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ===== SIMILAR ARTISTS SECTION ===== */}
        {artistDetail?.similarArtists && artistDetail.similarArtists.length > 0 && (
          <CollapsibleSection id="similar-artists" title="Fans Also Like" defaultExpanded={true}>
            <div className="similar-artists-scroll-container" ref={similarArtistsScrollRef}>
              <div className="similar-artists-scroll">
                {artistDetail.similarArtists.map(similarArtist => (
                  <SimilarArtistCard
                    key={similarArtist.id}
                    artist={similarArtist}
                    onClick={() => handleSimilarArtistClick(similarArtist)}
                  />
                ))}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* ===== ABOUT SECTION ===== */}
        {artistDetail?.bio && (
          <CollapsibleSection id="about" title="About" defaultExpanded={true}>
            <div className="artist-about-card">
              {artist?.image && (
                <div className="artist-about-image">
                  <img src={artist.image} alt={artist.name} />
                </div>
              )}
              <div className="artist-about-content">
                <p className="artist-bio-text">{artistDetail.bio}</p>

                {/* External Links */}
                {artistDetail.externalUrls && Object.keys(artistDetail.externalUrls).length > 0 && (
                  <div className="artist-external-links">
                    {artistDetail.externalUrls.spotify && (
                      <a
                        href={artistDetail.externalUrls.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="artist-external-link"
                      >
                        Spotify
                      </a>
                    )}
                    {artistDetail.externalUrls.instagram && (
                      <a
                        href={artistDetail.externalUrls.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="artist-external-link"
                      >
                        Instagram
                      </a>
                    )}
                    {artistDetail.externalUrls.twitter && (
                      <a
                        href={artistDetail.externalUrls.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="artist-external-link"
                      >
                        Twitter
                      </a>
                    )}
                    {artistDetail.externalUrls.website && (
                      <a
                        href={artistDetail.externalUrls.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="artist-external-link"
                      >
                        Website
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* ===== MERCHANDISE SECTION ===== */}
        {enrichment.merchandiseUrl && (
          <CollapsibleSection id="merchandise" title="Merchandise" defaultExpanded={true}>
            <div className="merchandise-section">
              <a
                href={enrichment.merchandiseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="merchandise-link-card"
              >
                <div className="merchandise-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                </div>
                <div className="merchandise-info">
                  <span className="merchandise-title">Official Merchandise</span>
                  <span className="merchandise-subtitle">Shop t-shirts, vinyl, and more</span>
                </div>
                <span className="merchandise-arrow">→</span>
              </a>
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Gallery Lightbox */}
      {galleryLightbox && (
        <div
          className="gallery-lightbox"
          onClick={() => setGalleryLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="gallery-lightbox-close"
            onClick={() => setGalleryLightbox(null)}
            aria-label="Close lightbox"
          >
            ×
          </button>
          <img src={galleryLightbox} alt="Gallery image" />
        </div>
      )}
    </div>
  );
};

export default ArtistDetailView;
