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
  toggleTheme: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
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
  toggleTheme: async () => {},
  updateSettings: async () => {},
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
    init();
    return () => {
      active = false;
    };
  }, [applyThemeToDom]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const merged: AppSettings = { ...settings, ...patch };
      setSettings(merged);
      applyThemeToDom(merged.theme);
      try {
        await saveAppSettings(merged);
      } catch {
        // Keep in-memory state if IndexedDB is unavailable
      }
    },
    [settings, applyThemeToDom]
  );

  const toggleTheme = useCallback(async () => {
    const nextTheme = settings.theme === "light" ? "dark" : "light";
    await updateSettings({ theme: nextTheme });
    setLiveMessage(
      nextTheme === "dark"
        ? "Tema gelap Meja Malam diaktifkan."
        : "Tema terang Kertas Arsip diaktifkan."
    );
  }, [settings.theme, updateSettings]);

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
