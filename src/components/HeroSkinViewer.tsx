import { useEffect, useRef, useState } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import type { AccountView } from "../lib/api";
import { useUi } from "../context/UiContext";
import { cn } from "../lib/utils";
import { Icon } from "./Icon";
import { Badge, Button, Spinner } from "./ui";

interface Props {
  account: AccountView | null;
  onOpenSkinSettings: () => void;
  className?: string;
}

const MAX_YAW = 0.82; // ~47° влево/вправо
const MAX_PITCH = 0.32; // ~18° вверх/вниз
const LOOK_EASE = 0.11;

/**
 * skinview3d создаёт WebGLRenderer без параметра alpha, из-за чего прозрачный
 * фон превращается в чёрный прямоугольник. Перехватываем getContext у canvas,
 * чтобы принудительно включить alpha — тогда стеклянная панель просвечивает.
 */
function createAlphaCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const original = canvas.getContext.bind(canvas) as (
    type: string,
    attributes?: WebGLContextAttributes,
  ) => RenderingContext | null;

  canvas.getContext = ((type: string, attributes?: WebGLContextAttributes) =>
    original(type, {
      ...(attributes ?? {}),
      alpha: true,
      premultipliedAlpha: true,
    })) as unknown as HTMLCanvasElement["getContext"];

  return canvas;
}

let cachedDefaultSkin: string | null = null;

/**
 * Встроенный скин Стива, нарисованный на canvas 64×64.
 * Нужен как гарантированный офлайн-фолбэк, чтобы модель никогда не была
 * невидимой или чёрной, даже если у аккаунта нет скина и нет сети.
 */
function defaultSkinDataUrl(): string {
  if (cachedDefaultSkin !== null) return cachedDefaultSkin;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cachedDefaultSkin = "";
    return cachedDefaultSkin;
  }

  const fill = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  const SKIN = "#c69c6d";
  const SKIN_SHADOW = "#b2865a";
  const HAIR = "#3a2a1a";
  const SHIRT = "#23a3a3";
  const SHIRT_DARK = "#1a8080";
  const PANTS = "#3b3b8f";
  const PANTS_DARK = "#2d2d70";
  const SHOE = "#454545";
  const EYE = "#f5f5f5";
  const PUPIL = "#3b5b9a";
  const MOUTH = "#7c4a32";

  // Базовая раскладка 64×64: (ширина 2d+2w, высота d+h).
  fill(0, 0, 32, 16, HAIR); // голова
  fill(16, 16, 24, 16, SHIRT); // тело
  fill(40, 16, 16, 16, SKIN); // правая рука
  fill(32, 48, 16, 16, SKIN); // левая рука
  fill(0, 16, 16, 16, PANTS); // правая нога
  fill(16, 48, 16, 16, PANTS); // левая нога

  // Голова: лицо, бока, шея.
  fill(8, 8, 8, 8, SKIN); // лицо
  fill(8, 8, 8, 2, HAIR); // чёлка
  fill(0, 11, 8, 5, SKIN); // правый бок ниже линии волос
  fill(16, 11, 8, 5, SKIN); // левый бок
  fill(16, 0, 8, 8, SKIN); // нижняя грань (шея)
  fill(9, 12, 2, 1, EYE);
  fill(10, 12, 1, 1, PUPIL);
  fill(13, 12, 2, 1, EYE);
  fill(13, 12, 1, 1, PUPIL);
  fill(11, 13, 2, 1, SKIN_SHADOW); // нос
  fill(10, 14, 4, 1, MOUTH); // рот

  // Тело: воротник и нижняя грань темнее.
  fill(20, 16, 8, 4, SHIRT_DARK);
  fill(28, 16, 8, 4, SHIRT_DARK);

  // Рукава на руках (верхняя часть), кисти остаются кожей.
  fill(44, 16, 4, 4, SHIRT);
  fill(40, 20, 16, 4, SHIRT);
  fill(36, 48, 4, 4, SHIRT);
  fill(32, 52, 16, 4, SHIRT);

  // Обувь.
  fill(0, 30, 16, 2, SHOE);
  fill(8, 16, 4, 4, SHOE);
  fill(16, 62, 16, 2, SHOE);
  fill(24, 48, 4, 4, SHOE);
  fill(20, 29, 8, 1, PANTS_DARK);

  cachedDefaultSkin = canvas.toDataURL("image/png");
  return cachedDefaultSkin;
}

