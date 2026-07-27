"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface GlobalContextType {
  market: string;
  setMarket: (m: string) => void;
  timeframe: string;
  setTimeframe: (t: string) => void;
  shouldRefresh: number;
  triggerRefresh: () => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  profileName: string;
  profilePhoto: string;
  setProfile: (name: string, photo: string) => void;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

import { getSettings, saveSettings } from "@/lib/storage";

export function GlobalProvider({ children }: { children: React.ReactNode }) {
  const [market, setMarketState] = useState("US");
  const [timeframe, setTimeframe] = useState("1Y");

  // Persist market so the top-bar selection sticks across pages/reloads.
  const setMarket = (m: string) => {
    setMarketState(m);
    saveSettings({ market: m });
  };
  const [shouldRefresh, setShouldRefresh] = useState(0);
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [profileName, setProfileName] = useState<string>("John Doe");
  const [profilePhoto, setProfilePhoto] = useState<string>("");

  useEffect(() => {
    const s = getSettings();
    if (s.market) setMarket(s.market);
    if (s.timeframe) setTimeframe(s.timeframe);
    if (s.theme) {
      const t = s.theme === "dark" ? "dark" : "light";
      setThemeState(t);
      try { if (typeof document !== "undefined") { if (t === "dark") document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark"); } } catch(e){}
    }
    if (s.profileName) setProfileName(s.profileName);
    if (s.profilePhoto) setProfilePhoto(s.profilePhoto);
  }, []);

  const triggerRefresh = () => setShouldRefresh((prev) => prev + 1);

  const setTheme = (t: "light" | "dark") => {
    setThemeState(t);
    saveSettings({ theme: t });
    // toggle body class
    try {
      if (typeof document !== "undefined") {
        if (t === "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
      }
    } catch (e) {}
  };

  const setProfile = (name: string, photo: string) => {
    setProfileName(name);
    setProfilePhoto(photo);
    saveSettings({ profileName: name, profilePhoto: photo });
  };

  return (
    <GlobalContext.Provider
      value={{
        market,
        setMarket,
        timeframe,
        setTimeframe,
        shouldRefresh,
        triggerRefresh,
        theme,
        setTheme,
        profileName,
        profilePhoto,
        setProfile,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
}

export function useGlobal() {
  const context = useContext(GlobalContext);
  if (context === undefined) {
    throw new Error("useGlobal must be used within a GlobalProvider");
  }
  return context;
}
