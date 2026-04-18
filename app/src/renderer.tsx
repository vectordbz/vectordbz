import React from 'react';
import { createRoot } from 'react-dom/client';
import { PostHogProvider } from 'posthog-js/react';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';
import './styles/global.css';

const container = document.getElementById('root');
const root = createRoot(container!);

// Get PostHog configuration from environment variables
// IMPORTANT: Vite replaces import.meta.env.* at BUILD TIME, not runtime
// During build, Vite reads .env file or environment variables and replaces
// these references with actual string values in the built code
// @ts-expect-error - Vite handles import.meta.env at build time
const posthogApiKey = import.meta.env?.VITE_PUBLIC_POSTHOG_KEY;
// @ts-expect-error - Vite handles import.meta.env at build time
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
