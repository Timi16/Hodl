/** Stroke icons from the HodL design. Decorative unless given a label. */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number; label?: string };

function base({ size = 18, label, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true }),
    ...rest,
  };
}

/** Closed padlock. `fill` colours the body; the keyhole uses `hole`. */
export function LockIcon({ hole = "#5BF0B0", body = "currentColor", ...p }: P & { hole?: string; body?: string }) {
  return (
    <svg {...base(p)}>
      <path d="M7.75 10.5V7.75a4.25 4.25 0 0 1 8.5 0v2.75" />
      <rect x="4.25" y="10.5" width="15.5" height="10.75" rx="3.25" fill={body} />
      <circle cx="12" cy="15.4" r="1.45" fill={hole} stroke="none" />
    </svg>
  );
}

/** Outline padlock with a soft fill, used on dark tiles. */
export function LockSoftIcon(p: P) {
  return (
    <svg {...base({ strokeWidth: 1.75, ...p })}>
      <path d="M7.75 10.5V7.75a4.25 4.25 0 0 1 8.5 0v2.75" />
      <rect x="4.25" y="10.5" width="15.5" height="10.75" rx="3.25" fill="currentColor" fillOpacity="0.18" />
      <circle cx="12" cy="15.4" r="1.45" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LockOpenIcon(p: P) {
  return (
    <svg {...base({ strokeWidth: 1.75, ...p })}>
      <path d="M7.75 10.5V7.75a4.25 4.25 0 0 1 8.1-1.8" />
      <rect x="4.25" y="10.5" width="15.5" height="10.75" rx="3.25" fill="currentColor" fillOpacity="0.14" />
      <circle cx="12" cy="15.9" r="1.45" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const CheckIcon = (p: P) => (
  <svg {...base({ strokeWidth: 2.5, ...p })}>
    <path d="M5 12l5 5L20 7" />
  </svg>
);
export const ArrowRightIcon = (p: P) => (
  <svg {...base({ strokeWidth: 2.25, ...p })}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const BackIcon = (p: P) => (
  <svg {...base({ strokeWidth: 2.25, ...p })}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base({ strokeWidth: 2.5, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const LinkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </svg>
);
export const ExternalIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const CopyIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </svg>
);
export const ReleasedIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 17L17 7M8 7h9v9" />
  </svg>
);
export const RefundIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.75, ...p })}>
    <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.14" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const WarnIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.75, ...p })}>
    <path
      d="M10.27 4.06 2.9 17.1A2 2 0 0 0 4.64 20.1h14.72a2 2 0 0 0 1.74-3L13.73 4.06a2 2 0 0 0-3.46 0z"
      fill="currentColor"
      fillOpacity="0.18"
    />
    <path d="M12 9.25v4.5" />
    <circle cx="12" cy="16.9" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);
export const ShieldIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.75, ...p })}>
    <path d="M12 2.75 19.5 5.6v6.15c0 4.6-3.2 7.95-7.5 9.5-4.3-1.55-7.5-4.9-7.5-9.5V5.6z" fill="currentColor" fillOpacity="0.16" />
    <path d="M8.75 12.2l2.2 2.2 4.3-4.6" />
  </svg>
);
export const ShieldPlainIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.75, ...p })}>
    <path d="M12 2.75 19.5 5.6v6.15c0 4.6-3.2 7.95-7.5 9.5-4.3-1.55-7.5-4.9-7.5-9.5V5.6z" fill="currentColor" fillOpacity="0.16" />
  </svg>
);
export const MinusCircleIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.75, ...p })}>
    <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity="0.14" />
    <path d="M8 12h8" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const MenuIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const LogoutIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  </svg>
);
