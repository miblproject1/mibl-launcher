import { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  api,
  formatDownloads,
  formatSize,
  MC_VERSIONS,
  MC_VERSION_FALLBACK,
  type ContentFile,
  type ContentKind,
  type InstanceView,
  type ModpackHit,
  type ModpackSource,
} from "../lib/api";
import { useNotifications } from "../context/NotificationContext";
import { useUi } from "../context/UiContext";
import type { TranslationKey } from "../i18n/translations";
import { cn, coverGradient, errorText, formatNumber } from "../lib/utils";
import { Icon } from "./Icon";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  GlassCard,
  IconButton,
  PageHeader,
  Segmented,
  Select,
  Spinner,
  TextInput,
  Toggle,
} from "./ui";
import { CustomSelect } from "./CustomSelect";

const KINDS: Array<{
  key: ContentKind;
  labelKey: TranslationKey;
  icon: "cube" | "image" | "sparkles";
}> = [
  { key: "mod", labelKey: "mods", icon: "cube" },
  { key: "resourcepack", labelKey: "resourcepacks", icon: "image" },
  { key: "shader", labelKey: "shaders", icon: "sparkles" },
];

interface Props {
  instances: InstanceView[];
  onRefresh: () => Promise<void>;
}

export default function ModsTab({ instances, onRefresh }: Props) {
  const { addNotification } = useNotifications();
  const { t } = useUi();
  const [instanceName, setInstanceName] = useState(instances[0]?.name ?? "");
  const [kind, setKind] = useState<ContentKind>("mod");
  const [source, setSource] = useState<ModpackSource>("all");
  const [view, setView] = useState<"browse" | "installed">("browse");
  const [query, setQuery] = useState("");
  const [useFilters, setUseFilters] = useState(true);
  const [mcFilter, setMcFilter] = useState("");
  const [mcVersions, setMcVersions] = useState<string[]>(MC_VERSION_FALLBACK);
  const [results, setResults] = useState<ModpackHit[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [content, setContent] = useState<ContentFile[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [busyProject, setBusyProject] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selected = useMemo(
    () => instances.find((instance) => instance.name === instanceName) ?? instances[0] ?? null,
    [instances, instanceName],
  );

  // Нормализуем устаревший ключ «babric»: поиск модов должен идти как Fabric.
  const searchLoader = useMemo(() => {
    if (!selected) return null;
    const raw = String(selected.loader).toLowerCase();
    return raw === "babric" ? "fabric" : raw;
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setInstanceName("");
      return;
    }
    if (selected.name !== instanceName) setInstanceName(selected.name);
  }, [selected, instanceName]);

  // При смене сборки подставляем её версию игры в фильтр.
  useEffect(() => {
    setMcFilter(selected?.mc_version ?? "");
  }, [selected?.name]);

  // Подгружаем полный список официальных релизов Mojang.
  useEffect(() => {
    let alive = true;
    api
      .minecraftVersions()
      .then((list) => {
        if (!alive || !list || list.length === 0) return;
        setMcVersions((prev) => {
          const merged = [...MC_VERSIONS];
          for (const version of [...list, ...prev]) {
            if (!merged.includes(version)) merged.push(version);
          }
          return merged;
        });
      })
      .catch(() => {
        // остаётся резервный список
      });
    return () => {
      alive = false;
    };
  }, []);

  const kindInfo = KINDS.find((item) => item.key === kind) ?? KINDS[0];

  const loadContent = useCallback(async () => {
    if (!selected) {
      setContent([]);
      return;
    }
    setLoadingContent(true);
    try {
      const files = await api.listContent(selected.name, kind);
      setContent(files);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setLoadingContent(false);
    }
  }, [selected, kind, addNotification]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const search = useCallback(
    async (nextOffset = 0, append = false) => {
      if (!selected) {
        setResults([]);
        setTotal(0);
        return;
      }
      setSearching(true);
      setSearchError(null);
      setSearchNotice(null);
      try {
        const response = await api.contentSearch(
          query.trim(),
          kind,
          source,
          kind === "mod" && useFilters ? searchLoader : null,
          mcFilter.trim() || null,
          nextOffset,
          20,
        );
        setResults((prev) => (append ? [...prev, ...response.hits] : response.hits));
        setTotal(Number(response.total_hits) || 0);
        setOffset(nextOffset);
        setSearchNotice(response.notice ?? null);
      } catch (error) {
        setSearchError(errorText(error));
        if (!append) setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [selected, searchLoader, query, kind, source, useFilters, mcFilter],
  );

  useEffect(() => {
    if (view !== "browse") return;
    const timer = window.setTimeout(() => {
      void search(0, false);
    }, query ? 420 : 0);
    return () => window.clearTimeout(timer);
  }, [search, view, query]);

  const install = async (project: ModpackHit) => {
    if (!selected || busyProject) return;
    if (!project.available) {
      addNotification({ type: "error", message: t("content.unavailable") });
      return;
    }
    setBusyProject(project.id);
    try {
      const files = await api.contentInstall(project.source, project.project_id, kind, selected.name);
      addNotification({
        type: "success",
        message:
          files.length > 0
            ? t("content.modInstalled", { name: project.title, files: files.join(", ") })
            : t("content.modNoFile", { name: project.title }),
      });
      await Promise.all([loadContent(), onRefresh()]);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusyProject(null);
    }
  };

  const toggle = async (file: ContentFile) => {
    try {
      const nextPath = await api.toggleContent(file.path);
      setContent((prev) =>
        prev.map((item) =>
          item.path === file.path
            ? { ...item, path: nextPath, file: nextPath.split(/[\\/]/).pop() ?? item.file, enabled: !item.enabled }
            : item,
        ),
      );
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteContent(deleteTarget.path);
      addNotification({ type: "success", message: t("content.fileDeleted", { name: deleteTarget.file }) });
      setDeleteTarget(null);
      await Promise.all([loadContent(), onRefresh()]);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setDeleting(false);
    }
  };

  const openProject = (project: ModpackHit) => {
    const slug = project.slug || project.project_id;
    const url =
      project.source === "curseforge"
        ? `https://www.curseforge.com/minecraft/${
            kind === "shader" ? "shaders" : kind === "resourcepack" ? "texture-packs" : "mc-mods"
          }/${slug}`
        : `https://modrinth.com/${
            kind === "shader" ? "shader" : kind === "resourcepack" ? "resourcepack" : "mod"
          }/${slug}`;
    void openUrl(url).catch((error) => {
      addNotification({ type: "error", message: errorText(error) });
    });
  };

  return (
    <div className="fade-up">
      <PageHeader
        title={t("content.title")}
        subtitle={t("content.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <CustomSelect
              value={selected?.name ?? ""}
              onChange={(event) => setInstanceName(event.target.value)}
              className="w-[210px]"
              disabled={instances.length === 0}
            >
              {instances.length === 0 ? (
                <option value="">{t("content.noInstances")}</option>
              ) : (
                instances.map((instance) => (
                  <option key={instance.name} value={instance.name}>
                    {instance.name}
                  </option>
                ))
              )}
            </CustomSelect>
            <IconButton icon="refresh" label={t("common.refresh")} onClick={() => void loadContent()} />
          </div>
        }
      />

      {!selected ? (
        <EmptyState
          icon="cube"
          title={t("content.noInstancesTitle")}
          text={t("content.noInstancesText")}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              options={[
                { key: "browse", label: t("content.browse"), icon: "globe" },
                { key: "installed", label: t("content.installed"), icon: "folder", badge: content.length },
              ]}
              value={view}
              onChange={setView}
            />
            <Segmented
              options={KINDS.map((item) => ({ key: item.key, label: t(item.labelKey), icon: item.icon }))}
              value={kind}
              onChange={(next) => setKind(next)}
            />
          </div>

          {view === "browse" ? (
            <>
              <div className="glass mb-4 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Segmented
                    options={[
                      { key: "all", label: t("content.allSources"), icon: "globe" },
                      { key: "modrinth", label: "Modrinth", icon: "package" },
                      { key: "curseforge", label: "CurseForge", icon: "package" },
                    ]}
                    value={source}
                    onChange={setSource}
                  />
                  <div className="w-[180px]">
                    <CustomSelect
                      searchable
                      value={mcFilter}
                      onChange={(event) => setMcFilter(event.target.value)}
                    >
                      <option value="">{t("content.anyVersion")}</option>
                      {mcVersions.map((version) => (
                        <option key={version} value={version}>
                          {version}
                        </option>
                      ))}
                    </CustomSelect>
                  </div>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <Icon
                      name="search"
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                    />
                    <TextInput
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void search(0, false);
                      }}
                      placeholder={t("content.searchPlaceholder")}
                      className="h-10 pl-9 pr-24"
                    />
                    <Button
                      variant="primary"
                      size="xs"
                      icon="search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2"
                      loading={searching}
                      onClick={() => void search(0, false)}
                    >
                      {t("common.search")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {kind === "mod" && (
                      <Toggle
                        checked={useFilters}
                        onChange={setUseFilters}
                        label={`${t("content.loader")}: ${searchLoader ?? selected.loader}`}
                      />
                    )}
                    <span className="rounded-lg border border-white/10 bg-black/15 px-2.5 py-1 text-[10.5px] font-semibold muted">
                      {t("content.results", { n: formatNumber(total) })}
                    </span>
                  </div>
                </div>
              </div>

              {searchError && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-[11.5px] text-rose-100">
                  <Icon name="alert" size={15} className="mt-[1px] shrink-0" />
                  <span className="break-all">{searchError}</span>
                </div>
              )}

              {searchNotice && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-[11.5px] text-amber-100">
                  <Icon name="info" size={15} className="mt-[1px] shrink-0" />
                  <span className="leading-relaxed">{searchNotice}</span>
                </div>
              )}

              {searching && results.length === 0 ? (
                <div className="card-grid">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="glass h-[190px] animate-pulse p-4">
                      <div className="flex gap-3">
                        <div className="h-14 w-14 rounded-xl bg-white/8" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-2/3 rounded bg-white/8" />
                          <div className="h-2.5 w-1/3 rounded bg-white/6" />
                          <div className="h-2.5 w-full rounded bg-white/5" />
                        </div>
                      </div>
                      <div className="mt-5 h-2.5 w-full rounded bg-white/5" />
                      <div className="mt-2 h-2.5 w-4/5 rounded bg-white/5" />
                    </div>
                  ))}
                </div>
              ) : results.length === 0 ? (
                <EmptyState
                  icon="search"
                  title={t("content.nothingFound")}
                  text={
                    searchError
                      ? t("content.checkConnection")
                      : t("content.tryOther")
                  }
                />
              ) : (
                <>
                  <div className="card-grid">
                    {results.map((project) => (
                      <GlassCard key={project.id} hover className="flex flex-col p-3.5">
                        <div className="flex items-start gap-3">
                          <div
                            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 text-[20px] font-bold text-white/90"
                            style={{ background: coverGradient(project.slug || project.title) }}
                          >
                            <span className="absolute inset-0 flex items-center justify-center">
                              {(project.title || "?").slice(0, 1).toUpperCase()}
                            </span>
                            {project.icon_url && (
                              <img
                                src={project.icon_url}
                                alt=""
                                className="relative h-full w-full object-cover"
                                loading="lazy"
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <h3 className="truncate text-[13px] font-semibold text-[var(--fg)]">{project.title}</h3>
                                <Badge tone={project.source === "curseforge" ? "warn" : "accent"}>
                                  {project.source === "curseforge" ? "CurseForge" : "Modrinth"}
                                </Badge>
                              </div>
                              <IconButton
                                icon="external"
                                label={t("content.openPage")}
                                size="xs"
                                onClick={() => openProject(project)}
                              />
                            </div>
                            <div className="truncate text-[10.5px] muted">
                              {project.author
                                ? t("content.author", { name: project.author })
                                : project.slug}
                            </div>
                          </div>
                        </div>

                        <p className="mt-2 line-clamp-2 min-h-[30px] text-[11px] leading-relaxed text-[var(--fg)]/68">
                          {project.description || t("content.noDescription")}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {project.categories.slice(0, 3).map((category) => (
                            <Badge key={category}>{category}</Badge>
                          ))}
                          {project.categories.length > 3 && <Badge>+{project.categories.length - 3}</Badge>}
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                          <span className="flex items-center gap-1 text-[10.5px] muted">
                            <Icon name="download" size={12} />
                            {formatDownloads(project.downloads)}
                          </span>
                          <Button
                            variant="primary"
                            size="xs"
                            icon="download"
                            loading={busyProject === project.id}
                            disabled={!project.available || (Boolean(busyProject) && busyProject !== project.id)}
                            onClick={() => void install(project)}
                          >
                            {project.available ? t("content.install") : t("content.notAvailable")}
                          </Button>
                        </div>
                      </GlassCard>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[11px] muted">
                      {t("content.showing", {
                        shown: Math.min(offset + results.length, total),
                        total: formatNumber(total),
                      })}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        icon="chevron"
                        className="[&>svg]:rotate-180"
                        disabled={offset === 0 || searching}
                        onClick={() => void search(Math.max(0, offset - 20), false)}
                      >
                        {t("content.back")}
                      </Button>
                      {offset + results.length < total && (
                        <Button
                          variant="soft"
                          icon="chevron"
                          loading={searching}
                          onClick={() => void search(offset + 20, true)}
                        >
                          {t("content.showMore")}
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--fg)]/85">
                  <Icon name={kindInfo.icon} size={15} className="text-[var(--accent)]" />
                  {t(kindInfo.labelKey)} · {content.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" icon="refresh" onClick={() => void loadContent()} loading={loadingContent}>
                    {t("common.refresh")}
                  </Button>
                  <Button variant="primary" icon="plus" onClick={() => setView("browse")}>
                    {t("common.add")}
                  </Button>
                </div>
              </div>

              {loadingContent ? (
                <div className="glass flex items-center justify-center gap-2 py-10 text-[12px] muted">
                  <Spinner size={16} /> {t("content.readingFolder")}
                </div>
              ) : content.length === 0 ? (
                <EmptyState
                  icon="folder"
                  title={t("content.noFiles")}
                  text={t("content.emptyFolderText")}
                  action={
                    <Button variant="primary" icon="globe" onClick={() => setView("browse")}>
                      {t("content.openCatalog")}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {content.map((file) => {
                    const extension = file.file.split(".").pop()?.toUpperCase() ?? "FILE";
                    return (
                      <div
                        key={file.path}
                        className={cn(
                          "glass flex items-center gap-3 px-3 py-2.5 transition-colors",
                          !file.enabled && "opacity-65",
                        )}
                      >
                        <div className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-[9px] font-bold tracking-wide text-[var(--muted)]">
                          {extension}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold text-[var(--fg)]/90">{file.file}</div>
                          <div className="text-[10px] muted">
                            {formatSize(file.size)} · {file.enabled ? t("content.enabled") : t("content.disabled")}
                          </div>
                        </div>
                        <Toggle checked={file.enabled} onChange={() => void toggle(file)} />
                        <IconButton
                          icon="trash"
                          label={t("common.delete")}
                          variant="ghost"
                          className="hover:bg-rose-500/15 hover:text-rose-200"
                          onClick={() => setDeleteTarget(file)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("content.deleteFile")}
        text={deleteTarget ? t("content.deleteFileText") : ""}
        confirmLabel={t("common.delete")}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
