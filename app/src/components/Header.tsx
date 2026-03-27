import React, { useState, useEffect } from 'react';
import { Layout, Button, Badge, Tooltip } from 'antd';
import { SunOutlined, MoonOutlined, MinusOutlined, BorderOutlined, CloseOutlined } from '@ant-design/icons';
import { useTheme, getThemeColors } from '../contexts/ThemeContext';
import iconImage from '../assets/icon.png';

const { Header: AntHeader } = Layout;

// Custom window control button component
const WindowButton: React.FC<{
  icon: React.ReactNode;
  onClick: () => void;
  isClose?: boolean;
  hoverColor: string;
}> = ({ icon, onClick, isClose, hoverColor }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 46,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        background: hovered ? (isClose ? '#e81123' : hoverColor) : 'transparent',
        transition: 'background 0.1s',
        // @ts-expect-error - WebkitAppRegion is an Electron-specific CSS property
        WebkitAppRegion: 'no-drag',
        appRegion: 'no-drag',
      }}
    >
      {icon}
    </div>
  );
};

const Header: React.FC = () => {
  const { mode, toggleTheme } = useTheme();
  const colors = getThemeColors(mode);
  const isMac = navigator.platform.toLowerCase().includes('mac');
  // Show custom controls on Windows and Linux (not macOS which has native traffic lights)
  const showCustomControls = !isMac;
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [logPath, setLogPath] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<{
    available: boolean;
    downloaded: boolean;
    error?: string;
  } | null>(null);

  // Check if window is maximized on mount and after maximize/restore
  useEffect(() => {
    const checkMaximized = async () => {
      if (window.electronAPI?.window?.isMaximized) {
        const maximized = await window.electronAPI.window.isMaximized();
        setIsMaximized(maximized);
      }
    };
    checkMaximized();
  }, []);

  // Get app version and update status
  useEffect(() => {
    const loadVersion = async () => {
      if (window.electronAPI?.update?.getAppVersion) {
        const version = await window.electronAPI.update.getAppVersion();
        setAppVersion(version);
      }
    };
    loadVersion();

    const loadLogPath = async () => {
      if (window.electronAPI?.update?.getLogPath) {
        const path = await window.electronAPI.update.getLogPath();
        setLogPath(path);
      }
    };
    loadLogPath();

    // Only listen for update availability/errors (detailed status handled by UpdateNotification)
    if (window.electronAPI?.update) {
      const loadStatus = async () => {
        if (window.electronAPI?.update?.getStatus) {
          const status = await window.electronAPI.update.getStatus();
          setUpdateStatus({
            available: status.available,
            downloaded: status.downloaded,
            error: status.error,
          });
        }
      };
      loadStatus();

      // Listen for update availability
      window.electronAPI.update.onStatus((status) => {
        setUpdateStatus({
          available: status.available,
          downloaded: status.downloaded,
          error: status.error,
        });
      });

      window.electronAPI.update.onDownloaded(() => {
        setUpdateStatus((prev) => prev ? { ...prev, downloaded: true } : { available: false, downloaded: true });
      });

      window.electronAPI.update.onError((error) => {
        setUpdateStatus((prev) => prev ? { ...prev, error: error.error } : { available: false, downloaded: false, error: error.error });
      });

      return () => {
        // Cleanup listeners
        if (window.electronAPI?.update) {
          window.electronAPI.update.removeAllListeners('update-status');
          window.electronAPI.update.removeAllListeners('update-downloaded');
          window.electronAPI.update.removeAllListeners('update-error');
        }
      };
    }
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.window?.minimize();
  };

  const handleMaximize = async () => {
    await window.electronAPI?.window?.maximize();
    // Update state after maximize/restore
    if (window.electronAPI?.window?.isMaximized) {
      const maximized = await window.electronAPI.window.isMaximized();
      setIsMaximized(maximized);
    }
  };

  const handleClose = () => {
    window.electronAPI?.window?.close();
  };

  const iconColor = colors.textSecondary;
  const hoverBg = mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  return (
    <AntHeader
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMac ? '0 12px 0 76px' : '0 0 0 12px',
        borderBottom: `1px solid ${colors.border}`,
        background: colors.bgCard,
        height: 36,
        minHeight: 36,
        lineHeight: '36px',
        // Make draggable to move window
        WebkitAppRegion: 'drag',
        appRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Left side: Logo (Windows/Linux only - macOS uses native title bar) */}
      {!isMac && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src={iconImage}
            alt="VectorDBZ"
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              objectFit: 'contain',
            }}
          />
        </div>
      )}
      {/* Empty spacer for macOS to maintain layout */}
      {isMac && <div />}

      {/* Right side: Version + Theme toggle + Window controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        
        {/* Theme Toggle */}
        <Button
          type="text"
          size="small"
          icon={mode === 'dark' ?
            <MoonOutlined style={{ color: '#818cf8', fontSize: 13 }} /> :
            <SunOutlined style={{ color: '#f59e0b', fontSize: 13 }} />
          }
          onClick={toggleTheme}
          style={{
            width: 26,
            height: 26,
            marginRight: showCustomControls ? 12 : 0,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: mode === 'dark' ? colors.bgElevated : colors.bgHover,
            border: `1px solid ${colors.border}`,
            WebkitAppRegion: 'no-drag',
            appRegion: 'no-drag',
          } as React.CSSProperties}
        />

        {/* Version Number - Simple display, update status handled by UpdateNotification */}
        {appVersion && (
          <Tooltip
            title={
              updateStatus?.available || updateStatus?.downloaded
                ? `Update available - see notification`
                : updateStatus?.error
                  ? `Update error: ${updateStatus.error}`
                  : `Version ${appVersion}`
            }
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                color: colors.textSecondary,
                WebkitAppRegion: 'no-drag',
                appRegion: 'no-drag',
              } as React.CSSProperties}
            >
              <span style={{ fontSize: 11 }}>v{appVersion}</span>
              {/* Small indicator dot if update is available */}
              {(updateStatus?.available || updateStatus?.downloaded) && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: colors.primary,
                    animation: 'pulse 2s infinite',
                  }}
                />
              )}
            </div>
          </Tooltip>
        )}

        {/* Custom window controls (Windows & Linux) */}
        {showCustomControls && (
          <div style={{ display: 'flex', alignItems: 'center', height: 36 }}>
            <WindowButton
              icon={<MinusOutlined style={{ fontSize: 12, color: iconColor }} />}
              onClick={handleMinimize}
              hoverColor={hoverBg}
            />
            <WindowButton
              icon={
                isMaximized ? (
                  // Restore icon (two overlapping squares)
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 0v2H0v8h8V8h2V0H2zm6 8H1V3h7v5zm1-6H3V1h6v1z"
                      fill={iconColor}
                    />
                  </svg>
                ) : (
                  <BorderOutlined style={{ fontSize: 11, color: iconColor }} />
                )
              }
              onClick={handleMaximize}
              hoverColor={hoverBg}
            />
            <WindowButton
              icon={<CloseOutlined style={{ fontSize: 12, color: iconColor }} />}
              onClick={handleClose}
              isClose
              hoverColor={hoverBg}
            />
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </AntHeader>
  );
};

export default Header;
