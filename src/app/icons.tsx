import type { ReactNode, SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
}

function make(name: string, children: ReactNode) {
  function Icon({ size = 20, strokeWidth = 1.5, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...rest}
      >
        {children}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const IconRadar = make(
  "IconRadar",
  <>
    <circle cx="12" cy="12" r="9.2" opacity="0.5" />
    <circle cx="12" cy="12" r="5.6" opacity="0.8" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <path d="M12 12l6.5-6.5" />
  </>,
);
export const IconGrid = make(
  "IconGrid",
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </>,
);
export const IconBookmark = make(
  "IconBookmark",
  <path d="M18 21l-6-4.2L6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5z" />,
);
export const IconSliders = make(
  "IconSliders",
  <>
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="14" cy="6" r="2.2" fill="var(--surface, #fff)" />
    <circle cx="8" cy="12" r="2.2" fill="var(--surface, #fff)" />
    <circle cx="16" cy="18" r="2.2" fill="var(--surface, #fff)" />
  </>,
);
export const IconBell = make(
  "IconBell",
  <>
    <path d="M18 16v-5.5a6 6 0 0 0-12 0V16l-1.6 2.3h15.2z" />
    <path d="M10.4 20.5a1.8 1.8 0 0 0 3.2 0" />
  </>,
);
export const IconSearch = make(
  "IconSearch",
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M15.8 15.8L20.5 20.5" />
  </>,
);
export const IconMapPin = make(
  "IconMapPin",
  <>
    <path d="M12 21.5S5 15.2 5 10.2a7 7 0 0 1 14 0c0 5-7 11.3-7 11.3z" />
    <circle cx="12" cy="10" r="2.5" />
  </>,
);
export const IconBuilding = make(
  "IconBuilding",
  <>
    <rect x="6" y="3.5" width="12" height="17" rx="1" />
    <path d="M9.5 7.5h1.5M13 7.5h1.5M9.5 11h1.5M13 11h1.5M9.5 14.5h1.5M13 14.5h1.5M10.5 20.5v-3h3v3" />
  </>,
);
export const IconX = make("IconX", <path d="M6 6l12 12M18 6L6 18" />);
export const IconChevronDown = make("IconChevronDown", <path d="M6 9.5l6 6 6-6" />);
export const IconChevronRight = make("IconChevronRight", <path d="M9.5 6l6 6-6 6" />);
export const IconBed = make(
  "IconBed",
  <>
    <path d="M3 6.5V18M3 14.5h18M21 18v-4.5a3.5 3.5 0 0 0-3.5-3.5H9.5v4.5" />
    <circle cx="6.2" cy="11" r="1.4" />
  </>,
);
export const IconRuler = make(
  "IconRuler",
  <>
    <path d="M3.5 16.5L16.5 3.5l4 4L7.5 20.5z" />
    <path d="M7 13l1.6 1.6M10 10l1.6 1.6M13 7l1.6 1.6" />
  </>,
);
export const IconCalendar = make(
  "IconCalendar",
  <>
    <rect x="4" y="5.5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </>,
);
export const IconTrendDown = make(
  "IconTrendDown",
  <>
    <path d="M3 7.5l6 6 4-4 7.5 7.5" />
    <path d="M15 17h5.5v-5.5" />
  </>,
);
export const IconTrendUp = make(
  "IconTrendUp",
  <>
    <path d="M3 16.5l6-6 4 4L20.5 7" />
    <path d="M15 7h5.5v5.5" />
  </>,
);
export const IconScale = make(
  "IconScale",
  <>
    <path d="M12 4v16.5M7 20.5h10M5 7h14" />
    <path d="M5 7l-2.4 5.5a2.8 2.8 0 0 0 4.8 0L5 7zM19 7l-2.4 5.5a2.8 2.8 0 0 0 4.8 0L19 7z" />
  </>,
);
export const IconHash = make(
  "IconHash",
  <path d="M10 4L8 20M16 4l-2 16M4.5 9h16M3.5 15h16" />,
);
export const IconRefresh = make(
  "IconRefresh",
  <>
    <path d="M21 4.5V10h-5.5" />
    <path d="M20.5 10a8.7 8.7 0 1 0-2 6.5" />
  </>,
);
export const IconClock = make(
  "IconClock",
  <>
    <circle cx="12" cy="12" r="8.7" />
    <path d="M12 7v5.2l3.2 2" />
  </>,
);
export const IconArrowLeft = make("IconArrowLeft", <path d="M19 12H5M11 18l-6-6 6-6" />);
export const IconHeart = make(
  "IconHeart",
  <path d="M12 20.3S3.6 15 2.8 10.5A4.9 4.9 0 0 1 12 7a4.9 4.9 0 0 1 9.2 3.5C20.4 15 12 20.3 12 20.3z" />,
);
export const IconPhone = make(
  "IconPhone",
  <path d="M5 3.5h3.8l1.6 4.4-2.2 1.7a13.4 13.4 0 0 0 6.2 6.2l1.7-2.2 4.4 1.6V19a1.9 1.9 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a1.9 1.9 0 0 1 2-2z" />,
);
export const IconMoon = make(
  "IconMoon",
  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
);
export const IconBan = make(
  "IconBan",
  <>
    <circle cx="12" cy="12" r="8.7" />
    <path d="M6 6l12.4 12.4" />
  </>,
);
export const IconMail = make(
  "IconMail",
  <>
    <rect x="3" y="5" width="18" height="14.5" rx="2" />
    <path d="M3 7.5l9 6 9-6" />
  </>,
);
export const IconPhoneDevice = make(
  "IconPhoneDevice",
  <>
    <rect x="7" y="2.5" width="10" height="19" rx="2" />
    <path d="M11 18.5h2" />
  </>,
);
export const IconPlus = make("IconPlus", <path d="M12 5v14M5 12h14" />);
export const IconCheck = make("IconCheck", <path d="M5 12.5l4.7 4.7L19.5 7" />);
export const IconExternal = make(
  "IconExternal",
  <>
    <path d="M14 4.5h5.5V10M19.5 4.5L11 13" />
    <path d="M9.5 5.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2v-3.5" />
  </>,
);
export const IconList = make(
  "IconList",
  <path d="M8.5 6h12M8.5 12h12M8.5 18h12M4 6h.01M4 12h.01M4 18h.01" />,
);
export const IconMap = make(
  "IconMap",
  <>
    <path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13l-5.5 2z" />
    <path d="M9 4.5v13M15 6.5v13" />
  </>,
);
export const IconShare = make(
  "IconShare",
  <>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4" />
  </>,
);
export const IconZap = make(
  "IconZap",
  <path d="M13 2.5L4.5 14H11l-1 7.5L18.5 10H12z" />,
);
export const IconTarget = make(
  "IconTarget",
  <>
    <circle cx="12" cy="12" r="8.7" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </>,
);
export const IconPercent = make(
  "IconPercent",
  <>
    <path d="M18.5 5.5l-13 13" />
    <circle cx="7" cy="7" r="2.6" />
    <circle cx="17" cy="17" r="2.6" />
  </>,
);
export const IconBriefcase = make(
  "IconBriefcase",
  <>
    <rect x="3" y="7.5" width="18" height="13" rx="2" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12.5h18" />
  </>,
);
export const IconDatabase = make(
  "IconDatabase",
  <>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
    <path d="M4 5.5V18.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.5" />
    <path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8" />
  </>,
);
export const IconSend = make(
  "IconSend",
  <path d="M21.5 2.5L11 13M21.5 2.5L15 21l-4-8-8.5-4z" />,
);
export const IconEye = make(
  "IconEye",
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
);
export const IconLogout = make(
  "IconLogout",
  <>
    <path d="M9.5 12h11M17 8.5l3.5 3.5-3.5 3.5" />
    <path d="M13 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
  </>,
);
