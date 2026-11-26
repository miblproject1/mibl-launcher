import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  formatSize,
  formatStamp,
  type InstanceView,
  type WorldBackup,
} from "../lib/api";
import { useUi } from "../context/UiContext";
import { useNotifications } from "../context/NotificationContext";
import { errorText } from "../lib/utils";
import { Badge, Button, ConfirmDialog, EmptyState, Modal, Spinner } from "./ui";

interface Props {
  open: boolean;
  instance: InstanceView | null;
  onClose: () => void;
}

/** Список архивов миров сборки: создание, восстановление и удаление. */
export function WorldBackupsModal({ open, instance, onClose }: Props) {
  const { t } = useUi();
  const { addNotification } = useNotifications();
  const [backups, setBackups] = useState<WorldBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<WorldBackup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorldBackup | null>(null);
  const [busy, setBusy] = useState(false);

  const name = instance?.name ?? "";

  const load = useCallback(async () => {
    if (!name) return;
    setLoading(true);
    try {
      setBackups(await api.listBackups(name));
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [name, addNotification]);

  useEffect(() => {
    if (!open || !name) return;
    let alive = true;
    setLoading(true);
    api
      .listBackups(name)
      .then((list) => {
        if (alive) setBackups(list);
      })
      .catch((error: unknown) => {
        if (alive) addNotification({ type: "error", message: errorText(error) });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, name, addNotification]);

  // Автобэкап после закрытия игры присылает событие — обновляем список.
  useEffect(() => {
    if (!open || !name) return;
    let alive = true;
    const unlisten = listen<{ instance: string }>("backups-changed", (event) => {
      if (!alive || event.payload?.instance !== name) return;
      void load();
    });
    return () => {
      alive = false;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [open, name, load]);

  const create = async () => {
    if (!name) return;
    setCreating(true);
    try {
      const created = await api.backupWorlds(name);
      if (created.length === 0) {
        addNotification({ type: "info", message: t("inst.backupsNothing") });
      } else {
        addNotification({
          type: "success",
          message: t("inst.backupsCreated", { name: created[0].file_name }),
        });
      }
      await load();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setCreating(false);
    }
  };

  const openFolder = async () => {
    if (!name) return;
    try {
      await api.openBackupsFolder(name);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  const restore = async () => {
    if (!name || !restoreTarget) return;
    setBusy(true);
    try {
      const result = await api.restoreBackup(name, restoreTarget.path);
      addNotification({
        type: "success",
        message: t("inst.backupsRestored", {
          world: result.world || restoreTarget.world || restoreTarget.file_name,
          files: result.files,
        }),
      });
      setRestoreTarget(null);
      await load();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!name || !deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteBackup(name, deleteTarget.path);
      addNotification({ type: "success", message: t("inst.backupsDeleted") });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const label = (backup: WorldBackup) => backup.world || backup.file_name;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t("inst.backupsTitle")}
        subtitle={instance ? t("inst.backupsSubtitle", { name: instance.name }) : undefined}
        width={760}
        footer={
          <>
            <Button
              variant="outline"
              icon="folder"
              onClick={() => void openFolder()}
              disabled={!name}
            >
              {t("inst.backupsOpenFolder")}
            </Button>
            <Button
              variant="primary"
              icon="archive"
              loading={creating}
              disabled={!name}
              onClick={() => void create()}
            >
              {t("inst.backupsCreate")}
            </Button>
            <Button variant="soft" onClick={onClose}>
              {t("common.close")}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center gap-2 text-[12px] muted">
            <Spinner size={18} />
            {t("common.loading")}
          </div>
        ) : backups.length === 0 ? (
          <EmptyState
            icon="archive"
            title={t("inst.backupsEmpty")}
            text={t("inst.backupsEmptyText")}
            action={
              <Button
                variant="primary"
                icon="archive"
                loading={creating}
                disabled={!name}
                onClick={() => void create()}
              >
                {t("inst.backupsCreate")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.16em] muted">
              <span>{t("inst.backupsWorld")}</span>
              <span>{t("inst.backupsCount", { n: backups.length })}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full border-collapse text-[11.5px]">
                <thead>
                  <tr className="bg-black/25 text-left text-[10px] uppercase tracking-wider muted">
                    <th className="px-3 py-2 font-semibold">{t("inst.backupsWorld")}</th>
                    <th className="hidden px-3 py-2 font-semibold sm:table-cell">
                      {t("inst.backupsDate")}
                    </th>
                    <th className="hidden px-3 py-2 font-semibold md:table-cell">
                      {t("inst.backupsSize")}
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">{t("inst.more")}</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr
                      key={backup.path}
                      className="border-t border-white/8 transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="min-w-0 px-3 py-2">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-semibold text-[var(--fg)]">
                            {label(backup)}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={backup.automatic ? "accent" : "neutral"}>
                              {backup.automatic
                                ? t("inst.backupsAuto")
                                : t("inst.backupsManual")}
                            </Badge>
                            {backup.legacy && (
                              <Badge tone="warn">{t("inst.backupsLegacy")}</Badge>
                            )}
                            <span className="text-[10px] muted sm:hidden">
                              {formatStamp(backup.created)}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 muted sm:table-cell">
                        {formatStamp(backup.created)}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 muted md:table-cell">
                        {formatSize(backup.size)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="soft"
                            size="xs"
                            icon="restore"
                            onClick={() => setRestoreTarget(backup)}
                          >
                            {t("inst.backupsRestore")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            icon="trash"
                            className="text-rose-200 hover:bg-rose-500/15"
                            onClick={() => setDeleteTarget(backup)}
                          >
                            {t("inst.backupsDelete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title={t("inst.backupsRestoreTitle")}
        text={
          restoreTarget
            ? restoreTarget.legacy
              ? t("inst.backupsRestoreFullText", {
                  date: formatStamp(restoreTarget.created),
                })
              : t("inst.backupsRestoreText", {
                  world: label(restoreTarget),
                  date: formatStamp(restoreTarget.created),
                })
            : ""
        }
        confirmLabel={t("inst.backupsRestore")}
        tone="primary"
        busy={busy}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => void restore()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("inst.backupsDelete")}
        text={deleteTarget ? label(deleteTarget) : ""}
        confirmLabel={t("common.delete")}
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
