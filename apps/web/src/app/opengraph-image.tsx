import { ImageResponse } from 'next/og';

export const alt = 'Fundi POS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 28,
          padding: '0 96px',
          background: '#16100e',
          color: '#fdfaf7',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="7" fill="#df5102" />
            <path
              d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"
              transform="translate(4 4)"
              stroke="#16100e"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontSize: 40, fontWeight: 600 }}>Fundi POS</span>
        </div>
        <span style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.15, maxWidth: 920 }}>
          Ring up sales. See your real margins. Every branch, every shift.
        </span>
        <span style={{ fontSize: 28, color: '#c9beb6' }}>
          Point of sale for any small business · Works fully offline
        </span>
      </div>
    ),
    { ...size },
  );
}
