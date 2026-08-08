/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "@/i18n/en";
import { ru, type Dictionary, type Locale } from "@/i18n/ru";

export type { Locale };

const STORAGE_KEY = "intqst:locale";
const dictionaries: Record<Locale, Dictionary> = { ru, en };

/** ru* → русская локаль; любой другой язык браузера → английская. */
export function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ru" || stored === "en") return stored;
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((lang) => lang?.toLowerCase().startsWith("ru")) ? "ru" : "en";
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Перевод по ключу словаря; динамические ключи (role.{role}.short) тоже допустимы. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (next) => {
        localStorage.setItem(STORAGE_KEY, next);
        setLocaleState(next);
      },
      t: (key, vars) => {
        let text =
          dictionaries[locale][key as keyof Dictionary] ??
          dictionaries.en[key as keyof Dictionary] ??
          String(key);
        if (vars) {
          for (const [name, val] of Object.entries(vars)) {
            text = text.split(`{${name}}`).join(String(val));
          }
        }
        return text;
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
