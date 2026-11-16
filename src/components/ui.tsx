import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/utils";
import { useUi } from "../context/UiContext";
import { Icon, type IconName } from "./Icon";

/* ------------------------------------------------------------------ layout */
export function GlassCard({
  children,
  className,
  style,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  hover?: boolean;
}) {
  return (
    <div
      className={cn("glass relative overflow-hidden", hover && "transition-colors", className)}
      style={style}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-semibold leading-none tracking-tight text-[var(--fg)]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-[12.5px] muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
  right,
}: {
  icon?: IconName;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-[var(--fg)]">
        {icon && <Icon name={icon} size={16} className="text-[var(--accent)]" />}
        {children}
      </div>
      {right}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--fg)]/85">{label}</span>
      )}
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-snug muted">{hint}</span>}
    </label>
  );
}

/* ----------------------------------------------------------------- buttons */
type ButtonVariant =
  | "play"
  | "primary"
  | "secondary"
  | "soft"
  | "ghost"
  | "outline"
  | "icon"
  | "danger"
  | "success";
type ButtonSize = "xs" | "sm" | "md";

const SECONDARY =
  "bg-white/[0.05] text-zinc-200 border border-white/[0.08] hover:bg-white/[0.09] hover:text-white";
const ICON_SURFACE =
  "bg-white/[0.04] text-zinc-300 border border-white/[0.06] hover:bg-white/[0.09] hover:text-white";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  play: "bg-[#16A34A] text-white border border-emerald-400/20 shadow-sm hover:bg-[#15803D]",
  primary: "bg-[#5E6AD2] text-white border border-white/10 shadow-sm hover:bg-[#6B77E5]",
  secondary: SECONDARY,
  soft: SECONDARY,
  outline: "bg-transparent text-zinc-300 border border-white/[0.08] hover:bg-white/[0.06] hover:text-white",
  ghost: "bg-transparent text-zinc-400 border border-transparent hover:bg-white/[0.06] hover:text-zinc-100",
  icon: ICON_SURFACE,
  danger: "bg-rose-600/90 text-white border border-rose-400/20 shadow-sm shadow-rose-950/40 hover:bg-rose-600",
  success: "bg-[#16A34A] text-white border border-emerald-400/20 shadow-sm hover:bg-[#15803D]",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-7 gap-1.5 rounded-md px-2.5 text-[11px]",
  sm: "h-9 gap-2 rounded-lg px-3.5 text-sm",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
};

