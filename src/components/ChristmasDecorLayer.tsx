import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import {
  useUi,
  type GarlandStyle,
} from "../context/UiContext";
import { cn } from "../lib/utils";

const GARLAND_COLORS: Record<GarlandStyle, string[]> = {
  classic: ["#ff5d5d", "#ffd166", "#6ee7a8", "#60a5fa", "#c084fc"],
  gold: ["#ffd166", "#ffe29a", "#f7b733", "#fff3c4", "#fbbf24"],
  ice: ["#8be9ff", "#c9f7ff", "#6fd3ff", "#e8fbff", "#a5f3fc"],
};

const BULBS = [
  { x: 12, y: 22 },
  { x: 30, y: 28 },
  { x: 48, y: 22 },
  { x: 66, y: 28 },
  { x: 84, y: 22 },
  { x: 102, y: 28 },
  { x: 120, y: 22 },
  { x: 138, y: 28 },
  { x: 156, y: 22 },
  { x: 174, y: 28 },
  { x: 192, y: 22 },
  { x: 210, y: 28 },
  { x: 228, y: 22 },
];

/** Гирлянда-образец: используется и в коробке настроек, и на рабочем столе. */
export function GarlandSvg({
  style,
  className,
}: {
  style: GarlandStyle;
  className?: string;
}) {
  const colors = GARLAND_COLORS[style];
  const rawId = useId();
  const glowId = `garland-glow-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 240 52"
      width={240}
      height={52}
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ overflow: "visible" }}
    >
      <defs>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M2 12 C 20 32 40 32 60 12 S 100 32 120 12 S 160 32 180 12 S 220 32 238 12"
        stroke="rgba(226, 236, 255, 0.42)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M2 12 C 20 32 40 32 60 12 S 100 32 120 12 S 160 32 180 12 S 220 32 238 12"
        stroke="rgba(255, 255, 255, 0.16)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.35"
      />
      <g filter={`url(#${glowId})`}>
        {BULBS.map((bulb, index) => {
          const color = colors[index % colors.length];
          return (
            <g key={`${bulb.x}-${bulb.y}`}>
              <rect
                x={bulb.x - 1.6}
                y={bulb.y - 4.6}
                width="3.2"
                height="2.6"
                rx="0.6"
                fill="#cbd5e1"
              />
              <circle
                className="christmas-bulb"
                cx={bulb.x}
                cy={bulb.y}
                r="3.1"
                fill={color}
                style={{
                  animationDelay: `${(index % 5) * 0.24}s`,
                  filter: `drop-shadow(0 0 4px ${color})`,
                }}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

interface SnowParticle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

export default function ChristmasDecorLayer() {
  const {
    christmas,
    garlands,
    removeGarland,
    addGarland,
    garlandDraft,
    setGarlandDraft,
    t,
  } = useUi();
  const [particles, setParticles] = useState<SnowParticle[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  // Снежинки при нажатии на любую кнопку. Слушаем capture-фазой, чтобы эффект
  // срабатывал даже у кнопок, которые останавливают всплытие события.
  useEffect(() => {
    if (!christmas) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      const count = 7 + Math.floor(Math.random() * 4);
      const burst: SnowParticle[] = Array.from({ length: count }, (_, index) => ({
        id: nextId.current++,
        x: rect.left + 6 + Math.random() * Math.max(1, rect.width - 12),
        y: rect.top + Math.random() * Math.max(2, rect.height * 0.45),
        dx: (Math.random() - 0.5) * 70,
        dy: 70 + Math.random() * 90,
        size: index % 4 === 0 ? 5 : 3 + Math.random() * 2,
        duration: 950 + Math.random() * 700,
        delay: index * 18,
        color: index % 5 === 0 ? "#bfe6ff" : "#ffffff",
      }));
      setParticles((prev) => [...prev.slice(-110), ...burst]);
      const ids = new Set(burst.map((particle) => particle.id));
      const timer = window.setTimeout(() => {
        setParticles((prev) => prev.filter((particle) => !ids.has(particle.id)));
        timers.current = timers.current.filter((item) => item !== timer);
      }, 2100);
      timers.current.push(timer);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [christmas]);

  useEffect(() => {
    if (!christmas) setParticles([]);
  }, [christmas]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, []);

  // Перетаскивание гирлянды из коробки в настройках.
  const dragging = garlandDraft !== null;
  const draftRef = useRef(garlandDraft);
  useEffect(() => {
    draftRef.current = garlandDraft;
  }, [garlandDraft]);

  useEffect(() => {
    if (!dragging) return;
    const start = draftRef.current;
    if (!start) return;
    let moved = false;

    const position = (event: PointerEvent) => ({
      x: Math.min(99, Math.max(1, (event.clientX / Math.max(1, window.innerWidth)) * 100)),
      y: Math.min(99, Math.max(1, (event.clientY / Math.max(1, window.innerHeight)) * 100)),
    });

    const onMove = (event: PointerEvent) => {
      const next = position(event);
      if (Math.abs(next.x - start.x) > 0.7 || Math.abs(next.y - start.y) > 0.7) {
        moved = true;
      }
      const draft = draftRef.current;
      if (draft) setGarlandDraft({ ...draft, ...next });
    };

    const onUp = (event: PointerEvent) => {
      const draft = draftRef.current;
      if (moved && draft) {
        const next = position(event);
        addGarland(draft.style, next.x, next.y);
      }
      setGarlandDraft(null);
    };

    const onCancel = () => setGarlandDraft(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    document.documentElement.classList.add("christmas-dragging");
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("christmas-dragging");
    };
  }, [dragging, addGarland, setGarlandDraft]);

  if (!christmas) return null;

  const remove = (event: ReactMouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    removeGarland(id);
  };

  return (
    <div className="christmas-decor-layer pointer-events-none fixed inset-0 z-[95] overflow-hidden">
      {garlands.map((garland) => (
        <div
          key={garland.id}
          className="christmas-garland pointer-events-auto"
          style={{ left: `${garland.x}%`, top: `${garland.y}%` }}
          title={t("christmas.removeHint")}
          onDoubleClick={(event) => remove(event, garland.id)}
          onContextMenu={(event) => remove(event, garland.id)}
        >
          <GarlandSvg style={garland.style} />
        </div>
      ))}

      {garlandDraft && (
        <div
          className={cn(
            "christmas-garland christmas-garland-draft pointer-events-none",
            "opacity-80",
          )}
          style={{ left: `${garlandDraft.x}%`, top: `${garlandDraft.y}%` }}
        >
          <GarlandSvg style={garlandDraft.style} />
        </div>
      )}

      {particles.map((particle) => (
        <span
          key={particle.id}
          className="christmas-snow-particle"
          style={
            {
              left: particle.x,
              top: particle.y,
              "--snow-dx": `${particle.dx}px`,
              "--snow-dy": `${particle.dy}px`,
              "--snow-size": `${particle.size}px`,
              "--snow-duration": `${particle.duration}ms`,
              animationDelay: `${particle.delay}ms`,
              background: particle.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
