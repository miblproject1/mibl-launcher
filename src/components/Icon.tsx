import type { SVGProps } from "react";

export type IconName =
  | "grid"
  | "home"
  | "cube"
  | "palette"
  | "settings"
  | "play"
  | "download"
  | "plus"
  | "clock"
  | "sparkles"
  | "users"
  | "trash"
  | "folder"
  | "refresh"
  | "check"
  | "alert"
  | "x"
  | "upload"
  | "search"
  | "server"
  | "gamepad"
  | "terminal"
  | "minimize"
  | "maximize"
  | "restore"
  | "close"
  | "edit"
  | "bolt"
  | "archive"
  | "package"
  | "dots"
  | "chevron"
  | "music"
  | "pause"
  | "external"
  | "copy"
  | "info"
  | "save"
  | "layers"
  | "wrench"
  | "globe"
  | "image"
  | "video"
  | "font"
  | "sun"
  | "gift";

const PATHS: Record<IconName, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  home: "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v9m0 0l8-4.5M12 12L4 7.5",
  palette:
    "M12 21a9 9 0 110-18c4.97 0 9 3.58 9 8 0 2.5-2 3.5-3.5 3.5H16a2 2 0 00-1.4 3.4c.5.6.2 1.6-.6 1.9-.6.2-1.3.2-2 .2z",
  settings:
    "M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.6a7 7 0 00-2.1 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 004 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2.1 1.2L10 21h4l.4-2.6a7 7 0 002.1-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  play: "M8 5.5v13l11-6.5L8 5.5z",
  download: "M12 3v12m0 0l4.5-4.5M12 15l-4.5-4.5M4 20h16",
  plus: "M12 5v14M5 12h14",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2",
  sparkles:
    "M12 3l1.8 4.8L18.5 9.5l-4.7 1.7L12 16l-1.8-4.8L5.5 9.5l4.7-1.7L12 3zM18.5 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z",
  users:
    "M16 20v-1.5c0-2-1.8-3.5-4-3.5H7c-2.2 0-4 1.5-4 3.5V20M9.5 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM17 11a3 3 0 100-6M21 20v-1.4c0-1.7-1.3-3-3-3.3",
  trash: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v5M14 11v5",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  refresh: "M20 6v5h-5M4 18v-5h5M6.5 9a7 7 0 0111.3-2.6L20 11M4 13l2.2 4.6A7 7 0 0017.5 15",
  check: "M4.5 12.5l5 5L20 6.5",
  alert: "M12 3l9 17H3l9-17zM12 9v5M12 17.5v.5",
  x: "M6 6l12 12M18 6L6 18",
  upload: "M12 21V9m0 0l-4.5 4.5M12 9l4.5 4.5M4 4h16",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM16.5 16.5L21 21",
  server:
    "M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01",
  gamepad:
    "M8 8h8a4 4 0 014 4v1a3 3 0 01-5.3 1.9L13 13h-2l-1.7 1.9A3 3 0 014 13v-1a4 4 0 014-4zM8 11v2M7 12h2M15.5 11.5h.01M17 13h.01",
  terminal: "M4 5h16v14H4zM7 9l3 3-3 3M13 15h4",
  minimize: "M5 12h14",
  maximize: "M5 5h14v14H5z",
  restore: "M8 8h11v11H8zM5 16V5h11",
  close: "M6 6l12 12M18 6L6 18",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM14.5 5.5l4 4",
  bolt: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
  archive: "M3 6h18v4H3zM5 10v10h14V10M10 14h4",
  package: "M12 3l8 4v10l-8 4-8-4V7l8-4zM4 7l8 4 8-4M12 11v10M8 5l8 4",
  dots: "M6 12h.01M12 12h.01M18 12h.01",
  chevron: "M9 6l6 6-6 6",
  music: "M9 18V6l10-2v12M9 18a3 3 0 11-3-3 3 3 0 013 3zM19 16a3 3 0 11-3-3 3 3 0 013 3z",
  pause: "M8 5v14M16 5v14",
  external: "M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5",
  copy: "M8 8h11v12H8zM5 16H4a1 1 0 01-1-1V4a1 1 0 011-1h11a1 1 0 011 1v1",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01",
  save: "M5 3h11l3 3v15H5zM8 3v6h7V3M8 15h8",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  wrench: "M14.5 6.5a4 4 0 105 5L12 19l-3 1-1-3 7.5-10.5z",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z",
  image: "M4 5h16v14H4zM4 15l4.5-4.5L13 15l2.5-2.5L20 17M8.5 9h.01",
  video: "M4 6h11v12H4zM15 10l5-3v10l-5-3",
  font: "M5 20L12 4l7 16M8.5 13.5h7",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
  gift: "M4 11h16v9H4zM3 8h18v3H3zM12 8v12M12 8C9 8 7 6.8 7 5.4 7 4.2 8 3.4 9.2 3.8 10.7 4.3 12 6.2 12 8zM12 8c3 0 5-1.2 5-2.6 0-1.2-1-2-2.2-1.6C13.3 4.3 12 6.2 12 8z",
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