export default function HeroSkinViewer({ account, onOpenSkinSettings, className }: Props) {
  const { t } = useUi();
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const isEly = account?.type === "ely";
  const isMicrosoft = account?.type === "microsoft";
  const accountName = account?.name ?? null;
  const elyNick = isEly ? account?.ely || account?.name || null : null;
  const localSkin = account?.skin_data_url ?? null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setReady(false);
    setFailed(false);

    const canvas = createAlphaCanvas();
    canvas.style.background = "transparent";
    canvas.style.display = "block";
    canvas.style.outline = "none";

    const bounds = host.getBoundingClientRect();
    const width = Math.max(220, Math.round(bounds.width));
    const height = Math.max(260, Math.round(bounds.height));

    let viewer: SkinViewer;
    try {
      viewer = new SkinViewer({
        canvas,
        width,
        height,
        animation: new IdleAnimation(),
        zoom: 0.85,
        enableControls: true,
        pixelRatio: "match-device",
      });
    } catch (error) {
      console.error("HeroSkinViewer:", error);
      setFailed(true);
      return;
    }

    // Мягкое освещение и вращение только по ЛКМ, без зума колесом.
    viewer.cameraLight.intensity = 0.95;
    viewer.globalLight.intensity = 2.6;
    viewer.autoRotate = false;
    viewer.renderer.setClearAlpha(0);
    if (!viewer.renderer.getContext().getContextAttributes()?.alpha) {
      // Страховка: если контекст всё же непрозрачный, красим фон под панель,
      // чтобы не получить чёрный прямоугольник поверх стекла.
      const panel = getComputedStyle(host).getPropertyValue("--panel").trim();
      viewer.renderer.setClearColor(panel || "#0f0f17", 1);
    }
    viewer.controls.enablePan = false;
    viewer.controls.enableZoom = false;
    viewer.controls.enableDamping = true;
    viewer.controls.dampingFactor = 0.08;
    viewer.controls.rotateSpeed = 0.8;
    viewer.controls.minPolarAngle = Math.PI * 0.28;
    viewer.controls.maxPolarAngle = Math.PI * 0.7;

    canvas.style.width = "100%";
    canvas.style.height = "100%";
    host.appendChild(canvas);

    let disposed = false;
    let frame = 0;

    // --- Слежение головой за курсором -------------------------------------
    const look = { targetX: 0, targetY: 0, x: 0, y: 0 };
    const head = viewer.playerObject.skin.head;

    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const nx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const ny = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      look.targetX = Math.max(-1, Math.min(1, nx));
      look.targetY = Math.max(-1, Math.min(1, ny));
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const clockStart = performance.now();
    const animateLook = () => {
      if (disposed) return;
      const t = (performance.now() - clockStart) / 1000;

      look.x += (look.targetX - look.x) * LOOK_EASE;
      look.y += (look.targetY - look.y) * LOOK_EASE;

      // Лёгкое «дыхание» — даже когда мышь неподвижна, поворот остаётся живым.
      const sway = Math.sin(t * 0.9) * 0.018;
      const breathe = Math.sin(t * 0.65 + 1.2) * 0.012;

      head.rotation.y = look.x * MAX_YAW + sway;
      head.rotation.x = look.y * MAX_PITCH + breathe;

      frame = requestAnimationFrame(animateLook);
    };
    frame = requestAnimationFrame(animateLook);

    // --- Адаптивный размер -------------------------------------------------
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (disposed) return;
        const rect = host.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        viewer.setSize(w, h);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
      });
      resizeObserver.observe(host);
    }

    // --- Скин: локальный файл → Ely.by по нику → встроенный Стив -----------
    const candidates: Array<{ src: string; model: "auto-detect" | "default" }> = [];
    if (localSkin) candidates.push({ src: localSkin, model: "auto-detect" });
    if (elyNick) {
      candidates.push({
        src: `https://skinsystem.ely.by/skins/${encodeURIComponent(elyNick)}.png`,
        model: "auto-detect",
      });
    }
    const fallback = defaultSkinDataUrl();
    if (fallback) candidates.push({ src: fallback, model: "default" });

    const applySkin = async () => {
      for (const candidate of candidates) {
        try {
          await viewer.loadSkin(candidate.src, { model: candidate.model });
          if (disposed) return;
          setReady(true);
          return;
        } catch {
          // Пробуем следующий источник скина.
        }
      }
      if (disposed) return;
      try {
        viewer.resetSkin();
      } catch {
        // Контекст уже мог быть потерян.
      }
      setFailed(true);
    };
    void applySkin();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMouseMove);
      resizeObserver?.disconnect();
      try {
        viewer.dispose();
      } catch {
        // WebGL-контекст мог быть уже потерян.
      }
      if (canvas.parentElement === host) host.removeChild(canvas);
      host.replaceChildren();
    };
  }, [localSkin, elyNick]);

  return (
    <section
      className={cn(
        "glass relative flex min-h-[388px] flex-col overflow-hidden",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 12%, var(--accent-soft), transparent 62%), linear-gradient(180deg, transparent 58%, rgba(0,0,0,0.32))",
        }}
      />

      <header className="relative z-10 flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] muted">{t("hero.character")}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--fg)]">
            <Icon name="sparkles" size={13} className="text-[var(--accent)]" />
            {t("hero.followCursor")}
          </div>
        </div>
        <Badge tone={isEly || isMicrosoft ? "accent" : "neutral"}>
          {isMicrosoft ? t("kind.microsoft") : isEly ? t("kind.ely") : t("kind.offline")}
        </Badge>
      </header>

      <div className="relative z-[1] min-h-0 flex-1">
        <div
          ref={hostRef}
          className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
          aria-label={t("hero.aria")}
        />
        {!ready && !failed && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-[10.5px] text-white/55">
            <Spinner size={18} />
            {t("hero.loading")}
          </div>
        )}
        {failed && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/55">
            <Icon name="users" size={42} />
            <span className="text-[10.5px]">{t("hero.failed")}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1.5 text-[9px] font-semibold tracking-wide text-white/35">
          <Icon name="refresh" size={10} />
          {t("hero.rotateHint")}
        </div>
      </div>

      <footer className="relative z-10 border-t border-white/10 bg-black/20 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon name="users" size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold leading-tight text-[var(--fg)]">
              {accountName ?? t("hero.guest")}
            </div>
            <div className="truncate text-[9.5px] muted">
              {accountName
                ? isMicrosoft
                  ? t("hero.licenseFull")
                  : isEly
                    ? t("hero.elyAccount")
                    : t("hero.offlineAccount")
                : t("hero.noAccount")}
            </div>
          </div>
          <Button variant="soft" size="xs" icon="image" onClick={onOpenSkinSettings}>
            {accountName ? t("hero.skin") : t("hero.add")}
          </Button>
        </div>
      </footer>
    </section>
  );
}
