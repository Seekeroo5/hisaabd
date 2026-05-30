import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bungee/latin-400.css";
import "./index.css";
import App from "./App.tsx";
import { ClerkProvider } from "@clerk/react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      registrations.forEach((registration) => registration.unregister()),
    );
  caches
    .keys()
    .then((keys) =>
      keys
        .filter((key) => key.startsWith("dailytally-"))
        .forEach((key) => void caches.delete(key)),
    );
}
