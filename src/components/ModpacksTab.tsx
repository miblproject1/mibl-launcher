import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  LOADERS,
  MC_VERSIONS,
  formatDownloads,
  type InstanceView,
  type Loader,
  type ModpackHit,
  type ModpackSource,
} from "../lib/api";
import { useNotifications } from "../context/NotificationContext";
import { useUi } from "../context/UiContext";
import { errorText, formatNumber } from "../lib/utils";
import { Icon } from "./Icon";
import {
  Badge,
  Button,
  EmptyState,
  GlassCard,
  PageHeader,
  Segmented,
  Spinner,
  TextInput,
} from "./ui";
import { CustomSelect } from "./CustomSelect";

interface Props {
  instances: InstanceView[];
  onRefresh: () => Promise<void>;
  onOpenInstances?: () => void;
}

const PAGE_SIZE = 20;

const SOURCE_META: Record<"modrinth" | "curseforge", { label: string; tone: "accent" | "warn" }> = {
  modrinth: { label: "Modrinth", tone: "accent" },
  curseforge: { label: "CurseForge", tone: "warn" },
};

export default function ModpacksTab({ instances, onRefresh, onOpenInstances }: Props) {
  const { addNotification } = useNotifications();
  const { t } = useUi();
  const [source, setSource] = useState<ModpackSource>("all");
  const [query, setQuery] = useState("");
  const [loaderFilter, setLoaderFilter] = useState<"" | Loader>("");
  const [mcFilter, setMcFilter] = useState("");
  const [results, setResults] = useState<ModpackHit[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastInstalled, setLastInstalled] = useState<string | null>(null);

  const search = useCallback(
    async (nextOffset = 0, append = false) => {
      setSearching(true);
      setSearchError(null);
      setSearchNotice(null);
      try {
        const response = await api.modpackSearch(
          query.trim(),
          source,
          loaderFilter || null,
          mcFilter.trim() || null,
          nextOffset,
          PAGE_SIZE,
        );
        setResults((prev) => (append ? [...prev, ...response.hits] : response.hits));
        setTotal(Number(response.total_hits) || 0);
        setOffset(nextOffset);
        setSearchNotice(response.notice ?? null);
      } catch (error) {
        setSearchError(errorText(error));
        if (!append) {
          setResults([]);
          setTotal(0);
        }
      } finally {
        setSearching(false);
      }
    },
    [query, source, loaderFilter, mcFilter],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void search(0, false);
    }, query ? 420 : 0);
    return () => window.clearTimeout(timer);
  }, [search, query]);

  const install = async (hit: ModpackHit) => {
    if (busyId) return;
    setBusyId(hit.id);
    setLastInstalled(null);
    try {
      const result = await api.modpackInstall(
        hit.source,
        hit.project_id,
        hit.title,
        hit.icon_url,
        mcFilter.trim() || null,
        loaderFilter || null,
      );
      setLastInstalled(result.instance.name);
      addNotification({
        type: "success",
        message: t("modpacks.installedOne", { name: hit.title, files: result.installed_files }),
      });
      await onRefresh();
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      setBusyId(null);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setLoaderFilter("");
    setMcFilter("");
    setSource("all");
  };

  const hasFilters = Boolean(query.trim() || loaderFilter || mcFilter.trim() || source !== "all");

  const hint = useMemo(() => {
    if (instances.length === 0) {
      return t("modpacks.hintFirst");
    }
    return t("modpacks.hintCount", { n: instances.length });
  }, [instances.length, t]);

  return (
    <div className="fade-up">
      <PageHeader
        title={t("modpacks.title")}
        subtitle={t("modpacks.subtitle")}
        actions={
          <>
            <Button variant="outline" icon="refresh" onClick={() => void search(0, false)} loading={searching}>
              {t("common.refresh")}
            </Button>
            {onOpenInstances && (
              <Button variant="soft" icon="grid" onClick={onOpenInstances}>
                {t("home.allInstances")}
              </Button>
            )}
          </>
        }
      />

      <div className="glass mb-4 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              options={[
                { key: "all", label: t("modpacks.allSources"), icon: "globe" },
                { key: "modrinth", label: "Modrinth", icon: "package" },
                { key: "curseforge", label: "CurseForge", icon: "package" },
              ]}
              value={source}
              onChange={setSource}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[132px]">
                <CustomSelect value={loaderFilter} onChange={(event) => setLoaderFilter(event.target.value as "" | Loader)}>
                  <option value="">{t("modpacks.anyLoader")}</option>
                  {LOADERS.filter((loader) => loader.key !== "vanilla").map((loader) => (
                    <option key={loader.key} value={loader.key}>
                      {loader.name}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div className="w-[132px]">
                <TextInput
                  list="modpack-mc-versions"
                  value={mcFilter}
                  onChange={(event) => setMcFilter(event.target.value)}
                  placeholder={t("modpacks.mcVersion")}
                  className="h-8 text-[11px]"
                />
                <datalist id="modpack-mc-versions">
                  {MC_VERSIONS.map((version) => (
                    <option key={version} value={version} />
                  ))}
                </datalist>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="xs" icon="x" onClick={clearFilters}>
                  {t("common.reset")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
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
                placeholder={t("modpacks.searchPlaceholder")}
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
            <div className="flex items-center gap-2 text-[10.5px] muted">
              <span className="rounded-lg border border-white/10 bg-black/15 px-2.5 py-1 font-semibold">
                {t("content.results", { n: formatNumber(total) })}
              </span>
              <span className="hidden sm:inline">{hint}</span>
            </div>
          </div>
        </div>
      </div>

      {lastInstalled && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-[11.5px] text-emerald-100">
          <span className="flex items-center gap-2">
            <Icon name="check" size={14} />
            {t("modpacks.installedBanner", { name: lastInstalled })}
          </span>
          {onOpenInstances && (
            <Button variant="ghost" size="xs" icon="grid" onClick={onOpenInstances}>
              {t("common.open")}
            </Button>
          )}
        </div>
      )}

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
            <div key={index} className="glass h-[196px] animate-pulse p-4">
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
          icon="package"
          title={t("modpacks.nothingFound")}
          text={
            searchError
              ? t("content.checkConnection")
              : t("content.tryOther")
          }
          action={
            hasFilters ? (
              <Button variant="soft" icon="x" onClick={clearFilters}>
                {t("common.reset")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="card-grid">
            {results.map((hit) => {
              const meta = SOURCE_META[hit.source];
              const busy = busyId === hit.id;
              const blocked = Boolean(busyId) && !busy;
              const loaders = hit.loaders.length
                ? hit.loaders
                : hit.categories.filter((c) => ["fabric", "forge", "neoforge", "quilt"].includes(c));
              return (
                <GlassCard key={hit.id} hover className="flex flex-col p-3.5">
                  <div className="flex items-start gap-3">
                    <div
                      className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 text-[20px] font-bold text-white/90"
                      style={{ background: "linear-gradient(135deg, #4b6cb7, #182848)" }}
                    >
                      <span className="absolute inset-0 flex items-center justify-center">
                        {(hit.title || "?").slice(0, 1).toUpperCase()}
                      </span>
                      {hit.icon_url && (
                        <img
                          src={hit.icon_url}
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
                        <h3 className="truncate text-[13px] font-semibold text-[var(--fg)]">{hit.title}</h3>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <div className="truncate text-[10.5px] muted">
                        {hit.author
                          ? t("content.author", { name: hit.author })
                          : hit.slug}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] muted">
                        <Icon name="download" size={11} />
                        {formatDownloads(hit.downloads)}
                      </div>
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-3 min-h-[42px] text-[11px] leading-relaxed text-[var(--fg)]/68">
                    {hit.description || t("content.noDescription")}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {loaders.slice(0, 2).map((loader) => (
                      <Badge key={loader} tone="success">
                        {loader}
                      </Badge>
                    ))}
                    {hit.versions.slice(0, 3).map((version) => (
                      <Badge key={version}>{version}</Badge>
                    ))}
                    {!hit.available && <Badge tone="danger">{t("modpacks.downloadForbidden")}</Badge>}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="truncate text-[10px] muted">
                      {hit.versions[0] ? t("modpacks.latest", { version: hit.versions[0] }) : ""}
                    </span>
                    <Button
                      variant="primary"
                      size="xs"
                      icon="download"
                      loading={busy}
                      disabled={blocked || !hit.available}
                      onClick={() => void install(hit)}
                    >
                      {busy ? t("modpacks.installing") : t("modpacks.install")}
                    </Button>
                  </div>
                </GlassCard>
              );
            })}
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
                onClick={() => void search(Math.max(0, offset - PAGE_SIZE), false)}
              >
                {t("content.back")}
              </Button>
              {offset + results.length < total && (
                <Button
                  variant="soft"
                  icon="chevron"
                  loading={searching}
                  disabled={Boolean(busyId)}
                  onClick={() => void search(offset + PAGE_SIZE, true)}
                >
                  {t("content.showMore")}
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {searching && results.length > 0 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-[11px] muted">
          <Spinner size={13} /> {t("modpacks.searching")}
        </div>
      )}
    </div>
  );
}
