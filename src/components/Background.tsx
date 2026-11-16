import { useEffect, useRef, useState } from "react";
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

export default function Background({ theme, lifted = false }: { theme: Theme; lifted?: boolean }) {
  const { pixel, t } = useUi();
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
        {video ? (
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

        <div className="absolute inset-0" style={{ backgroundColor: `rgba(3, 4, 9, ${dim})` }} />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}12 0%, transparent 42%, ${theme.panel2}30 100%)`,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/45 to-transparent" />
      </div>

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
