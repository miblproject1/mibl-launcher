import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Theme } from "../lib/api";
import { useUi } from "../context/UiContext";
import { useNotifications } from "../context/NotificationContext";
import { cn, errorText, fileUrl } from "../lib/utils";
import { Icon } from "./Icon";

const STARS = Array.from({ length: 42 }, (_, index) => {
  const x = (index * 37 + 11) % 100;
  const y = (index * 53 + 7) % 62;
  const delay = (index % 9) * 0.45;
  const size = index % 7 === 0 ? 4 : 3;
  return { x, y, delay, size };
});

const CLOUDS = [
  { top: "14%", width: 186, delay: "0s", opacity: 0.5 },
  { top: "24%", width: 260, delay: "-16s", opacity: 0.36 },
  { top: "34%", width: 140, delay: "-30s", opacity: 0.3 },
];

const SNOWFLAKES = Array.from({ length: 64 }, (_, index) => ({
  left: (index * 37 + 13) % 100,
  size: 2 + (index % 5),
  duration: 9 + (index % 8) * 1.35,
  delay: -((index * 1.73) % 20),
  drift: (index % 2 === 0 ? 1 : -1) * (14 + (index % 6) * 9),
  opacity: 0.35 + (index % 5) * 0.12,
}));

function ChristmasWorld() {
  return (
    <div className="christmas-world">
      <span className="christmas-moon" />
      <div className="christmas-tree-line" />
      <div className="christmas-drift christmas-drift-one" />
      <div className="christmas-drift christmas-drift-two" />
      <div className="christmas-drift christmas-drift-three" />
      <div className="christmas-snowfall">
        {SNOWFLAKES.map((flake, index) => (
          <span
            key={index}
            className="christmas-flake"
            style={
              {
                "--flake-left": `${flake.left}%`,
                "--flake-size": `${flake.size}px`,
                "--flake-duration": `${flake.duration}s`,
                "--flake-delay": `${flake.delay}s`,
                "--flake-drift": `${flake.drift}px`,
                "--flake-opacity": flake.opacity,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function ChristmasTree({
  lights,
  onToggle,
  label,
}: {
  lights: boolean;
  onToggle: () => void;
  label: string;
}) {
  const ornaments = [
    { x: 62, y: 180, color: "#ff6b6b" },
    { x: 95, y: 190, color: "#ffd166" },
    { x: 128, y: 180, color: "#6ee7a8" },
    { x: 74, y: 148, color: "#7dd3fc" },
    { x: 116, y: 148, color: "#fca5a5" },
    { x: 95, y: 136, color: "#c4b5fd" },
    { x: 82, y: 108, color: "#ffd166" },
    { x: 108, y: 108, color: "#6ee7a8" },
    { x: 95, y: 84, color: "#7dd3fc" },
  ];
  const garland = [
    { x: 34, y: 192, color: "#ff6b6b" },
    { x: 50, y: 176, color: "#ffd166" },
    { x: 64, y: 164, color: "#6ee7a8" },
    { x: 78, y: 148, color: "#7dd3fc" },
    { x: 92, y: 132, color: "#c4b5fd" },
    { x: 104, y: 116, color: "#ff6b6b" },
    { x: 112, y: 100, color: "#ffd166" },
    { x: 104, y: 84, color: "#6ee7a8" },
    { x: 96, y: 68, color: "#7dd3fc" },
  ];

  return (
    <div className="christmas-tree-wrap">
      <button
        type="button"
        className="christmas-tree-button"
        onClick={onToggle}
        aria-label={label}
        aria-pressed={lights}
        title={label}
      >
        <svg
          width="176"
          height="246"
          viewBox="0 0 190 252"
          fill="none"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="christmas-tree-glow-bg" cx="50%" cy="60%" r="50%">
              <stop offset="0%" stopColor="rgba(255, 226, 154, 0.28)" />
              <stop offset="100%" stopColor="rgba(255, 226, 154, 0)" />
            </radialGradient>
          </defs>
          <ellipse cx="95" cy="196" rx="92" ry="62" fill="url(#christmas-tree-glow-bg)" />

          {/* Ствол и кадка */}
          <rect x="87" y="194" width="16" height="34" fill="#5b3a26" />
          <rect x="91" y="194" width="4" height="34" fill="#7a5236" />
          <polygon points="76,224 114,224 108,248 82,248" fill="#a3412f" />
          <polygon points="76,224 114,224 112,230 78,230" fill="#c25a45" />
          <ellipse cx="95" cy="248" rx="62" ry="8" fill="#eaf5ff" opacity="0.7" />

          {/* Ярусы ёлки */}
          <polygon points="24,202 95,116 166,202" fill="#1c5638" />
          <polygon points="38,160 95,82 152,160" fill="#206141" />
          <polygon points="52,120 95,46 138,120" fill="#24704a" />

          {/* Пиксельный снег на ветках */}
          <polygon
            points="24,202 40,186 54,196 68,180 82,194 95,180 108,194 122,180 136,196 150,186 166,202 150,206 95,198 40,206"
            fill="#eaf5ff"
            opacity="0.94"
          />
          <polygon
            points="38,160 52,148 64,156 76,144 88,156 95,146 102,156 114,144 126,156 138,148 152,160 136,164 95,158 54,164"
            fill="#f3faff"
            opacity="0.9"
          />
          <polygon
            points="52,120 64,110 74,116 84,106 95,116 106,106 116,116 126,110 138,120 124,123 95,118 66,123"
            fill="#f8fdff"
            opacity="0.9"
          />

          {/* Игрушки */}
          {ornaments.map((ornament, index) => (
            <circle
              key={`${ornament.x}-${ornament.y}`}
              cx={ornament.x}
              cy={ornament.y}
              r="4.2"
              fill={ornament.color}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1"
              opacity="0.95"
              style={{ filter: `drop-shadow(0 0 3px ${ornament.color})` }}
            >
              <animate
                attributeName="opacity"
                values="0.72;1;0.72"
                dur="3.2s"
                begin={`${index * 0.18}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}

          {/* Звезда */}
          <g className="christmas-tree-star" style={{ filter: "drop-shadow(0 0 10px #ffe8a3)" }}>
            <polygon
              points="95,8 100,22 115,22 103,31 108,45 95,36 82,45 87,31 75,22 90,22"
              fill="#ffe28a"
            />
            <polygon
              points="95,15 98,23 106,23 100,28 102,35 95,30 88,35 90,28 84,23 92,23"
              fill="#fff8d6"
            />
          </g>

          {/* Гирлянда — появляется по клику и сохраняется */}
          {lights && (
            <g className="christmas-tree-lights">
              <path
                d="M34 192 L50 176 L64 164 L78 148 L92 132 L104 116 L112 100 L104 84 L96 68"
                stroke="rgba(255, 232, 163, 0.65)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="3 3"
              />
              {garland.map((bulb, index) => (
                <g key={`${bulb.x}-${bulb.y}`}>
                  <circle
                    cx={bulb.x}
                    cy={bulb.y}
                    r="5.5"
                    fill={bulb.color}
                    opacity="0.25"
                  />
                  <circle
                    className="christmas-bulb"
                    cx={bulb.x}
                    cy={bulb.y}
                    r="3.1"
                    fill={bulb.color}
                    style={{
                      animationDelay: `${(index % 6) * 0.22}s`,
                      filter: `drop-shadow(0 0 5px ${bulb.color})`,
                    }}
                  />
                </g>
              ))}
            </g>
          )}
        </svg>
      </button>
      <span className="christmas-tree-hint">{label}</span>
    </div>
  );
}


function PixelWorld() {
  return (
    <div className="pixel-world">
      {STARS.map((star, index) => (
        <span
          key={index}
          className="pixel-star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
      <span className="pixel-moon" />
      {CLOUDS.map((cloud, index) => (
        <span
          key={index}
          className="pixel-cloud"
          style={{
            top: cloud.top,
            width: cloud.width,
            animationDelay: cloud.delay,
            opacity: cloud.opacity,
          }}
        />
      ))}
      <div className="pixel-hills" />
      <div className="pixel-grid-floor" />
      <div className="pixel-ground" />
    </div>
  );
}

export default function Background({
  theme,
  lifted = false,
  showTree = true,
}: {
  theme: Theme;
  lifted?: boolean;
  /** Новогодняя ёлка живёт только на «Главной», чтобы не перекрывать другие вкладки. */
  showTree?: boolean;
}) {
  const { pixel, t, christmas, treeLights, setTreeLights } = useUi();
  const { addNotification } = useNotifications();
  // Все локальные пути Windows -> asset:// URL (assetProtocol в tauri.conf.json).
  const image = fileUrl(theme.bg_image);
  const video = fileUrl(theme.bg_video);
  const audio = fileUrl(theme.audio);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, theme.volume));
  }, [theme.volume]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) {
      setPlaying(false);
      return;
    }
    if (!audio) {
      element.pause();
      setPlaying(false);
      return;
    }

    // Синхронизируем подпись кнопки с реальным состоянием <audio>.
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("playing", onPlay);
    element.addEventListener("ended", onPause);
    setPlaying(!element.paused);
    element.volume = Math.min(1, Math.max(0, theme.volume));

    const tryPlay = () => {
      element.play().catch(() => setPlaying(false));
    };
    element.load();
    tryPlay();
    // Автовоспроизведение разрешено после первого действия пользователя.
    const onInteract = () => {
      if (element.paused) tryPlay();
    };
    document.addEventListener("pointerdown", onInteract, { once: true });

    return () => {
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("playing", onPlay);
      element.removeEventListener("ended", onPause);
      document.removeEventListener("pointerdown", onInteract);
    };
  }, [audio]);

  const toggleAudio = () => {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) {
      element
        .play()
        .then(() => setPlaying(true))
        .catch((error) => {
          setPlaying(false);
          addNotification({
            type: "error",
            message: t("background.musicError", { error: errorText(error) }),
          });
        });
    } else {
      element.pause();
      setPlaying(false);
    }
  };

  const blur = Math.max(0, theme.bg_blur || 0);
  const dim = Math.min(1, Math.max(0, theme.bg_dim ?? 0.45));

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ backgroundColor: theme.bg }}>
        {christmas ? (
          <ChristmasWorld />
        ) : video ? (
          <video
            key={video}
            className="absolute inset-0 h-full w-full object-cover"
            src={video}
            autoPlay
            loop
            muted={theme.bg_video_muted}
            playsInline
            style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined, transform: blur > 0 ? "scale(1.06)" : undefined }}
          />
        ) : image ? (
          <img
            key={image}
            className="absolute inset-0 h-full w-full object-cover"
            src={image}
            alt=""
            style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined, transform: blur > 0 ? "scale(1.06)" : undefined }}
          />
        ) : pixel ? (
          <PixelWorld />
        ) : (
          <>
            <div
              className="float-slow absolute -left-[18%] top-[-24%] h-[62vh] w-[62vw] rounded-full opacity-55 blur-[80px]"
              style={{ background: `radial-gradient(circle at 40% 40%, ${theme.accent}, transparent 68%)` }}
            />
            <div
              className="float-slow absolute -right-[16%] bottom-[-28%] h-[64vh] w-[56vw] rounded-full opacity-45 blur-[90px]"
              style={{
                background: `radial-gradient(circle at 50% 50%, ${theme.panel2}, transparent 66%)`,
                animationDelay: "-7s",
              }}
            />
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
                backgroundSize: "42px 42px",
                maskImage: "radial-gradient(circle at 50% 35%, black, transparent 78%)",
              }}
            />
          </>
        )}

        <div className="absolute inset-0" style={{ backgroundColor: `rgba(3, 4, 9, ${christmas ? Math.min(dim, 0.22) : dim})` }} />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}12 0%, transparent 42%, ${theme.panel2}30 100%)`,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/45 to-transparent" />
      </div>

      {christmas && showTree && (
        <ChristmasTree
          lights={treeLights}
          onToggle={() => setTreeLights(!treeLights)}
          label={t("christmas.treeHint")}
        />
      )}

      {audio && (
        <audio ref={audioRef} src={audio} loop preload="auto" />
      )}

      {audio && (
        <button
          type="button"
          onClick={toggleAudio}
          title={playing ? t("background.musicOffTitle") : t("background.musicOnTitle")}
          aria-label={playing ? t("background.musicOffTitle") : t("background.musicOnTitle")}
          className={cn(
            "glass focus-ring group fixed left-3 z-[70] flex h-8 items-center overflow-hidden rounded-full px-2 text-[10.5px] font-semibold text-white/85 transition-colors hover:text-white",
            lifted ? "bottom-[92px]" : "bottom-3",
            playing && "border-[var(--accent-line)]",
          )}
        >
          <Icon
            name={playing ? "music" : "pause"}
            size={13}
            className={cn("shrink-0", playing && "text-[var(--accent)]")}
          />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:ml-1.5 group-hover:max-w-[140px] group-hover:opacity-100">
            {playing ? t("background.musicPlaying") : t("background.musicPaused")}
          </span>
        </button>
      )}
    </>
  );
}
