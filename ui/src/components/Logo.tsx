import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <svg
      width="400"
      height="260"
      viewBox="0 0 400 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-10 w-auto drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]', className)}
    >
      <defs>
        <linearGradient id="logoNeonGradient_v3" x1="0" y1="0" x2="400" y2="0">
          <stop offset="0%" stopColor="#34FFD9" />
          <stop offset="100%" stopColor="#C44BFF" />
        </linearGradient>
      </defs>

      {/* Suitcase body */}
      <rect
        x="40"
        y="50"
        width="320"
        height="150"
        rx="28"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Front pocket */}
      <rect
        x="70"
        y="95"
        width="260"
        height="80"
        rx="18"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Handle top bar */}
      <rect
        x="140"
        y="40"
        width="120"
        height="30"
        rx="10"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Handle curve */}
      <path
        d="M155 40 C155 15 245 15 245 40"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Minimal straps */}
      <rect
        x="95"
        y="50"
        width="20"
        height="60"
        rx="6"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="285"
        y="50"
        width="20"
        height="60"
        rx="6"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner handle slot */}
      <rect
        x="155"
        y="135"
        width="90"
        height="35"
        rx="10"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Wheels */}
      <circle cx="120" cy="210" r="14" stroke="url(#logoNeonGradient_v3)" strokeWidth="4" />
      <circle cx="280" cy="210" r="14" stroke="url(#logoNeonGradient_v3)" strokeWidth="4" />

      {/* Speed dashes: left (2 dashes per wheel) - Moved left for visibility */}
      <line
        x1="80"
        y1="204"
        x2="100"
        y2="204"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1="80"
        y1="216"
        x2="100"
        y2="216"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Speed dashes: right (2 dashes per wheel) - Moved left for visibility */}
      <line
        x1="240"
        y1="204"
        x2="260"
        y2="204"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1="240"
        y1="216"
        x2="260"
        y2="216"
        stroke="url(#logoNeonGradient_v3)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
