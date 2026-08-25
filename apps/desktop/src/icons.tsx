// Small hand-authored stroke icons (no new dependency) - visually matched
// to lucide's style (round caps/joins, 1.8-2 weight) so the till and the
// web dashboard read as the same product family without pulling in a full
// icon package for a dozen glyphs.
type IconProps = { className?: string };

function base(paths: React.ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className ?? 'icon'}
        aria-hidden
      >
        {paths}
      </svg>
    );
  };
}

export const SearchIcon = base(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </>,
);

export const WifiIcon = base(
  <>
    <path d="M2 8.5a16 16 0 0 1 20 0" />
    <path d="M5.5 12.5a11 11 0 0 1 13 0" />
    <path d="M9 16.5a5.5 5.5 0 0 1 6 0" />
    <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
  </>,
);

export const WifiOffIcon = base(
  <>
    <path d="M2 8.5a16 16 0 0 1 5-3.2M22 8.5a16 16 0 0 0-6.4-3.7" />
    <path d="M5.5 12.5a11 11 0 0 1 4-2.4M18.5 12.5a11 11 0 0 0-3-2" />
    <path d="M9 16.5a5.5 5.5 0 0 1 6 0" />
    <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
    <path d="M3 3l18 18" />
  </>,
);

export const UsersIcon = base(
  <>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a6 6 0 0 1 11 0" />
    <path d="M16 8.2a3.2 3.2 0 1 1 3.6 3.17" />
    <path d="M15 12.3c2.6.2 4.9 1.7 5.5 4.4" />
  </>,
);

export const ClockIcon = base(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);

export const ShieldIcon = base(
  <path d="M12 3.5l7 2.7v5.4c0 4.5-3 7.9-7 9.4-4-1.5-7-4.9-7-9.4V6.2l7-2.7z" />,
);

export const PrinterIcon = base(
  <>
    <path d="M6.5 8.5V4h11v4.5" />
    <rect x="4" y="8.5" width="16" height="7" rx="1.6" />
    <path d="M6.5 15v4.5h11V15" />
  </>,
);

export const XIcon = base(<path d="M5 5l14 14M19 5L5 19" />);

export const PlusIcon = base(<path d="M12 5v14M5 12h14" />);

export const MinusIcon = base(<path d="M5 12h14" />);

export const ArchiveIcon = base(
  <>
    <rect x="3.5" y="4" width="17" height="4.2" rx="1" />
    <path d="M4.5 8.2V19a1.4 1.4 0 0 0 1.4 1.4h12.2A1.4 1.4 0 0 0 19.5 19V8.2" />
    <path d="M10 13h4" />
  </>,
);

export const UndoIcon = base(
  <>
    <path d="M4 10h9a5.5 5.5 0 0 1 0 11h-2" />
    <path d="M8 5.5L4 10l4 4.5" />
  </>,
);

export const ReceiptIcon = base(
  <>
    <path d="M6 3.5h12v17l-2.5-1.6L13 20.5l-2.5-1.6L8 20.5l-2-1.6z" />
    <path d="M9 8h6M9 11.5h6M9 15h4" />
  </>,
);

export const WrenchIcon = base(
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z" />,
);
