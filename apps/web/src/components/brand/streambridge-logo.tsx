import { useId } from 'react';

type Variant = 'icon' | 'lockup';
type Theme = 'light' | 'dark';

export interface StreamBridgeLogoProps {
  variant?: Variant;
  theme?: Theme;
  className?: string;
}

const GRADIENT_FROM = '#22C55E';
const GRADIENT_TO = '#06B6D4';

export function StreamBridgeLogo({
  variant = 'lockup',
  theme = 'light',
  className,
}: StreamBridgeLogoProps) {
  const gradientId = useId();
  const dotFill = theme === 'dark' ? '#06B6D4' : '#22C55E';
  const textFill = theme === 'dark' ? '#FFFFFF' : '#0F172A';

  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 48 48"
        width="48"
        height="48"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label="StreamBridge"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={GRADIENT_FROM} />
            <stop offset="100%" stopColor={GRADIENT_TO} />
          </linearGradient>
        </defs>
        <polygon points="8,8 40,24 8,40" fill={`url(#${gradientId})`} />
        <circle cx="4" cy="18" r="2" fill={dotFill} />
        <circle cx="4" cy="24" r="2" fill={dotFill} />
        <circle cx="4" cy="30" r="2" fill={dotFill} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 220 48"
      width="220"
      height="48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="StreamBridge"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={GRADIENT_FROM} />
          <stop offset="100%" stopColor={GRADIENT_TO} />
        </linearGradient>
      </defs>
      <polygon points="8,8 40,24 8,40" fill={`url(#${gradientId})`} />
      <circle cx="4" cy="18" r="2" fill={dotFill} />
      <circle cx="4" cy="24" r="2" fill={dotFill} />
      <circle cx="4" cy="30" r="2" fill={dotFill} />
      <text
        x="56"
        y="30"
        fontFamily="Inter, sans-serif"
        fontSize="20"
        fontWeight="600"
        fill={textFill}
      >
        StreamBridge
      </text>
    </svg>
  );
}
