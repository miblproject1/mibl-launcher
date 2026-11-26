import { useMemo } from "react";
import { Icon } from "./Icon";
import { Modal } from "./ui";

export interface ScreenshotsModalProps {
  open: boolean;
  instance: { name: string };
  onClose: () => void;
}

/**
 * Галерея скриншотов сборки. Файлы читаются из папки `screenshots/<сборка>`
 * на стороне Rust; здесь показываем сетку-заглушку, пока снимков нет.
 */
export function ScreenshotsModal({ open, instance, onClose }: ScreenshotsModalProps) {
  const files = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => ({
        index,
        filename: `${index + 1}.png`,
      })),
    [instance.name],
  );

  return (
    <Modal
      title={instance.name}
      subtitle="Скриншоты"
      open={open}
      onClose={onClose}
    >
      <div className="grid max-h-[60vh] grid-cols-2 gap-2.5 overflow-auto p-1.5 sm:grid-cols-3 md:grid-cols-4">
        {files.map(({ index, filename }) => (
          <div
            key={index}
            className="group relative flex aspect-video cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg border border-white/10 bg-black/40 transition-colors hover:border-white/20 hover:bg-black/55"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-white/55 transition-colors group-hover:text-white/85">
              <Icon name="image" size={17} />
            </div>
            <span className="max-w-full truncate px-2 text-[9.5px] font-medium text-white/40">
              {filename}
            </span>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed muted">
        Снимки сохраняются в папку <span className="font-mono text-[10.5px]">screenshots/{instance.name}</span>.
        Откройте папку сборки, чтобы посмотреть их в полном размере.
      </p>
    </Modal>
  );
}
