/**
 * CollapsibleSection - Reusable collapsible section wrapper for artist page
 * Features: LocalStorage persistence, smooth animations, accessible
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CollapsibleSectionProps {
  /** Unique ID for localStorage persistence */
  id: string;
  /** Section title displayed in header */
  title: string;
  /** Optional subtitle or count */
  subtitle?: string;
  /** Whether section is expanded by default (first load only) */
  defaultExpanded?: boolean;
  /** Optional icon component */
  icon?: React.ReactNode;
  /** Section content */
  children: React.ReactNode;
  /** Optional className for the section */
  className?: string;
  /** Whether to hide the section when empty (no children) */
  hideWhenEmpty?: boolean;
  /** Optional "See All" action */
  onSeeAll?: () => void;
}

const STORAGE_KEY_PREFIX = 'audiio-artist-section-';

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  id,
  title,
  subtitle,
  defaultExpanded = true,
  icon,
  children,
  className = '',
  hideWhenEmpty = false,
  onSeeAll,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(() => {
    // Try to get from localStorage on first render
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
    if (stored !== null) {
      return stored === 'true';
    }
    return defaultExpanded;
  });
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto');

  // Update localStorage when state changes
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, String(isExpanded));
  }, [id, isExpanded]);

  // Measure content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (contentRef.current && isExpanded) {
          setContentHeight(contentRef.current.scrollHeight);
        }
      });

      resizeObserver.observe(contentRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [isExpanded]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
  }, [toggleExpanded]);

  // Check if section has content
  const hasContent = React.Children.count(children) > 0;
  if (hideWhenEmpty && !hasContent) {
    return null;
  }

  return (
    <section
      className={`artist-collapsible-section ${className} ${isExpanded ? 'expanded' : 'collapsed'}`}
      aria-expanded={isExpanded}
    >
      <div
        className="collapsible-section-header"
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-controls={`section-content-${id}`}
      >
        <div className="collapsible-section-title-wrapper">
          {icon && <span className="collapsible-section-icon">{icon}</span>}
          <h3 className="collapsible-section-title">{title}</h3>
          {subtitle && (
            <span className="collapsible-section-subtitle">{subtitle}</span>
          )}
        </div>
        <div className="collapsible-section-actions">
          {onSeeAll && isExpanded && (
            <button
              className="collapsible-section-see-all"
              onClick={(e) => {
                e.stopPropagation();
                onSeeAll();
              }}
            >
              See All
            </button>
          )}
          <span
            className={`collapsible-section-chevron ${isExpanded ? 'expanded' : ''}`}
            aria-hidden="true"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </div>
      <div
        id={`section-content-${id}`}
        className="collapsible-section-content"
        style={{
          height: isExpanded ? contentHeight : 0,
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="collapsible-section-inner">
          {children}
        </div>
      </div>
    </section>
  );
};

export default CollapsibleSection;
