import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/saira-condensed/600.css";
import "@fontsource/saira-condensed/700.css";
import { App } from "./App.tsx";
import { cssImageUrl, DEFAULT_FOUNDER_SHOT } from "./art.ts";
import "./styles.css";

document.documentElement.style.setProperty("--asset-hq-office", cssImageUrl(DEFAULT_FOUNDER_SHOT));
document.documentElement.style.setProperty("--asset-world-map", cssImageUrl("world-map"));
document.documentElement.style.setProperty("--asset-tarmac", cssImageUrl("tarmac"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
