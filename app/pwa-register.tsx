"use client";

import { useEffect } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type InstallWindow = Window & { lifeQuestInstallPrompt?: InstallPromptEvent };

export default function PwaRegister() {
  useEffect(() => {
    const captureInstall = (event: Event) => {
      event.preventDefault();
      (window as InstallWindow).lifeQuestInstallPrompt = event as InstallPromptEvent;
      window.dispatchEvent(new Event("lifequest-install-ready"));
    };
    const clearInstall = () => {
      delete (window as InstallWindow).lifeQuestInstallPrompt;
    };

    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", clearInstall);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("beforeinstallprompt", captureInstall);
        window.removeEventListener("appinstalled", clearInstall);
      };
    }

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("LifeQuest service worker could not be registered.", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return () => {
        window.removeEventListener("beforeinstallprompt", captureInstall);
        window.removeEventListener("appinstalled", clearInstall);
      };
    }

    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", clearInstall);
    };
  }, []);

  return null;
}
