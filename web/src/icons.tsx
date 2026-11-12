import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  map: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.400-6.500 11-6.500 11z" /><circle cx="12" cy="10" r="2.300" /></>,
  bell: <><path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15z" /><path d="M10 21h4" /></>,
  scooter: <><circle cx="6" cy="18" r="2.200" /><circle cx="18.500" cy="18" r="2.200" /><path d="M8.200 18h6.500l-2-12.500H9.500" /></>,
  helmet: <><path d="M3.500 15a8.500 8.500 0 0 1 17 0v1.500a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" /><path d="M12 17.500V13a1 1 0 0 1 1-1h7" /></>,
  shield: <><path d="M12 3.500 5 6v5.500c0 4.300 2.900 7.600 7 9 4.100-1.400 7-4.700 7-9V6z" /></>,
  gauge: <><path d="M4.500 17.500a8.500 8.500 0 1 1 15 0" /><path d="m12 13 3.500-4" /><circle cx="12" cy="13.500" r="1.200" /></>,
  battery: <><rect x="3" y="8" width="15.500" height="8.500" rx="2" /><path d="M21 11v2.500" /></>,
  signal: <><path d="M5 18.500v-3" /><path d="M10 18.500v-6.500" /><path d="M15 18.500V8" /><path d="M20 18.500V4.500" /></>,
  signalOff: <><path d="M5 18.500v-3" /><path d="M10 18.500v-6.500" /><path d="m14.500 6 6 6" /><path d="m20.500 6-6 6" /></>,
  alert: <><path d="M12 4 2.800 19.500h18.400z" /><path d="M12 10v4.500" /><path d="M12 17.200v.100" /></>,
  check: <path d="m5 12.500 4.500 4.500L19 7.500" />,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  target: <><circle cx="12" cy="12" r="7.500" /><circle cx="12" cy="12" r="2.500" /><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3" /></>,
  zone: <><circle cx="12" cy="12" r="8.500" strokeDasharray="3.200 3" /><circle cx="12" cy="12" r="2" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  play: <path d="M8 5.500v13l10.500-6.500z" />,
  undo: <><path d="M8 5 3.500 9.500 8 14" /><path d="M4 9.500h10a6 6 0 0 1 0 12h-3" /></>,
  edit: <><path d="m4 20 1-4.500L16.500 4l3.500 3.500L8.500 19z" /><path d="m14 6.500 3.500 3.500" /></>,
  draw: <><path d="M5 7.500 12 4l7 5-2.500 9.500H8z" /><circle cx="5" cy="7.500" r="1.300" /><circle cx="12" cy="4" r="1.300" /><circle cx="19" cy="9" r="1.300" /><circle cx="16.500" cy="18.500" r="1.300" /><circle cx="8" cy="18.500" r="1.300" /></>,
  clock: <><circle cx="12" cy="12" r="8.500" /><path d="M12 7.500V12l3 2" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.800"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
