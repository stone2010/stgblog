import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import "./style-palettes.css";
import "./style-editorial.css";
import { applyAccentColors } from "./context/AuthContext";

// 配色主题在 React 挂载前先落地,避免首帧闪错色(默认复古暖调)
try {
  document.documentElement.setAttribute(
    "data-palette",
    localStorage.getItem("stgblog_palette") === "modern" ? "modern" : "vintage"
  );
} catch {
  document.documentElement.setAttribute("data-palette", "vintage");
}

// 主题色（强调色）同样在 React 挂载前落地，避免首帧闪回默认色
try { applyAccentColors(localStorage.getItem("stgblog_accent") || "green"); } catch {}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
