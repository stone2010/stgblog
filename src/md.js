// ─── 轻量 Markdown 渲染器(先整体转义,再白名单转换,防 XSS)───

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeUrl(u) {
  const t = String(u || "").trim();
  return /^(https?:\/\/|\/)/i.test(t) ? esc(t) : "";
}

// 行内语法(输入为原文,内部先转义)
function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, (_, c) => "<code>" + c + "</code>");
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    const u = safeUrl(url);
    return u ? '<img src="' + u + '" alt="' + alt + '" loading="lazy" />' : alt;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => {
    const u = safeUrl(url);
    return u ? '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + txt + "</a>" : txt;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return out;
}

export function renderMarkdown(src) {
  const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0, listType = null, para = [];
  const flushPara = () => {
    if (para.length) { out.push("<p>" + para.map(inline).join("<br/>") + "</p>"); para = []; }
  };
  const closeList = () => {
    if (listType) { out.push(listType === "ul" ? "</ul>" : "</ol>"); listType = null; }
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara(); closeList();
      const buf = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) { flushPara(); closeList(); out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { flushPara(); closeList(); out.push("<hr/>"); i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      flushPara(); closeList();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push("<blockquote>" + buf.map(inline).join("<br/>") + "</blockquote>");
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)/);
    if (ul) {
      flushPara();
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push("<li>" + inline(ul[1]) + "</li>"); i++; continue;
    }
    const ol = line.match(/^\s*\d+[.、)]\s+(.*)/);
    if (ol) {
      flushPara();
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push("<li>" + inline(ol[1]) + "</li>"); i++; continue;
    }
    if (!line.trim()) { flushPara(); closeList(); i++; continue; }
    closeList(); para.push(line); i++;
  }
  flushPara(); closeList();
  return out.join("\n");
}

// 去掉 md 语法取纯文本片段(卡片摘要用)
export function mdToPlain(src, n = 110) {
  const t = String(src || "")
    .replace(/```[\s\S]*?```/g, " [代码] ")
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, " [图] ")
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`>#]+/g, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}
