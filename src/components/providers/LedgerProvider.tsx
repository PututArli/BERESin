"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AppSettings } from "@/types/beresin";
import { getAppSettings, saveAppSettings } from "@/lib/storage";

interface LedgerContextValue {
  settings: AppSettings;
  isReady: boolean;
  toggleTheme: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  announcePolite: (msg: string) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  geminiApiKey: "",
  defaultPdfGrid: "2x2",
};

const LedgerContext = createContext<LedgerContextValue>({
  settings: DEFAULT_SETTINGS,
  isReady: false,
  toggleTheme: () => {},
  updateSettings: () => {},
  announcePolite: () => {},
});

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const applyThemeToDom = useCallback((theme: "light" | "dark") => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("beresin_theme", theme);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const s = await getAppSettings();
        if (!active) return;
        setSettings(s);
        applyThemeToDom(s.theme);
      } catch {
        if (!active) return;
        applyThemeToDom("light");
      } finally {
        if (active) setIsReady(true);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [applyThemeToDom]);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const merged: AppSettings = { ...prev, ...patch };
        applyThemeToDom(merged.theme);
        void saveAppSettings(merged).catch(() => {});
        return merged;
      });
    },
    [applyThemeToDom]
  );

  const toggleTheme = useCallback(() => {
    setSettings((prev) => {
      const nextTheme = prev.theme === "light" ? "dark" : "light";
      const merged: AppSettings = { ...prev, theme: nextTheme };
      applyThemeToDom(nextTheme);
      void saveAppSettings(merged).catch(() => {});
      setLiveMessage(
        nextTheme === "dark" ? "Mode gelap diaktifkan." : "Mode terang diaktifkan."
      );
      return merged;
    });
  }, [applyThemeToDom]);

  const announcePolite = useCallback((msg: string) => {
    setLiveMessage("");
    requestAnimationFrame(() => {
      setLiveMessage(msg);
    });
  }, []);

  return (
    <LedgerContext.Provider
      value={{
        settings,
        isReady,
        toggleTheme,
        updateSettings,
        announcePolite,
      }}
    >
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveMessage}
      </div>
    </LedgerContext.Provider>
  );
}

export function useLedger() {
  return useContext(LedgerContext);
}
