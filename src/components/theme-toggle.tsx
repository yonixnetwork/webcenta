"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/client";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "theme.system", light: "theme.light", dark: "theme.dark" };

/** Persists the choice in a cookie so the server renders the right theme (no flash, no inline script). */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const t = useT();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  function apply() {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (next !== "system") root.classList.add(next);
    document.cookie = `wc-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  return (
    <button type="button" onClick={apply} aria-label={t("theme.switch", { current: t(LABEL[theme]), next: t(LABEL[next]).toLocaleLowerCase() })} title={t(LABEL[theme])}
      className="grid size-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text">
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
