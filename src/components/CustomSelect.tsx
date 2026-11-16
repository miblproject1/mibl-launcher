import { Children, isValidElement, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useUi } from "../context/UiContext";

export type SelectPlacement = "down" | "up" | "auto";

interface CustomSelectProps {
  children: ReactNode;
  value?: string | number;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  searchable?: boolean;
  /** Куда раскрывать список. "auto" — вверх, если до нижнего края меньше 260px. */
  placement?: SelectPlacement;
  className?: string;
  disabled?: boolean;
  [key: string]: any;
}

/** Минимальное место под меню: иначе в нижнем доке оно уползает за экран. */
const MIN_SPACE = 260;

export const CustomSelect = ({
  children,
  value,
  onChange,
  searchable = false,
  placement = "auto",
  className = "",
  disabled = false,
  ...rest
}: CustomSelectProps) => {
  const { t } = useUi();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedValue, setSelectedValue] = useState(value ?? "");
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (value !== undefined) {
      setSelectedValue(value);
    }
  }, [value]);

  // Закрываем список по клику вне компонента и по Esc.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const compute = () => {
      if (placement === "up") {
        setOpenUp(true);
        return;
      }
      if (placement === "down") {
        setOpenUp(false);
        return;
      }
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      // В нижнем доке места снизу почти нет — раскрываем вверх.
      setOpenUp(spaceBelow < MIN_SPACE);
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [isOpen, placement]);

  const toggle = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (isOpen) setSearchTerm("");
  };

  const options = Children.toArray(children).filter((child) => {
    if (!searchable || !searchTerm) return true;
    if (isValidElement(child)) {
      const text = String((child.props as { children?: ReactNode }).children ?? "").toLowerCase();
      return text.includes(searchTerm.toLowerCase());
    }
    return true;
  });

  const handleSelect = (optionValue: string) => {
    setSelectedValue(optionValue);
    setIsOpen(false);
    setSearchTerm("");

    if (onChange) {
      const event = {
        target: { value: optionValue },
      } as unknown as ChangeEvent<HTMLSelectElement>;
      onChange(event);
    }
  };

  const current = options.find(
    (child) => isValidElement(child) && (child.props as { value?: string }).value === selectedValue,
  );
  const label = isValidElement(current)
    ? ((current.props as { children?: ReactNode }).children ?? selectedValue)
    : selectedValue || t("common.select");

  return (
    <div ref={rootRef} className={`relative ${className}`} {...rest}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-[#161624] px-3 py-2 text-left text-[12px] text-white shadow-2xl transition-colors hover:border-white/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 truncate">{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute z-[120] w-full overflow-hidden rounded-xl border border-white/15 bg-[#161624] text-white shadow-2xl ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {searchable && (
            <div className="border-b border-white/10 p-2">
              <input
                type="text"
                placeholder={t("common.searching")}
                value={searchTerm}
                autoFocus
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#161624] px-2 py-1 text-sm text-white focus:outline-none"
              />
            </div>
          )}
          <ul className="max-h-60 overflow-y-auto">
            {options.length > 0 ? (
              options.map((child, index) => {
                if (!isValidElement(child)) return null;
                const optionValue = String((child.props as { value?: string }).value ?? "");
                const isSelected = String(selectedValue) === optionValue;
                return (
                  <li
                    key={index}
                    onClick={() => handleSelect(optionValue)}
                    className={`cursor-pointer px-3 py-2 text-[12px] transition-colors hover:bg-white/10 ${
                      isSelected ? "bg-white/10" : ""
                    }`}
                  >
                    {(child.props as { children?: ReactNode }).children}
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-2 text-sm text-white/50">{t("common.nothingFound")}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
