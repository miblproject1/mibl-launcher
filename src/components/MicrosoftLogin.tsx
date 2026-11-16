import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type AccountView, type MicrosoftDeviceCode } from "../lib/api";
import { useNotifications } from "../context/NotificationContext";
import { useUi } from "../context/UiContext";
import { copyText, errorText } from "../lib/utils";
import { Badge, Button, IconButton, Modal, Spinner } from "./ui";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  onAccounts: (accounts: AccountView[], selected: number) => void;
}

const MICROSOFT_LINK = "https://www.microsoft.com/link";

/**
 * Официальный вход Microsoft (Mojang) по OAuth 2.0 Device Code Flow.
 *
 * Пароль вводится только на сайте Microsoft — лаунчер получает одноразовый
 * код, а после подтверждения автоматически добавляет лицензионный аккаунт.
 */
export function MicrosoftLoginModal({ open, onClose, onAccounts }: Props) {
  const { addNotification } = useNotifications();
  const { t } = useUi();
  const [code, setCode] = useState<MicrosoftDeviceCode | null>(null);
  const [status, setStatus] = useState("");
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    setCopied(false);
    setStatus(t("ms.starting"));
    try {
      const next = await api.microsoftLoginStart();
      if (!aliveRef.current) return;
      setCode(next);
      setStatus(t("ms.startingHint"));
      // Официальная страница ввода одноразового кода.
      void openUrl(next.verification_uri || MICROSOFT_LINK).catch(() => {});
    } catch (error) {
      if (!aliveRef.current) return;
      setCode(null);
      setStatus("");
      addNotification({ type: "error", message: errorText(error) });
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    if (!open) {
      setCode(null);
      setStatus("");
      setStarting(false);
      setCopied(false);
      return;
    }
    void start();
  }, [open, start]);

  // Опрос Microsoft, пока пользователь подтверждает вход в браузере.
  useEffect(() => {
    if (!open || !code) return;
    let cancelled = false;
    let timer = 0;
    let interval = Math.max(3, code.interval || 5) * 1000;

    const tick = async () => {
      try {
        const result = await api.microsoftLoginPoll(code.device_code);
        if (cancelled) return;
        if (result.status === "ok" && result.accounts && result.selected !== null) {
          onAccounts(result.accounts, result.selected);
          addNotification({
            type: "success",
            message: result.message ?? t("ms.success"),
          });
          setCode(null);
          setStatus("");
          onClose();
          return;
        }
        setStatus(result.message ?? t("ms.waiting"));
        if (result.status === "slow_down") interval += 5000;
        timer = window.setTimeout(tick, interval);
      } catch (error) {
        if (cancelled) return;
        setCode(null);
        setStatus("");
        addNotification({ type: "error", message: errorText(error) });
      }
    };

    timer = window.setTimeout(tick, interval);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, code, onAccounts, addNotification, onClose, t]);

  const copyCode = async () => {
    if (!code) return;
    const ok = await copyText(code.user_code);
    setCopied(ok);
    addNotification({
      type: ok ? "success" : "error",
      message: ok ? t("ms.codeCopiedHint") : t("ms.codeCopyFailed"),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("ms.title")}
      subtitle={t("ms.subtitle")}
      width={520}
      footer={
        <>
          {code && (
            <>
              <Button variant="soft" icon={copied ? "check" : "copy"} onClick={() => void copyCode()}>
                {copied ? t("ms.codeCopied") : t("ms.copyCode")}
              </Button>
              <Button
                variant="outline"
                icon="external"
                onClick={() =>
                  void openUrl(code.verification_uri || MICROSOFT_LINK).catch((error) =>
                    addNotification({ type: "error", message: errorText(error) }),
                  )
                }
              >
                {t("ms.openSiteButton")}
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3 text-[11.5px] leading-relaxed text-[var(--fg)]/80">
          <Icon name="info" size={15} className="mt-[1px] shrink-0 text-[var(--accent)]" />
          <span>{t("ms.notice")}</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider muted">{t("ms.step1")}</div>
            <div className="mt-1 text-[11.5px] font-semibold text-[var(--fg)]/90">{t("ms.openSite")}</div>
            <div className="mt-0.5 break-all text-[10.5px] muted">
              {code?.verification_uri || MICROSOFT_LINK}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider muted">{t("ms.step2")}</div>
            <div className="mt-1 text-[11.5px] font-semibold text-[var(--fg)]/90">{t("ms.enterCode")}</div>
            <div className="mt-0.5 text-[10.5px] muted">{t("ms.confirmCode")}</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-line)] bg-black/35 px-4 py-5 text-center">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] muted">
            {t("ms.deviceCode")}
          </div>
          {starting ? (
            <div className="mt-3 flex items-center justify-center gap-2 text-[12px] muted">
              <Spinner size={16} /> {t("ms.gettingCode")}
            </div>
          ) : (
            <div className="mt-2 select-all font-mono text-[30px] font-bold tracking-[0.18em] text-[var(--fg)]">
              {code?.user_code ?? "————"}
            </div>
          )}
          {code && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <Badge tone="accent">{t("ms.validFor", { min: Math.max(1, Math.round(code.expires_in / 60)) })}</Badge>
              <IconButton icon="copy" label={t("ms.copyCode")} onClick={() => void copyCode()} />
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--fg)]/70">
          {starting || code ? (
            <Spinner size={13} />
          ) : (
            <Icon name="alert" size={14} className="mt-[1px] shrink-0 text-amber-300" />
          )}
          <span>{status || t("ms.restartHint")}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3">
          <span className="text-[9.5px] leading-snug text-white/40">
            {t("ms.passwordNote")}
          </span>
          <Button variant="ghost" size="xs" icon="refresh" loading={starting} onClick={() => void start()}>
            {t("ms.restart")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