export function Button({
  children,
  variant = "secondary",
  size = "sm",
  icon,
  loading = false,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      data-btn="true"
      data-variant={variant}
      className={cn(
        "focus-ring inline-flex shrink-0 select-none items-center justify-center font-medium text-sm transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "xs" ? 11 : 14} />
      ) : icon ? (
        <Icon name={icon} size={size === "xs" ? 12 : 14} />
      ) : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = "sm",
  variant = "icon",
  className,
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const dims =
    size === "xs" ? "h-7 w-7 rounded-md" : size === "md" ? "h-10 w-10 rounded-lg" : "h-9 w-9 rounded-lg";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      data-btn="true"
      data-variant={variant}
      className={cn(
        "focus-ring inline-flex shrink-0 select-none items-center justify-center font-medium text-sm transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        BUTTON_VARIANTS[variant],
        dims,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === "xs" ? 13 : 15} />
    </button>
  );
}

/* ------------------------------------------------------------------ inputs */
export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "focus-ring h-9 w-full rounded-lg border border-white/[0.07] bg-[#0F1116] px-3 text-[13px] text-[var(--fg)] placeholder:text-[var(--muted)]/70 transition-colors hover:border-white/[0.12] focus:border-[var(--accent-line)] focus:bg-[#11131a]",
        className,
      )}
      {...rest}
    />
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "focus-ring min-h-[84px] w-full resize-y rounded-lg border border-white/[0.07] bg-[#0F1116] px-3 py-2 text-[12px] leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)]/70 transition-colors hover:border-white/[0.12] focus:border-[var(--accent-line)] focus:bg-[#11131a]",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "focus-ring h-9 w-full rounded-lg border border-white/[0.07] bg-[#0F1116] px-3 text-[13px] text-[var(--fg)] outline-none transition-colors hover:border-white/[0.12] focus:border-[var(--accent-line)]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export { CustomSelect } from "./CustomSelect";

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  leftLabel,
  rightLabel,
  className,
}: {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  display?: string;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={cn("w-full", className)}>
      {(label || display) && (
        <div className="mb-2 flex items-center justify-between gap-3">
          {label && <span className="text-[11.5px] font-semibold text-[var(--fg)]/85">{label}</span>}
          {display && (
            <span className="rounded-md bg-[var(--accent-soft)] px-1.5 py-[2px] text-[10.5px] font-bold text-[var(--accent)]">
              {display}
            </span>
          )}
        </div>
      )}
      <input
        type="range"
        className="range-accent"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--range-pct": `${pct}%` } as CSSProperties}
      />
      {(leftLabel || rightLabel) && (
        <div className="mt-1 flex justify-between text-[10px] muted">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-[12px] muted transition-colors hover:text-[var(--fg)]"
    >
      <span
        className={cn(
          "relative h-[20px] w-[34px] rounded-full border transition-colors",
          checked ? "border-[#5E6AD2]/70 bg-[#5E6AD2]" : "border-white/10 bg-white/[0.08]",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="absolute top-[3px] h-[13px] w-[13px] rounded-full bg-white shadow"
          style={{ left: checked ? 18 : 3 }}
        />
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------- tabs */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ key: T; label: string; icon?: IconName; badge?: number }>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  const groupId = useId();
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[#0F1116]/90 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              "relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors",
              active ? "text-white" : "text-zinc-400 hover:text-zinc-100",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tabs-active-${groupId}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg border border-white/[0.08] bg-white/[0.07] shadow-sm"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon && <Icon name={option.icon} size={13} />}
              {option.label}
              {typeof option.badge === "number" && option.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-[1px] text-[9px] font-semibold",
                    active ? "bg-white/15 text-white" : "bg-white/[0.08] text-zinc-400",
                  )}
                >
                  {option.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ key: T; label: string; icon?: IconName; badge?: number }>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  const groupId = useId();
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[#0F1116]/90 p-1", className)}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={cn(
              "relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-medium transition-colors",
              active ? "text-white" : "text-zinc-400 hover:text-zinc-100",
            )}
          >
            {active && (
              <motion.span
                layoutId={`segmented-active-${groupId}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg border border-[#5E6AD2]/40 bg-[#5E6AD2]/20 shadow-sm"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon && <Icon name={option.icon} size={13} />}
              {option.label}
              {typeof option.badge === "number" && option.badge > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-[1px] text-[9px] font-semibold",
                    active ? "bg-white/15 text-white" : "bg-white/[0.08] text-zinc-400",
                  )}
                >
                  {option.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ status */
export function Progress({
  value,
  total,
  active = true,
  className,
  thin = false,
}: {
  value: number;
  total: number;
  active?: boolean;
  className?: string;
  thin?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-black/35",
        thin ? "h-1" : "h-1.5",
        className,
      )}
    >
      {total === 0 && active ? (
        <div className={cn("shimmer absolute inset-0 rounded-full bg-[var(--accent)]/35")} />
      ) : (
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", active && total < 100 && "shimmer")}
          style={{
            background: "linear-gradient(90deg, #5E6AD2, #818CF8)",
            boxShadow: "0 0 12px var(--accent-line)",
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
        />
      )}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warn" | "danger";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-[var(--fg-line)] bg-[var(--fg-soft)] text-[var(--fg)]/85",
    accent: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--fg)]",
    success: "border-emerald-400/30 bg-emerald-400/12 text-emerald-200",
    warn: "border-amber-400/30 bg-amber-400/12 text-amber-100",
    danger: "border-rose-400/30 bg-rose-400/12 text-rose-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10.5px] font-semibold leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/20 border-t-white/80"
      style={{ width: size, height: size }}
    />
  );
}

export function SkinHead({
  url,
  size = 42,
  className,
}: {
  url: string | null | undefined;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-[10px] border border-white/15",
        !url && "bg-gradient-to-br from-[var(--accent)]/60 to-[var(--panel2)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundImage: url ? `url("${url}")` : undefined,
        backgroundSize: "800% 800%",
        backgroundPosition: "-100% -100%",
        imageRendering: "pixelated",
      }}
    >
      {!url && (
        <div className="flex h-full w-full items-center justify-center">
          <Icon name="users" size={size * 0.5} className="text-white/80" />
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon = "cube",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 px-8 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon name={icon} size={26} />
      </div>
      <div>
        <div className="text-[15px] font-semibold">{title}</div>
        {text && <div className="mt-1 max-w-[420px] text-[12px] muted">{text}</div>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- modal */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 580,
  panelClassName,
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  panelClassName?: string;
  bodyClassName?: string;
}) {
  const { t } = useUi();
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              "glass-strong relative flex max-h-[90vh] w-full flex-col overflow-hidden",
              panelClassName,
            )}
            style={panelClassName ? undefined : { maxWidth: width }}
            initial={{ opacity: 0, y: 22, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
              <div>
                <h2 className="text-[16px] font-semibold tracking-tight text-[var(--fg)]">{title}</h2>
                {subtitle && <p className="mt-1 text-[11.5px] muted">{subtitle}</p>}
              </div>
              <IconButton icon="x" label={t("common.close")} size="xs" onClick={onClose} />
            </div>
            <div className={cn("flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useUi();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-[var(--fg)]/80">{text}</p>
    </Modal>
  );
}
