import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import {
  api,
  type AccountView,
  type Bootstrap,
  type Config,
  type InstanceView,
  type PageKey,
  type SystemInfo,
} from "./lib/api";
import { errorText } from "./lib/utils";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { NotificationProvider, useNotifications } from "./context/NotificationContext";
import { UiProvider, useUi } from "./context/UiContext";
import Background from "./components/Background";
import ChristmasDecorLayer from "./components/ChristmasDecorLayer";
import ErrorBoundary from "./components/ErrorBoundary";
import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { TitleBar } from "./components/TitleBar";
import { TaskDock } from "./components/TaskDock";
import { LaunchDock } from "./components/LaunchDock";
import { QuickSettings } from "./components/QuickSettings";
import HomeTab from "./components/HomeTab";
import InstancesTab from "./components/InstancesTab";
import ModsTab from "./components/ModsTab";
import ModpacksTab from "./components/ModpacksTab";
import CustomTab from "./components/CustomTab";
import SettingsTab from "./components/SettingsTab";
import { HudEditor } from "./components/HudEditor";
import { Button, Spinner } from "./components/ui";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { hudStyle } from "./context/UiContext";

const PAGE_KEYS: PageKey[] = ["home", "instances", "content", "modpacks", "theme", "settings"];

function normalizePage(page: string): PageKey {
  return PAGE_KEYS.includes(page as PageKey) ? (page as PageKey) : "home";
}

function Splash({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useUi();
  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden p-6"
      style={{
        background:
          "radial-gradient(circle at 30% 20%, rgba(128,0,255,0.34), transparent 55%), radial-gradient(circle at 75% 85%, rgba(69,224,192,0.20), transparent 52%), #0b0b12",
      }}
    >
      <div className="glass-strong w-full max-w-[430px] p-7 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#45e0c0] text-[28px] font-black text-white shadow-[0_18px_40px_-16px_var(--accent)]">
          M
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight text-white">Mibl Launcher</h1>
        <p className="mt-1 text-[11px] font-semibold tracking-[0.28em] text-white/50">VERSION 2.7.0 · CHRISTMAS</p>

        {error ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-left text-[11.5px] leading-relaxed text-rose-100">
              <Icon name="alert" size={15} className="mt-[1px] shrink-0" />
              <span className="break-all">{error}</span>
            </div>
            <Button variant="primary" icon="refresh" onClick={onRetry}>
              {t("app.retry")}
            </Button>
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-center gap-2 text-[12px] text-white/65">
            <Spinner size={16} />
            {t("app.loading")}
          </div>
        )}
      </div>
    </div>
  );
}

function ChristmasBox() {
  const { christmas, setChristmas, t } = useUi();
  const { addNotification } = useNotifications();

  if (christmas) return null;

  const open = () => {
    setChristmas(true);
    addNotification({ type: "success", message: t("christmas.enabled") });
  };

  return (
    <button
      type="button"
      className="christmas-box"
      onClick={open}
      title={t("christmas.boxTitle")}
      aria-label={t("christmas.boxTitle")}
    >
      <svg width="88" height="94" viewBox="0 0 88 94" fill="none" aria-hidden="true">
        <ellipse cx="44" cy="88" rx="30" ry="5" fill="rgba(4, 10, 24, 0.45)" />
        {/* Игрушки выглядывают из коробки */}
        <circle cx="28" cy="28" r="7.5" fill="#ff6b6b" stroke="#ffe4e6" strokeWidth="1.4" />
        <circle cx="28" cy="28" r="2.6" fill="#ffd7d7" />
        <circle cx="58" cy="25" r="6.5" fill="#7dd3fc" stroke="#e0f2fe" strokeWidth="1.4" />
        <circle cx="58" cy="25" r="2.2" fill="#d8f3ff" />
        <path
          d="M44 10 C 40 16 40 22 44 28 C 48 22 48 16 44 10 Z"
          fill="#ffe29a"
          stroke="#fff6cf"
          strokeWidth="1.2"
        />
        <path
          d="M68 34 C 74 28 80 30 79 36 C 78 42 71 42 66 40"
          stroke="#fca5a5"
          strokeWidth="3.4"
          strokeLinecap="round"
        />

        {/* Корпус подарка */}
        <rect x="13" y="44" width="62" height="38" rx="4" fill="#a93444" />
        <rect x="13" y="44" width="62" height="10" rx="4" fill="#c94455" />
        <rect x="38" y="44" width="12" height="38" fill="#ffd166" />
        <rect x="38" y="44" width="4" height="38" fill="#ffe6a3" />
        <rect x="13" y="44" width="62" height="38" rx="4" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />

        {/* Крышка */}
        <rect x="9" y="35" width="70" height="13" rx="3" fill="#c94455" />
        <rect x="9" y="35" width="70" height="4" rx="2" fill="#e26675" />
        <rect x="38" y="31" width="12" height="17" fill="#ffd166" />
        <rect x="38" y="31" width="4" height="17" fill="#ffe6a3" />

        {/* Бант */}
        <path
          d="M44 32 C 34 18 20 22 26 31 C 31 38 40 35 44 32 Z"
          fill="#ffe29a"
          stroke="#fff6cf"
          strokeWidth="1.2"
        />
        <path
          d="M44 32 C 54 18 68 22 62 31 C 57 38 48 35 44 32 Z"
          fill="#ffe29a"
          stroke="#fff6cf"
          strokeWidth="1.2"
        />
        <circle cx="44" cy="32" r="4.2" fill="#ffd166" stroke="#fff6cf" strokeWidth="1.2" />

        {/* Снежные точки */}
        <circle cx="20" cy="60" r="1.6" fill="rgba(255,255,255,0.75)" />
        <circle cx="66" cy="70" r="1.4" fill="rgba(255,255,255,0.65)" />
        <circle cx="26" cy="75" r="1.2" fill="rgba(255,255,255,0.55)" />
      </svg>
      <span className="christmas-box-label">{t("christmas.boxShort")}</span>
    </button>
  );
}

