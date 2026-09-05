import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fundi POS',
    short_name: 'Fundi POS',
    description: 'Point of sale, inventory, and real sales & margin reporting for small businesses.',
    start_url: '/',
    display: 'standalone',
    background_color: '#16100e',
    theme_color: '#16100e',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
