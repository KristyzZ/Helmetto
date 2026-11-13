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
  goggles: <><path d="M3.500 9.500h17v4a2.500 2.500 0 0 1-2.500 2.500h-3l-1.500-2h-3L9 16H6a2.500 2.500 0 0 1-2.500-2.500z" /><path d="M2 11.500h1.500M20.500 11.500H22" /></>,
  ears: <><path d="M6.500 13v-2a5.500 5.500 0 0 1 11 0v2" /><rect x="3.500" y="12.500" width="4" height="7" rx="1.800" /><rect x="16.500" y="12.500" width="4" height="7" rx="1.800" /></>,
  gloves: <><path d="M8 21v-4L5 12.800a1.400 1.400 0 0 1 2.300-1.600L9 13.300V6a1.200 1.200 0 0 1 2.400 0v5.500V4.800a1.200 1.200 0 0 1 2.400 0v6.700V5.800a1.200 1.200 0 0 1 2.400 0v6.200V8.300a1.200 1.200 0 0 1 2.400 0V15c0 3.300-2.200 6-5.400 6z" /></>,
  chaps: <><path d="M7 3.500h10l1.500 17h-4.200L12 10.500l-2.300 10H5.500z" /><path d="M7.300 7.500h9.400" /></>,
  vest: <><path d="M9 3.500 6 5.200v15.300h5V9.500L12 8l1 1.500v11h5V5.200l-3-1.700-3 3.500z" /><path d="M6 13h5M13 13h5M6 16.500h5M13 16.500h5" /></>,
  grinder: <><circle cx="7.500" cy="14.500" r="4.500" /><circle cx="7.500" cy="14.500" r="1" /><path d="M10.500 11 19 6.200a1.600 1.600 0 0 1 2.200.600 1.600 1.600 0 0 1-.600 2.200L12 14" /></>,
  chainsaw: <><rect x="2.500" y="9" width="7" height="8" rx="1.500" /><path d="M4.500 9V6.500h3.500" /><path d="M9.500 11h10a2 2 0 0 1 0 4h-10" /><path d="M12.500 11v-1M15.500 11v-1M18.500 11v-1M12.500 16v-1M15.500 16v-1" /></>,
  boat: <><path d="M3 14.500h18l-2.500 5h-13z" /><path d="M11.500 3.500v11" /><path d="M11.500 4.500 18 12.500h-6.500" /></>,
  lock: <><rect x="5" y="10.500" width="14" height="10" rx="2" /><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500" /></>,
  unlock: <><rect x="5" y="10.500" width="14" height="10" rx="2" /><path d="M8 10.500V8a4 4 0 0 1 7.700-1.500" /></>,
  back: <path d="m15 5.500-6.500 6.500 6.500 6.500" />,
  power: <><path d="M12 3.500v8" /><path d="M7 6.500a7 7 0 1 0 10 0" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  chart: <><path d="M4 20h16" /><path d="M7 16.500V11" /><path d="M12 16.500V6" /><path d="M17 16.500v-4" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  copy: <><rect x="8.500" y="8.500" width="11" height="11" rx="2" /><path d="M15.500 8.500V6.500a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  download: <><path d="M12 4v11" /><path d="m7 10.500 5 5 5-5" /><path d="M5 20h14" /></>,
  users: <><circle cx="9" cy="8.500" r="3.200" /><path d="M3 19.500a6 6 0 0 1 12 0" /><path d="M15.500 5.500a3 3 0 0 1 0 6" /><path d="M17.500 14.200a5.500 5.500 0 0 1 3.500 5.300" /></>,
  badge: <><rect x="4" y="3.500" width="16" height="17" rx="2.500" /><circle cx="12" cy="10" r="2.800" /><path d="M7.500 17a4.500 4.500 0 0 1 9 0" /></>,
  trash: <><path d="M4.500 7h15" /><path d="M9.500 7V4.500h5V7" /><path d="M6.500 7l1 13h9l1-13" /><path d="M10.200 11v5.500M13.800 11v5.500" /></>,
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
