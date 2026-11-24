// Inline stroke icons: 24-unit viewBox, 1.8 stroke, round caps/joins, no fill.
const P = {
  projects: 'M4 5h16v14H4z M4 9h16 M8 5l2 4 M13 5l2 4',
  lyrics: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4',
  cast: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  scenery: 'M3 20l6-10 4 6 3-4 5 8z M17 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  music: 'M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  assemble: 'M4 4h16v16H4z M10 9l5 3-5 3z',
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.9-.7-1.2-.7-2 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z M7.5 11.5h.01 M10.5 7.5h.01 M15.5 8.5h.01',
  plug: 'M9 2v6 M15 2v6 M6 8h12v3a6 6 0 0 1-12 0z M12 17v5',
  check: 'M5 12l5 5L20 7',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  settings: 'M4 6h10 M18 6h2 M16 4v4 M4 12h4 M12 12h8 M10 10v4 M4 18h12 M20 18h0 M18 16v4',
  plus: 'M12 5v14 M5 12h14',
  chevron: 'M9 6l6 6-6 6',
};

export default function Icon({ name, size = 15, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.chevron} />
    </svg>
  );
}

export function AppMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <defs><linearGradient id="appmark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0f7d8c" /><stop offset="1" stopColor="#16324a" /></linearGradient></defs>
      <rect width="28" height="28" rx="7" fill="url(#appmark)" />
      <path d="M11 19V9l8-1.5v9.5 M11 19a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z M19 17a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z"
        fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
