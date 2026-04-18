import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';

type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const STORAGE_KEY = 'vectordb-theme';

// Dark theme tokens
const darkTokens = {
  colorPrimary: '#6366f1',
  colorBgBase: '#0f0f14',
  colorBgContainer: '#16161e',
  colorBgElevated: '#1e1e2a',
  colorBorder: '#2a2a3a',
  colorText: '#e4e4e7',
  colorTextSecondary: '#a1a1aa',
  borderRadius: 8,
  fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
};

// Light theme tokens
const lightTokens = {
  colorPrimary: '#6366f1',
  colorBgBase: '#f8fafc',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBorder: '#e2e8f0',
  colorText: '#1e293b',
  colorTextSecondary: '#64748b',
  borderRadius: 8,
  fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    // Try to get from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    // Add class to root for CSS variables
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  const tokens = mode === 'dark' ? darkTokens : lightTokens;

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme, setTheme }}>
      <ConfigProvider
        theme={{
          algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: tokens,
          components: {
            Layout: {
              headerBg: mode === 'dark' ? '#16161e' : '#ffffff',
              siderBg: mode === 'dark' ? '#16161e' : '#ffffff',
              bodyBg: mode === 'dark' ? '#0f0f14' : '#f8fafc',
            },
            Menu: {
              darkItemBg: '#16161e',
              darkSubMenuItemBg: '#1a1a24',
            },
            Table: {
              headerBg: mode === 'dark' ? '#1e1e2a' : '#f1f5f9',
              rowHoverBg: mode === 'dark' ? '#1e1e2a' : '#f8fafc',
            },
            Modal: {
              contentBg: mode === 'dark' ? '#16161e' : '#ffffff',
              headerBg: mode === 'dark' ? '#16161e' : '#ffffff',
            },
            Drawer: {
              colorBgElevated: mode === 'dark' ? '#16161e' : '#ffffff',
            },
            Input: {
              colorBgContainer: mode === 'dark' ? '#1e1e2a' : '#ffffff',
            },
            Select: {
              colorBgContainer: mode === 'dark' ? '#1e1e2a' : '#ffffff',
            },
            Button: {
              colorBgContainer: mode === 'dark' ? '#1e1e2a' : '#ffffff',
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

// Export theme colors for use in inline styles
export const getThemeColors = (mode: ThemeMode) => {
  return mode === 'dark'
    ? {
        bg: '#0f0f14',
        bgCard: '#16161e',
        bgElevated: '#1e1e2a',
        bgHover: '#1a1a24',
        border: '#2a2a3a',
        borderLight: '#3a3a4a',
        text: '#e4e4e7',
        textSecondary: '#a1a1aa',
        textMuted: '#71717a',
        primary: '#6366f1',
        primaryLight: '#818cf8',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      }
    : {
        bg: '#f8fafc',
        bgCard: '#ffffff',
        bgElevated: '#ffffff',
        bgHover: '#f1f5f9',
        border: '#e2e8f0',
        borderLight: '#cbd5e1',
        text: '#1e293b',
        textSecondary: '#64748b',
        textMuted: '#94a3b8',
        primary: '#6366f1',
        primaryLight: '#818cf8',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      };
};
