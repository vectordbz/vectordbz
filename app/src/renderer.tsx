import React from 'react';
import { createRoot } from 'react-dom/client';
import { PostHogProvider } from 'posthog-js/react';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';
import './styles/global.css';
import './i18n';

const container = document.getElementById('root');
const root = createRoot(container!);

const posthogApiKey = import.meta.env?.VITE_PUBLIC_POSTHOG_KEY;
const posthogHost = import.meta.env?.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const posthogOptions = {
  api_host: posthogHost,
  person_profiles: 'identified_only', // Only create profiles for identified users
} as const;

root.render(
  <React.StrictMode>
    {posthogApiKey ? (
      <PostHogProvider apiKey={posthogApiKey} options={posthogOptions}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </PostHogProvider>
    ) : (
      <ThemeProvider>
        <App />
      </ThemeProvider>
    )}
  </React.StrictMode>,
);
