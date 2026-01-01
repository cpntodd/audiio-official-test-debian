/**
 * StatsView - Listening statistics dashboard with ML insights
 */

import React, { useState, useMemo } from 'react';
import { useStatsStore, formatDuration } from '../../stores/stats-store';
import { useRecommendationStore } from '../../stores/recommendation-store';
import { useMLStore } from '../../stores/ml-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { StatCard } from './StatCard';
import { TopArtistsList, TopGenresList } from './TopList';
import { BarChart } from './charts/BarChart';
import { HourlyHeatMap, DayOfWeekHeatMap } from './charts/HeatMap';
import {
  ChevronLeftIcon,
  PlayIcon,
  ArtistIcon,
  AlbumIcon,
  ZapIcon,
  HeartIcon,
  ThumbDownIcon,
  SkipForwardIcon,
  MusicNoteIcon,
  SettingsIcon,
} from '@audiio/icons';

type Period = 'week' | 'month' | 'year' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
  all: 'All Time',
};

export const StatsView: React.FC = () => {
  const [period, setPeriod] = useState<Period>('week');
  const { getStats, listenHistory } = useStatsStore();
  const { navigateTo } = useNavigationStore();

  // ML Store data
  const {
    isModelLoaded,
    isTraining,
    modelVersion,
    lastTrainedAt,
    trainingMetrics,
    trainingProgress,
  } = useMLStore();

  // Recommendation Store data
  const { userProfile, dislikedTracks } = useRecommendationStore();

  const stats = useMemo(() => getStats(period), [period, getStats]);

  const handleArtistClick = (artistId: string) => {
    navigateTo('artist-detail', { artistId });
  };

  // Prepare daily chart data
  const dailyChartData = useMemo(() => {
    return stats.dailyStats.slice(-7).map(d => ({
      label: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
      value: d.playCount,
    }));
  }, [stats.dailyStats]);

  // Calculate listening behavior stats
  const behaviorStats = useMemo(() => {
    const total = listenHistory.length;
    if (total === 0) return { skipRate: 0, completionRate: 0, avgSessionMinutes: 0 };

    const skipped = listenHistory.filter(e => !e.completed).length;
    const completed = listenHistory.filter(e => e.completed).length;

    // Calculate average session time from user profile
    const avgSessionMinutes = Math.round(userProfile.avgSessionLength / 60000) || 0;

    return {
      skipRate: Math.round((skipped / total) * 100),
      completionRate: Math.round((completed / total) * 100),
      avgSessionMinutes,
    };
  }, [listenHistory, userProfile.avgSessionLength]);

  // Get top artist/genre affinities
  const affinities = useMemo(() => {
    const artistPrefs = Object.values(userProfile.artistPreferences)
      .filter(a => a.playCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const genrePrefs = Object.values(userProfile.genrePreferences)
      .filter(g => g.playCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return { artists: artistPrefs, genres: genrePrefs };
  }, [userProfile]);

  // Calculate energy distribution from listening patterns
  const energyDistribution = useMemo(() => {
    const distribution = { low: 0, medium: 0, high: 0 };
    userProfile.timePatterns.forEach(tp => {
      distribution[tp.energy]++;
    });
    const total = 24;
    return {
      low: Math.round((distribution.low / total) * 100),
      medium: Math.round((distribution.medium / total) * 100),
      high: Math.round((distribution.high / total) * 100),
    };
  }, [userProfile.timePatterns]);

  // Format last trained date
  const lastTrainedText = useMemo(() => {
    if (!lastTrainedAt) return 'Never';
    const diff = Date.now() - lastTrainedAt;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  }, [lastTrainedAt]);

  return (
    <div className="stats-view">
      <header className="stats-header">
        <button className="stats-back-btn" onClick={() => navigateTo('home')}>
          <ChevronLeftIcon size={20} />
        </button>
        <div className="stats-header-content">
          <h1 className="stats-title">Your Listening Stats</h1>
          <p className="stats-subtitle">Insights into your music habits</p>
        </div>
        <div className="stats-period-selector">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              className={`period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </header>

      <div className="stats-content">
        {/* Summary Cards */}
        <section className="stats-section stats-summary">
          <StatCard
            icon={<PlayIcon size={22} />}
            label="Listen Time"
            value={formatDuration(stats.totalListenTime)}
            subtitle={`${stats.totalTracks} total plays`}
            variant="accent"
          />
          <StatCard
            icon={<MusicNoteIcon size={22} />}
            label="Unique Tracks"
            value={stats.uniqueTracks}
          />
          <StatCard
            icon={<ArtistIcon size={22} />}
            label="Artists"
            value={stats.uniqueArtists}
          />
          <StatCard
            icon={<ZapIcon size={22} />}
            label="Current Streak"
            value={`${stats.currentStreak} days`}
            subtitle={stats.longestStreak > stats.currentStreak
              ? `Best: ${stats.longestStreak} days`
              : 'Your best streak!'
            }
            variant={stats.currentStreak >= 7 ? 'success' : 'default'}
          />
        </section>

        {/* Listening Behavior */}
        <section className="stats-section">
          <h2 className="stats-section-title">Listening Behavior</h2>
          <div className="stats-behavior-grid">
            <StatCard
              icon={<HeartIcon size={20} />}
              label="Completion Rate"
              value={`${behaviorStats.completionRate}%`}
              subtitle="Songs finished"
              variant={behaviorStats.completionRate >= 70 ? 'success' : 'default'}
            />
            <StatCard
              icon={<SkipForwardIcon size={20} />}
              label="Skip Rate"
              value={`${behaviorStats.skipRate}%`}
              subtitle="Songs skipped"
              variant={behaviorStats.skipRate <= 30 ? 'success' : 'warning'}
            />
            <StatCard
              icon={<ThumbDownIcon size={20} />}
              label="Disliked"
              value={Object.keys(dislikedTracks).length}
              subtitle="Tracks filtered"
            />
            <StatCard
              icon={<AlbumIcon size={20} />}
              label="Profile Events"
              value={userProfile.totalListens}
              subtitle="Total interactions"
            />
          </div>
        </section>

        {/* ML Model Status */}
        <section className="stats-section stats-ml-section">
          <h2 className="stats-section-title">
            <SettingsIcon size={18} />
            <span>ML Model Status</span>
          </h2>
          <div className="stats-ml-grid">
            <div className="stats-ml-card">
              <div className="stats-ml-status">
                <span className={`stats-ml-indicator ${isModelLoaded ? 'active' : 'inactive'}`} />
                <span className="stats-ml-label">
                  {isTraining ? 'Training...' : isModelLoaded ? 'Model Active' : 'Not Trained'}
                </span>
              </div>
              {isTraining && trainingProgress && (
                <div className="stats-ml-progress">
                  <div
                    className="stats-ml-progress-bar"
                    style={{ width: `${(trainingProgress.epoch / trainingProgress.totalEpochs) * 100}%` }}
                  />
                  <span className="stats-ml-progress-text">
                    Epoch {trainingProgress.epoch}/{trainingProgress.totalEpochs}
                  </span>
                </div>
              )}
            </div>
            <div className="stats-ml-metrics">
              <div className="stats-ml-metric">
                <span className="stats-ml-metric-value">{modelVersion}</span>
                <span className="stats-ml-metric-label">Model Version</span>
              </div>
              <div className="stats-ml-metric">
                <span className="stats-ml-metric-value">{lastTrainedText}</span>
                <span className="stats-ml-metric-label">Last Trained</span>
              </div>
              {trainingMetrics && (
                <>
                  <div className="stats-ml-metric">
                    <span className="stats-ml-metric-value">
                      {(trainingMetrics.accuracy * 100).toFixed(1)}%
                    </span>
                    <span className="stats-ml-metric-label">Accuracy</span>
                  </div>
                  <div className="stats-ml-metric">
                    <span className="stats-ml-metric-value">
                      {trainingMetrics.loss.toFixed(3)}
                    </span>
                    <span className="stats-ml-metric-label">Loss</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Taste Profile - Artist Affinities */}
        {affinities.artists.length > 0 && (
          <section className="stats-section">
            <h2 className="stats-section-title">Your Taste Profile</h2>
            <div className="stats-affinities">
              <div className="stats-affinity-group">
                <h3 className="stats-affinity-label">Top Artist Affinities</h3>
                <div className="stats-affinity-list">
                  {affinities.artists.map((artist, i) => (
                    <div
                      key={artist.artistId}
                      className="stats-affinity-item"
                      onClick={() => handleArtistClick(artist.artistId)}
                    >
                      <span className="stats-affinity-rank">{i + 1}</span>
                      <span className="stats-affinity-name">{artist.artistName}</span>
                      <div className="stats-affinity-bar-container">
                        <div
                          className="stats-affinity-bar"
                          style={{ width: `${Math.max(0, Math.min(100, (artist.score + 100) / 2))}%` }}
                        />
                      </div>
                      <span className={`stats-affinity-score ${artist.score >= 0 ? 'positive' : 'negative'}`}>
                        {artist.score >= 0 ? '+' : ''}{artist.score.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {affinities.genres.length > 0 && (
                <div className="stats-affinity-group">
                  <h3 className="stats-affinity-label">Top Genre Affinities</h3>
                  <div className="stats-affinity-list">
                    {affinities.genres.map((genre, i) => (
                      <div key={genre.genre} className="stats-affinity-item">
                        <span className="stats-affinity-rank">{i + 1}</span>
                        <span className="stats-affinity-name">{genre.genre}</span>
                        <div className="stats-affinity-bar-container">
                          <div
                            className="stats-affinity-bar genre"
                            style={{ width: `${Math.max(0, Math.min(100, (genre.score + 100) / 2))}%` }}
                          />
                        </div>
                        <span className={`stats-affinity-score ${genre.score >= 0 ? 'positive' : 'negative'}`}>
                          {genre.score >= 0 ? '+' : ''}{genre.score.toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Energy Distribution */}
        <section className="stats-section">
          <h2 className="stats-section-title">Energy Preferences</h2>
          <div className="stats-energy">
            <div className="stats-energy-bars">
              <div className="stats-energy-bar-group">
                <div className="stats-energy-bar-label">Low Energy</div>
                <div className="stats-energy-bar-track">
                  <div
                    className="stats-energy-bar low"
                    style={{ width: `${energyDistribution.low}%` }}
                  />
                </div>
                <span className="stats-energy-bar-value">{energyDistribution.low}%</span>
              </div>
              <div className="stats-energy-bar-group">
                <div className="stats-energy-bar-label">Medium Energy</div>
                <div className="stats-energy-bar-track">
                  <div
                    className="stats-energy-bar medium"
                    style={{ width: `${energyDistribution.medium}%` }}
                  />
                </div>
                <span className="stats-energy-bar-value">{energyDistribution.medium}%</span>
              </div>
              <div className="stats-energy-bar-group">
                <div className="stats-energy-bar-label">High Energy</div>
                <div className="stats-energy-bar-track">
                  <div
                    className="stats-energy-bar high"
                    style={{ width: `${energyDistribution.high}%` }}
                  />
                </div>
                <span className="stats-energy-bar-value">{energyDistribution.high}%</span>
              </div>
            </div>
          </div>
        </section>

        {/* Top Artists & Genres */}
        <div className="stats-columns">
          <section className="stats-section">
            <h2 className="stats-section-title">Top Artists</h2>
            <TopArtistsList
              artists={stats.topArtists}
              onArtistClick={handleArtistClick}
            />
          </section>

          <section className="stats-section">
            <h2 className="stats-section-title">Top Genres</h2>
            <TopGenresList genres={stats.topGenres} />
          </section>
        </div>

        {/* Daily Activity */}
        <section className="stats-section">
          <h2 className="stats-section-title">Daily Activity</h2>
          <div className="stats-chart-container">
            {dailyChartData.length > 0 ? (
              <BarChart
                data={dailyChartData}
                height={140}
                showLabels
                showValues
              />
            ) : (
              <div className="stats-empty">
                <p>No activity data for this period</p>
              </div>
            )}
          </div>
        </section>

        {/* Listening Patterns */}
        <section className="stats-section">
          <h2 className="stats-section-title">Listening Patterns</h2>
          <div className="stats-patterns">
            <div className="stats-pattern-group">
              <h3 className="stats-pattern-label">By Hour of Day</h3>
              <HourlyHeatMap data={stats.hourlyDistribution} />
            </div>
            <div className="stats-pattern-group">
              <h3 className="stats-pattern-label">By Day of Week</h3>
              <DayOfWeekHeatMap data={stats.dayOfWeekDistribution} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StatsView;
