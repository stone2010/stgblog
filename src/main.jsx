import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import "./style-palettes.css";
import "./style-editorial.css";
import "./style-honors.css";
import "./style-growth.css";
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

// v13：编辑部版成为默认主题。用一次性标记把「未主动设置过」的旧客户端
// 切到编辑部版，之后用户在「设置 → 外观」里的选择永远优先、不再被覆盖。
try {
  let style = localStorage.getItem("stgblog_style");
  if (localStorage.getItem("stgblog_style_v13") !== "1") {
    style = "editorial";
    localStorage.setItem("stgblog_style", "editorial");
    localStorage.setItem("stgblog_style_v13", "1");
  }
  if (style === "editorial") document.documentElement.setAttribute("data-style", "editorial");
  else document.documentElement.removeAttribute("data-style");
} catch {
  document.documentElement.setAttribute("data-style", "editorial");
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
