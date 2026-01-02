/**
 * MobileHorizontalSection - Horizontal scroll section
 *
 * Features:
 * - Horizontal scrolling card list
 * - Snap-to-card behavior
 * - Momentum scrolling
 * - Track cards with artwork and play overlay
 */

import React, { useCallback } from 'react';
import { BaseMobileSection } from './BaseMobileSection';
import { SectionProps, SectionTrack } from './MobileSectionRegistry';
import { getArtworkUrl } from '../../utils/artwork';
import { triggerHaptic } from '../../utils/haptics';
import { MusicNoteIcon, PlayIcon } from '@audiio/icons';
import styles from './MobileHorizontalSection.module.css';

export function MobileHorizontalSection({
  section,
  index,
  onTrackPlay,
}: SectionProps) {
  const { title, subtitle, tracks, isPluginPowered, pluginName } = section;

  const handleTrackClick = useCallback((track: SectionTrack) => {
    triggerHaptic('light');
    onTrackPlay?.(track, tracks || []);
  }, [tracks, onTrackPlay]);

  if (!tracks || tracks.length === 0) {
    return null;
  }

  return (
    <BaseMobileSection
      title={title}
      subtitle={subtitle}
      index={index}
      isPluginPowered={isPluginPowered}
      pluginName={pluginName}
    >
      <div className={styles.scrollContainer}>
        <div className={styles.scrollContent}>
          {tracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
              onClick={() => handleTrackClick(track)}
            />
          ))}
        </div>
      </div>
    </BaseMobileSection>
  );
}

interface TrackCardProps {
  track: SectionTrack;
  onClick: () => void;
}

function TrackCard({ track, onClick }: TrackCardProps) {
  const artwork = getArtworkUrl(track.artwork || track.album?.artwork, 'medium');
  const artistName = track.artists?.[0]?.name || 'Unknown Artist';

  return (
    <button className={styles.trackCard} onClick={onClick}>
      <div className={styles.artworkContainer}>
        {artwork ? (
          <img src={artwork} alt={track.title} className={styles.artwork} />
        ) : (
          <div className={styles.artworkPlaceholder}>
            <MusicNoteIcon size={24} />
          </div>
        )}
        <div className={styles.playOverlay}>
          <div className={styles.playButton}>
            <PlayIcon size={20} />
          </div>
        </div>
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{track.title}</span>
        <span className={styles.artist}>{artistName}</span>
      </div>
    </button>
  );
}

// Export getArtworkUrl helper for use in other sections
export { getArtworkUrl };