function AppContent({ boot }: { boot: Bootstrap }) {
  const { theme } = useTheme();
  const { addNotification } = useNotifications();
  const { layout, hud, patch, pixel, t } = useUi();
  const [page, setPage] = useState<PageKey>(() => normalizePage(boot.config.last_page));
  const [instances, setInstances] = useState<InstanceView[]>(boot.instances);
  const [accounts, setAccounts] = useState<AccountView[]>(boot.accounts);
  const [selectedAccount, setSelectedAccount] = useState(boot.selected);
  const [config, setConfig] = useState<Config>(boot.config);
  const [system, setSystem] = useState<SystemInfo>(boot.system);
  const [quickOpen, setQuickOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const refreshed = useRef(false);
  const mainRef = useRef<HTMLElement | null>(null);

  // При смене страницы возвращаемся к началу — иначе список открывается «с середины».
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);

  const refreshInstances = useCallback(async () => {
    try {
      const [list, info] = await Promise.all([api.listInstances(), api.systemInfo()]);
      setInstances(list);
      setSystem(info);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  }, [addNotification]);

  useEffect(() => {
    let alive = true;
    const unlisten = listen("instances-changed", () => {
      if (alive) void refreshInstances();
    });
    return () => {
      alive = false;
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [refreshInstances]);

  // Если сохранённая сборка исчезла — выбираем первую доступную.
  useEffect(() => {
    if (instances.length === 0) {
      if (layout.instance) patch({ instance: "" });
      return;
    }
    if (!instances.some((instance) => instance.name === layout.instance)) {
      patch({ instance: instances[0].name });
    }
  }, [instances, layout.instance, patch]);

  const changePage = (next: PageKey) => {
    setPage(next);
    setConfig((prev) => {
      if (prev.last_page === next) return prev;
      const updated = { ...prev, last_page: next };
      void api.saveConfig(updated).catch(() => {});
      return updated;
    });
  };

  const openDataFolder = async () => {
    try {
      await api.openPath(system.data_dir);
    } catch (error) {
      addNotification({ type: "error", message: errorText(error) });
    }
  };

  const handleAccounts = (nextAccounts: AccountView[], nextSelected: number) => {
    setAccounts(nextAccounts);
    setSelectedAccount(nextSelected);
  };

  const handleConfig = (next: Config) => {
    setConfig(next);
    patch({ language: next.game_language });
  };

  const handleSystem = (next: SystemInfo) => {
    setSystem(next);
  };

  const activeAccount = accounts[selectedAccount] ?? accounts[0] ?? null;
  const selectedInstance =
    instances.find((instance) => instance.name === layout.instance)?.name ??
    instances[0]?.name ??
    "";
  const dockVisible = layout.dock === "always" || page === "home";

  const taskDone = useCallback(() => {
    if (refreshed.current) {
      void refreshInstances();
      return;
    }
    refreshed.current = true;
    void refreshInstances();
    window.setTimeout(() => {
      refreshed.current = false;
      void refreshInstances();
    }, 700);
  }, [refreshInstances]);

  const tab = (() => {
    switch (page) {
      case "home":
        return (
          <HomeTab
            account={activeAccount}
            onOpenSettings={() => setQuickOpen(true)}
            onOpenHud={() => setHudOpen(true)}
          />
        );
      case "instances":
        return (
          <InstancesTab
            instances={instances}
            system={system}
            defaultRamMb={config.default_ram_mb}
            account={activeAccount}
            onOpenSkinSettings={() => changePage("settings")}
            onRefresh={refreshInstances}
            showHero={!pixel}
          />
        );
      case "content":
        return (
          <ModsTab
            instances={instances}
            onRefresh={refreshInstances}
            onOpenSettings={() => changePage("settings")}
            hasCurseKey={Boolean(config.curseforge_api_key?.trim())}
          />
        );
      case "modpacks":
        return (
          <ModpacksTab
            instances={instances}
            onRefresh={refreshInstances}
            onOpenInstances={() => changePage("instances")}
            onOpenSettings={() => changePage("settings")}
            hasCurseKey={Boolean(config.curseforge_api_key?.trim())}
          />
        );
      case "theme":
        return <CustomTab />;
      case "settings":
        return (
          <SettingsTab
            accounts={accounts}
            selected={selectedAccount}
            config={config}
            system={system}
            onAccounts={handleAccounts}
            onConfig={handleConfig}
            onSystem={handleSystem}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden text-[var(--fg)]">
      <Background theme={theme} lifted={dockVisible} showTree={page === "home"} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TitleBar account={activeAccount} onOpenSettings={() => setQuickOpen(true)} />

        {layout.nav === "top" && (
          <div
            data-hud="nav"
            data-hud-label={t("hud.nav")}
            style={hudStyle(hud.nav)}
            className="hud-el relative z-20 shrink-0"
          >
            <TopNav page={page} onChange={changePage} instancesCount={instances.length} />
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {layout.nav === "left" && (
            <div
              data-hud="nav"
              data-hud-label={t("hud.nav")}
              style={hudStyle(hud.nav)}
              className="hud-el relative z-20 flex shrink-0"
            >
              <Sidebar
                page={page}
                onChange={changePage}
                account={activeAccount}
                instancesCount={instances.length}
                onOpenLogs={() => void openDataFolder()}
              />
            </div>
          )}
          <main
            ref={mainRef}
            className={cn(
              "min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 lg:px-6",
              dockVisible ? "pb-24" : "pb-20",
            )}
          >
            <div className="mx-auto w-full max-w-[1560px]">
              <ErrorBoundary>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={page}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    {tab}
                  </motion.div>
                </AnimatePresence>
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      <TaskDock lifted={dockVisible} onTaskDone={taskDone} />

      {dockVisible && (
        <LaunchDock
          compact={page === "home"}
          instances={instances}
          selected={selectedInstance}
          onSelect={(name) => patch({ instance: name })}
          onRefresh={refreshInstances}
          account={activeAccount}
          onOpenSettings={() => setQuickOpen(true)}
        />
      )}

      <QuickSettings
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        accounts={accounts}
        selected={selectedAccount}
        config={config}
        system={system}
        onAccounts={handleAccounts}
        onConfig={handleConfig}
        onOpenFull={() => {
          setQuickOpen(false);
          changePage("settings");
        }}
      />

      <HudEditor
        open={hudOpen}
        onClose={() => setHudOpen(false)}
        onSaved={() =>
          addNotification({ type: "success", message: t("app.hudSaved") })
        }
      />

      <ChristmasDecorLayer />
      <ChristmasBox />
    </div>
  );
}

function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.bootstrap();
      setBoot(data);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <UiProvider>
      {boot ? (
        <ThemeProvider initialTheme={boot.theme} presets={boot.presets}>
          <NotificationProvider>
            <AppContent boot={boot} />
          </NotificationProvider>
        </ThemeProvider>
      ) : (
        <Splash error={error} onRetry={() => void load()} />
      )}
    </UiProvider>
  );
}

export default App;
