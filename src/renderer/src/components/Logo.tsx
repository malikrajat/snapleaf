import { useId } from 'react';

export function Logo({ size = 32 }: { size?: number }) {
  const id = useId().replaceAll(':', '');
  const gradient = `grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Snapleaf">
      <defs>
        <linearGradient id={gradient} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4aa8ff" />
          <stop offset="0.55" stopColor="#1e90ff" />
          <stop offset="1" stopColor="#0b63c7" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${gradient})`} />
      <path
        d="M22 17v-2a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2M17 22h-2a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h2M47 22h2a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3h-2M22 47v2a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-2"
        stroke="#eff7ff"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.95"
      />
      <path
        d="M40.5 24.2c-7.2 0.4-12.4 5.6-13.6 14.1 8.5-1.2 13.7-6.4 14.1-13.6 0.05-1.4 1.9-1.4 1.85 0-0.45 8.9-6.7 15.1-15.6 15.6-1.4 0.05-1.4-1.8 0-1.85 8.3-0.4 12.3-4.4 12.7-12.7 0.05-1.4 1.9-1.4 1.85 0Z"
        fill="#eff7ff"
        opacity="0.98"
      />
      <circle cx="26.5" cy="24" r="2.2" fill="#062b57" opacity="0.55" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="wordmark">
      <Logo size={compact ? 24 : 28} />
      <span>Snapleaf</span>
    </span>
  );
}
