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
import "./styles.css";

const base = import.meta.env.BASE_URL;
document.documentElement.style.setProperty("--asset-hq-office", `url("${base}assets/hq-office.webp")`);
document.documentElement.style.setProperty("--asset-world-map", `url("${base}assets/world-map.webp")`);
document.documentElement.style.setProperty("--asset-tarmac", `url("${base}assets/tarmac.webp")`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
