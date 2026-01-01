/**
 * MobileAccessSettings - Simplified mobile/remote access configuration
 *
 * Single pairing code flow with auto-routing between local and remote
 */

import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';

// Types
interface PairingConfig {
  code: string;
  qrCode?: string;
  localUrl: string;
  expiresAt: number;
  relayActive: boolean;
}

interface PairedDevice {
  id: string;
  name: string;
  createdAt: string;
  lastAccessAt: string;
}

interface MobileAccessState {
  isEnabled: boolean;
  isLoading: boolean;
  pairing: PairingConfig | null;
  devices: PairedDevice[];
  hasAcceptedPrivacy: boolean;
}

// ========================================
// Privacy Notice Modal
// ========================================

interface PrivacyNoticeProps {
  onAccept: () => void;
  onDecline: () => void;
}

const PrivacyNotice: React.FC<PrivacyNoticeProps> = ({ onAccept, onDecline }) => {
  return (
    <div className="mobile-privacy-overlay">
      <div className="mobile-privacy-modal">
        <div className="mobile-privacy-icon">
          <MobileIcon size={48} />
        </div>

        <h2 className="mobile-privacy-title">Mobile Access</h2>
        <p className="mobile-privacy-subtitle">
          Stream your music anywhere
        </p>

        <div className="mobile-privacy-content">
          <div className="mobile-privacy-section">
            <div className="mobile-privacy-feature">
              <div className="mobile-privacy-feature-icon secure">
                <LockIcon size={20} />
              </div>
              <div className="mobile-privacy-feature-info">
                <h4>Secure Connection</h4>
                <p>All connections are end-to-end encrypted. Only devices with your code can connect.</p>
              </div>
            </div>

            <div className="mobile-privacy-feature">
              <div className="mobile-privacy-feature-icon private">
                <ShieldIcon size={20} />
              </div>
              <div className="mobile-privacy-feature-info">
                <h4>Your Data Stays Yours</h4>
                <p>Music streams directly from your computer. No data is stored in the cloud.</p>
              </div>
            </div>

            <div className="mobile-privacy-feature">
              <div className="mobile-privacy-feature-icon control">
                <ControlIcon size={20} />
              </div>
              <div className="mobile-privacy-feature-info">
                <h4>You're in Control</h4>
                <p>See all paired devices and revoke access anytime.</p>
              </div>
            </div>
          </div>

          <div className="mobile-privacy-note">
            <InfoIcon size={16} />
            <p>
              <strong>How it works:</strong> Enter the code on your phone or scan the QR code.
              Works on the same network or from anywhere.
            </p>
          </div>
        </div>

        <div className="mobile-privacy-actions">
          <button className="mobile-privacy-btn secondary" onClick={onDecline}>
            Not Now
          </button>
          <button className="mobile-privacy-btn primary" onClick={onAccept}>
            Enable Mobile Access
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================================
// Pairing Code Display
// ========================================

interface PairingCodeDisplayProps {
  code: string;
  qrCode?: string;
  isActive: boolean;
  onRefresh: () => void;
  isLoading: boolean;
}

const PairingCodeDisplay: React.FC<PairingCodeDisplayProps> = ({
  code,
  qrCode,
  isActive,
  onRefresh,
  isLoading
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
    }
  };

  return (
    <div className="mobile-pairing-container">
      {/* Status indicator */}
      <div className="mobile-pairing-status">
        <span className={`mobile-pairing-indicator ${isActive ? 'active' : ''}`} />
        <span>{isActive ? 'Ready to connect' : 'Connecting...'}</span>
      </div>

      {/* Code display */}
      <div className="mobile-pairing-code-card">
        <div className="mobile-pairing-code">
          {code.split('-').map((part, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="mobile-pairing-separator">-</span>}
              <span className="mobile-pairing-code-part">{part}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="mobile-pairing-actions">
          <button
            className="mobile-pairing-btn"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          </button>
          <button
            className="mobile-pairing-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Generate new code"
          >
            <RefreshIcon size={16} />
          </button>
        </div>
      </div>

      {/* QR Code */}
      {qrCode && (
        <div className="mobile-pairing-qr">
          <img src={qrCode} alt="Scan to connect" className="mobile-pairing-qr-image" />
        </div>
      )}

      <p className="mobile-pairing-hint">
        Enter this code on your mobile device or scan the QR code.
        Works from any network.
      </p>
    </div>
  );
};

// ========================================
// Relay Settings
// ========================================

interface RelaySettingsProps {
  enabled: boolean;
  customUrl: string | null;
  onToggle: (enabled: boolean) => void;
  onUrlChange: (url: string | null) => void;
}

const RelaySettings: React.FC<RelaySettingsProps> = ({
  enabled,
  customUrl,
  onToggle,
  onUrlChange
}) => {
  const [urlInput, setUrlInput] = useState(customUrl || '');
  const [showUrlInput, setShowUrlInput] = useState(!!customUrl);

  const handleUrlSave = () => {
    const trimmed = urlInput.trim();
    onUrlChange(trimmed || null);
  };

  const handleUrlClear = () => {
    setUrlInput('');
    onUrlChange(null);
    setShowUrlInput(false);
  };

  return (
    <div className="mobile-relay-settings">
      {/* Remote access toggle */}
      <div className="mobile-relay-option">
        <div className="mobile-relay-option-info">
          <div className="mobile-relay-option-row">
            <GlobeIcon size={18} />
            <h4>Remote Access</h4>
          </div>
          <p>Connect from anywhere via relay server</p>
        </div>
        <label className="mobile-access-toggle small">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="mobile-access-toggle-slider" />
        </label>
      </div>

      {/* Custom relay URL */}
      {enabled && (
        <div className="mobile-relay-url-section">
          {showUrlInput ? (
            <div className="mobile-relay-url-input-group">
              <label className="mobile-relay-url-label">Relay Server</label>
              <div className="mobile-relay-url-row">
                <input
                  type="text"
                  className="mobile-relay-url-input"
                  placeholder="wss://audiio-relay.fly.dev"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onBlur={handleUrlSave}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSave()}
                />
                <button
                  className="mobile-relay-url-clear"
                  onClick={handleUrlClear}
                  title="Use default"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
              <p className="mobile-relay-url-hint">
                Leave empty to use the default relay
              </p>
            </div>
          ) : (
            <button
              className="mobile-relay-custom-btn"
              onClick={() => setShowUrlInput(true)}
            >
              <SettingsIcon size={14} />
              Use custom relay server
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ========================================
// Paired Devices List
// ========================================

interface PairedDevicesProps {
  devices: PairedDevice[];
  onRevoke: (deviceId: string) => void;
  onRevokeAll: () => void;
}

const PairedDevices: React.FC<PairedDevicesProps> = ({
  devices,
  onRevoke,
  onRevokeAll
}) => {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (devices.length === 0) {
    return (
      <div className="mobile-devices-empty">
        <DevicesIcon size={32} />
        <p>No paired devices</p>
        <span>Devices will appear here after connecting</span>
      </div>
    );
  }

  return (
    <div className="mobile-paired-devices">
      <div className="mobile-devices-list">
        {devices.map(device => (
          <div key={device.id} className="mobile-device-item">
            <div className="mobile-device-icon">
              <PhoneIcon size={20} />
            </div>
            <div className="mobile-device-info">
              <span className="mobile-device-name">{device.name || 'Unknown Device'}</span>
              <span className="mobile-device-time">
                Last seen {formatTime(device.lastAccessAt)}
              </span>
            </div>
            <button
              className="mobile-device-disconnect"
              onClick={() => onRevoke(device.id)}
              title="Revoke access"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
      {devices.length > 1 && (
        <button className="mobile-revoke-all-btn" onClick={onRevokeAll}>
          Revoke all devices
        </button>
      )}
    </div>
  );
};

// ========================================
// Main Component
// ========================================

export const MobileAccessSettings: React.FC = () => {
  const {
    customRelayUrl,
    remoteAccessEnabled,
    setCustomRelayUrl,
    setRemoteAccessEnabled
  } = useSettingsStore();

  const [state, setState] = useState<MobileAccessState>({
    isEnabled: false,
    isLoading: true,
    pairing: null,
    devices: [],
    hasAcceptedPrivacy: localStorage.getItem('audiio-mobile-privacy-accepted') === 'true'
  });

  const [showPrivacy, setShowPrivacy] = useState(false);

  // Load initial state
  useEffect(() => {
    loadMobileStatus();
  }, []);

  // Load devices when enabled
  useEffect(() => {
    if (state.isEnabled) {
      loadDevices();
    }
  }, [state.isEnabled]);

  const loadMobileStatus = async () => {
    try {
      // @ts-ignore - API exposed via preload
      const status = await window.api?.getMobileStatus?.();

      if (status) {
        setState(prev => ({
          ...prev,
          isEnabled: status.isEnabled,
          pairing: status.pairing || null,
          isLoading: false
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (err) {
      console.error('[MobileAccess] Error loading status:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const loadDevices = async () => {
    try {
      // @ts-ignore - API exposed via preload
      const result = await window.api?.getMobileDevices?.();
      if (result?.devices) {
        setState(prev => ({ ...prev, devices: result.devices }));
      }
    } catch (err) {
      console.error('[MobileAccess] Error loading devices:', err);
    }
  };

  const handleEnableClick = () => {
    if (!state.hasAcceptedPrivacy) {
      setShowPrivacy(true);
    } else {
      enableMobileAccess();
    }
  };

  const handlePrivacyAccept = () => {
    localStorage.setItem('audiio-mobile-privacy-accepted', 'true');
    setState(prev => ({ ...prev, hasAcceptedPrivacy: true }));
    setShowPrivacy(false);
    enableMobileAccess();
  };

  const handlePrivacyDecline = () => {
    setShowPrivacy(false);
  };

  const enableMobileAccess = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // @ts-ignore - API exposed via preload
      // Pass custom relay URL from settings if configured
      const result = await window.api?.enableMobileAccess?.({
        customRelayUrl: customRelayUrl || undefined
      });

      if (result?.success) {
        setState(prev => ({
          ...prev,
          isEnabled: true,
          pairing: result.pairing || null,
          isLoading: false
        }));
      } else {
        console.error('[MobileAccess] Enable failed:', result?.error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('[MobileAccess] Failed to enable:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const disableMobileAccess = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // @ts-ignore - API exposed via preload
      await window.api?.disableMobileAccess?.();
      setState(prev => ({
        ...prev,
        isEnabled: false,
        pairing: null,
        devices: [],
        isLoading: false
      }));
    } catch (error) {
      console.error('[MobileAccess] Failed to disable:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleRefreshCode = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // @ts-ignore - API exposed via preload
      const result = await window.api?.refreshMobilePairingCode?.();
      if (result?.pairing) {
        setState(prev => ({
          ...prev,
          pairing: result.pairing,
          isLoading: false
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('[MobileAccess] Failed to refresh code:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      // @ts-ignore - API exposed via preload
      const result = await window.api?.revokeMobileDevice?.(deviceId);
      if (result?.success) {
        setState(prev => ({
          ...prev,
          devices: prev.devices.filter(d => d.id !== deviceId)
        }));
      }
    } catch (error) {
      console.error('[MobileAccess] Failed to revoke device:', error);
    }
  };

  const handleRevokeAllDevices = async () => {
    try {
      // @ts-ignore - API exposed via preload
      const result = await window.api?.revokeAllMobileDevices?.();
      if (result?.success) {
        setState(prev => ({ ...prev, devices: [] }));
      }
    } catch (error) {
      console.error('[MobileAccess] Failed to revoke all devices:', error);
    }
  };

  const handleRelayToggle = async (enabled: boolean) => {
    setRemoteAccessEnabled(enabled);
    // Notify main process
    try {
      // @ts-ignore - API exposed via preload
      await window.api?.setMobileRemoteAccess?.(enabled);
    } catch (error) {
      console.error('[MobileAccess] Failed to toggle remote access:', error);
    }
  };

  const handleRelayUrlChange = async (url: string | null) => {
    setCustomRelayUrl(url);
    // Notify main process
    try {
      // @ts-ignore - API exposed via preload
      await window.api?.setMobileRelayUrl?.(url);
    } catch (error) {
      console.error('[MobileAccess] Failed to set relay URL:', error);
    }
  };

  // Loading state
  if (state.isLoading && !state.isEnabled) {
    return (
      <div className="mobile-access-loading">
        <div className="mobile-access-spinner" />
      </div>
    );
  }

  return (
    <div className="mobile-access-settings">
      {/* Privacy Notice Modal */}
      {showPrivacy && (
        <PrivacyNotice onAccept={handlePrivacyAccept} onDecline={handlePrivacyDecline} />
      )}

      {/* Header */}
      <div className="mobile-access-header">
        <div className="mobile-access-header-icon">
          <MobileIcon size={24} />
        </div>
        <div className="mobile-access-header-info">
          <h3>Mobile Access</h3>
          <p>Access your music from your phone or tablet</p>
        </div>
        <label className="mobile-access-toggle">
          <input
            type="checkbox"
            checked={state.isEnabled}
            onChange={state.isEnabled ? disableMobileAccess : handleEnableClick}
            disabled={state.isLoading}
          />
          <span className="mobile-access-toggle-slider" />
        </label>
      </div>

      {/* Content - only show when enabled */}
      {state.isEnabled && (
        <div className="mobile-access-content">
          {state.pairing ? (
            <>
              {/* Pairing Code Section */}
              <PairingCodeDisplay
                code={state.pairing.code}
                qrCode={state.pairing.qrCode}
                isActive={state.pairing.relayActive}
                onRefresh={handleRefreshCode}
                isLoading={state.isLoading}
              />

              {/* Relay Settings */}
              <RelaySettings
                enabled={remoteAccessEnabled}
                customUrl={customRelayUrl}
                onToggle={handleRelayToggle}
                onUrlChange={handleRelayUrlChange}
              />

              {/* Paired Devices */}
              <div className="mobile-access-section">
                <div className="mobile-access-section-header">
                  <h4>Paired Devices</h4>
                  <span className="mobile-access-count">{state.devices.length}</span>
                </div>
                <PairedDevices
                  devices={state.devices}
                  onRevoke={handleRevokeDevice}
                  onRevokeAll={handleRevokeAllDevices}
                />
              </div>
            </>
          ) : (
            <div className="mobile-access-connecting">
              <div className="mobile-access-spinner" />
              <p>Connecting to relay server...</p>
            </div>
          )}
        </div>
      )}

      {/* Disabled state hint */}
      {!state.isEnabled && (
        <div className="mobile-access-disabled-hint">
          <p>
            Turn on to access your music library from your phone.
            Enter a code or scan a QR to connect.
          </p>
        </div>
      )}
    </div>
  );
};

// ========================================
// Icons
// ========================================

const MobileIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
  </svg>
);

const LockIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
  </svg>
);

const ShieldIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
  </svg>
);

const ControlIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
  </svg>
);

const InfoIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
  </svg>
);

const CopyIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
  </svg>
);

const CheckIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
  </svg>
);

const DevicesIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z"/>
  </svg>
);

const PhoneIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3zm-2 20h-4v-1h4v1zm3.25-3H6.75V4h10.5v14z"/>
  </svg>
);

const CloseIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

const GlobeIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
  </svg>
);

const RefreshIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>
);

const SettingsIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
  </svg>
);

export default MobileAccessSettings;
