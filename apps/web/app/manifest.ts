import type { MetadataRoute } from 'next';

// Web app manifest: lets players install Ayvago from the browser (Android, desktop Chromium;
// iOS through Share → Add to Home Screen). Icons are the Ayvago mark on brand ink.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Ayvago Games',
    short_name: 'Ayvago',
    description: 'Retro arcade, action, casual and puzzle games, free in your browser.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#201e1d',
    theme_color: '#201e1d',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
