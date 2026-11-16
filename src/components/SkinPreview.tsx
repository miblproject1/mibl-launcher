import { useEffect, useRef, useState } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import { cn } from "../lib/utils";
import { useUi } from "../context/UiContext";
import { Icon } from "./Icon";

export function SkinPreview({
  url,
  width = 210,
  height = 268,
  className,
}: {
  url: string | null | undefined;
  width?: number;
  height?: number;
  className?: string;
}) {
  const { t } = useUi();
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let viewer: SkinViewer | null = null;
    setFailed(false);

    try {
      viewer = new SkinViewer({
        width,
        height,
        skin: url || undefined,
        animation: new IdleAnimation(),
        zoom: 0.92,
        enableControls: true,
        pixelRatio: "match-device",
      });
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.55;
      viewer.canvas.style.width = "100%";
      viewer.canvas.style.height = "100%";
      viewer.canvas.style.display = "block";
      viewer.canvas.style.outline = "none";
      host.appendChild(viewer.canvas);
      if (!url) viewer.resetSkin();
    } catch (error) {
      console.error("SkinViewer:", error);
      setFailed(true);
    }

    return () => {
      try {
        viewer?.dispose();
        if (viewer && viewer.canvas.parentElement === host) {
          host.removeChild(viewer.canvas);
        }
      } catch {
        // WebGL context may already be gone.
      }
      host.replaceChildren();
    };
  }, [url, width, height]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-black/15",
        className,
      )}
      style={{ width, height }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, var(--accent-soft), transparent 58%), linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.28))",
        }}
      />
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/60">
          <Icon name="users" size={48} />
          <span className="text-[10.5px]">{t("skin.previewUnavailable")}</span>
        </div>
      ) : (
        <div ref={container} className="relative h-full w-full" />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center pb-2 text-[9.5px] font-semibold tracking-wide text-white/45">
        {t("skin.rotateHint")}
      </div>
    </div>
  );
}
