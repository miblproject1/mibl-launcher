import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  LOADER_NAMES,
  formatSize,
  type FoundInstance,
  type ImportItem,
  type LauncherScan,
} from "../lib/api";
import { useUi } from "../context/UiContext";
import { useNotifications } from "../context/NotificationContext";
import type { TranslationKey } from "../i18n/translations";
import { cn, errorText } from "../lib/utils";
import { Icon } from "./Icon";
import { Badge, Button, EmptyState, Modal, Spinner, Toggle } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const SOURCE_KEYS: Record<string, TranslationKey> = {
  prism: "inst.importSourcePrism",
  multimc: "inst.importSourcePrism",
  polymc: "inst.importSourcePrism",
  modrinth: "inst.importSourceModrinth",
  curseforge: "inst.importSourceCurseforge",
  minecraft: "inst.importSourceMinecraft",
  tlauncher: "inst.importSourceMinecraft",
  official: "inst.importSourceMinecraft",
  folder: "inst.importSourceFolder",
};

/** Импорт сборок из Prism/MultiMC, Modrinth App, CurseForge, TLauncher и папок. */
export function ImportLaunchersModal({ open, onClose, onRefresh }: Props) {
  const { t } = useUi();
  const { addNotification } = useNotifications();
  const [scan, setScan] = useState<LauncherScan | null>(null);
  const [extra, setExtra] = useState<FoundInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installAfter, setInstallAfter] = useState(true);
  const [importing, setImporting] = useState(false);

  const found = useMemo(() => {
    const list = [...(scan?.instances ?? []), ...extra];
    const seen = new Set<string>();
    return list.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [scan, extra]);

  const sourceLabel = useCallback(
    (source: string, launcher: string) => {
      const key = SOURCE_KEYS[source?.toLowerCase()];
      return key ? t(key) : launcher || source;
    },
    [t],
  );

  const groups = useMemo(() => {
    const map = new Map<string, FoundInstance[]>();
    for (const item of found) {
      const key = item.launcher || item.source || "?";
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [found]);

  const scanLaunchers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.scanLaunchers();
      setScan(result);
      setSelected(new Set());
      setExtra([]);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    if (!open) return;
    void scanLaunchers();
    return () => {
      setSelected(new Set());
    };
  }, [open, scanLaunchers]);

  const available = found.filter((item) => !item.already_imported);
  const allSelected = available.length > 0 && available.every((item) => selected.has(item.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(allSelected ? new Set() : new Set(available.map((item) => item.id)));
  };

  const pickFolder = async () => {
    try {
      const path = await api.pickFolder();
      if (!path) return;
      const inspected = await api.inspectFolder(path);
      setExtra((prev) =>
        prev.some((item) => item.id === inspected.id) ? prev : [...prev, inspected],
      );
      addNotification({ type: "info", message: t("inst.importFolderPicked") });
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  const runImport = async () => {
    const chosen = found.filter((item) => selected.has(item.id) && !item.already_imported);
    if (chosen.length === 0) return;
    setImporting(true);
    try {
      const items: ImportItem[] = chosen.map((item) => ({
        path: item.path,
        source: item.source,
        name: item.name || null,
        mc_version: item.mc_version || null,
        loader: item.loader || null,
        loader_version: item.loader_version,
      }));
      const summary = await api.importLaunchers(items);
      const files = summary.imported.reduce((sum, item) => sum + item.installed_files, 0);
      addNotification({
        type: "success",
        message: t("inst.importSummary", { instances: summary.imported.length, files }),
      });
      if (summary.skipped > 0) {
        addNotification({ type: "info", message: t("inst.importSkipped", { n: summary.skipped }) });
      }
      if (summary.errors.length > 0) {
        addNotification({
          type: "error",
          message: t("inst.importErrors", { n: summary.errors.length }),
        });
      }
      if (installAfter) {
        for (const result of summary.imported) {
          try {
            await api.installInstance(result.instance.name);
          } catch (error) {
            addNotification({
              type: "error",
              message: `${result.instance.name}: ${errorText(error)}`,
            });
          }
        }
      }
      await onRefresh();
      onClose();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("inst.importTitle")}
      subtitle={t("inst.importSubtitle")}
      width={880}
      footer={
        <>
          <Button variant="outline" icon="folder" onClick={() => void pickFolder()}>
            {t("inst.importPickFolder")}
          </Button>
          <Button
            variant="soft"
            icon="refresh"
            loading={loading}
            onClick={() => void scanLaunchers()}
          >
            {t("inst.importRescan")}
          </Button>
          <Button
            variant="primary"
            icon="download"
            loading={importing}
            disabled={selected.size === 0}
            onClick={() => void runImport()}
          >
            {importing
              ? t("inst.importRunning")
              : t("inst.importSelected", { n: selected.size })}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-[12px] muted">
          <Spinner size={20} />
          {t("inst.importScanning")}
        </div>
      ) : found.length === 0 ? (
        <EmptyState
          icon="folder"
          title={t("inst.importNothing")}
          text={t("inst.importNothingText")}
          action={
            <Button variant="primary" icon="folder" onClick={() => void pickFolder()}>
              {t("inst.importPickFolder")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="xs" icon="check" onClick={selectAll}>
              {t("inst.importSelectAll")}
            </Button>
            <span className="text-[10.5px] muted">
              {t("inst.importSelected", { n: selected.size })}
            </span>
          </div>

          {groups.map(([launcher, items]) => (
            <section key={launcher}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] muted">
                <Icon name="folder" size={12} className="text-[var(--accent)]" />
                {sourceLabel(items[0]?.source ?? "", launcher)}
                <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-[1px] text-[9px] font-bold tracking-normal text-[var(--fg)]/70">
                  {items.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {items.map((item) => {
                  const active = selected.has(item.id);
                  const disabled = item.already_imported;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => toggle(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                        disabled
                          ? "cursor-not-allowed border-white/8 bg-black/15 opacity-55"
                          : active
                            ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                            : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/[0.05]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          active
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-white/25 bg-black/25 text-transparent",
                        )}
                      >
                        <Icon name="check" size={12} />
                      </span>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/25 text-[16px]">
                        {item.icon ?? "📦"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-[var(--fg)]">
                          {item.name}
                        </span>
                        <span className="block truncate text-[10px] muted">
                          {item.mc_version
                            ? t("inst.importDetected", {
                                mc: item.mc_version,
                                loader:
                                  LOADER_NAMES[item.loader] ?? (item.loader || "—"),
                              })
                            : t("inst.importUnknownVersion")}
                        </span>
                      </span>
                      <span className="hidden shrink-0 flex-wrap items-center gap-1 sm:flex">
                        <Badge tone="neutral">{t("inst.importFiles", { n: item.mods })}</Badge>
                        <Badge tone="neutral">{t("inst.importWorlds", { n: item.worlds })}</Badge>
                        {disabled && <Badge tone="accent">{t("inst.importAlready")}</Badge>}
                      </span>
                      <span className="shrink-0 text-[10px] muted">
                        {formatSize(item.size_bytes)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold text-[var(--fg)]">
                {t("inst.importInstallAfter")}
              </div>
              <div className="text-[10px] leading-snug muted">
                {t("inst.importInstallAfterHint")}
              </div>
            </div>
            <Toggle checked={installAfter} onChange={setInstallAfter} />
          </div>

          <div className="text-[10px] leading-snug muted">{t("inst.importNote")}</div>

          {scan && scan.warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[10px] leading-snug text-amber-100/90">
              {scan.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5">
                  <Icon name="alert" size={11} className="mt-[1px] shrink-0" />
                  <span className="break-all">{warning}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
