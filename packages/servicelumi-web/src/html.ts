/**
 * ServiceLumi web layout — zero-dependency server-rendered HTML with the
 * product's own visual identity (industrial slate + signal-orange accent; NOT
 * the SalonLumi look). Dark and light themes, large touch targets for a busy
 * bench, high-contrast state chips, no decorative animation (WCAG 2.2 AA
 * oriented). All dynamic text passes through `esc()`.
 */

import type { Locale } from "./i18n.js";
import { t } from "./i18n.js";

export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Serializes a value for embedding inside an inline `<script>` block. Plain
 * `JSON.stringify` does not neutralize `</script>` or the JS line separators
 * U+2028/U+2029, so a string value could break out of the script context.
 * Escaping `<` (and those separators) keeps the payload inert even if a value
 * ever carries attacker-influenced substrings (defense in depth).
 */
export function jsonForScript(value: unknown): string {
  // Build the match set via fromCharCode so no raw line-separator ever appears
  // in a regex literal (that would be a syntax error). Matches "<" plus the JS
  // line separators U+2028 / U+2029; each is emitted as an inert escape.
  const unsafe = new RegExp("[<" + String.fromCharCode(0x2028, 0x2029) + "]", "gu");
  return JSON.stringify(value).replace(unsafe, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

const CSS = `
:root{color-scheme:light dark;}
[data-theme="dark"]{--bg:#10151c;--panel:#1a212b;--panel2:#222b37;--text:#e8edf4;--muted:#9aa7b8;--line:#2e3947;--accent:#ff7a1a;--accent-text:#1a1004;--ok:#3ecf6f;--warn:#ffc53d;--err:#ff5d5d;--info:#4aa3ff;}
[data-theme="light"]{--bg:#f2f4f7;--panel:#ffffff;--panel2:#e9edf2;--text:#17222e;--muted:#5b6b7d;--line:#d4dce5;--accent:#e05e00;--accent-text:#ffffff;--ok:#1d8a4a;--warn:#a86f00;--err:#c62828;--info:#1565c0;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;font-size:16px;}
a{color:var(--info);text-decoration:none;}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px;}
.demo{background:var(--warn);color:#221a00;font-weight:600;padding:.4rem .8rem;text-align:center;font-size:.85rem;}
header{display:flex;align-items:center;gap:1rem;padding:.6rem 1rem;background:var(--panel);border-bottom:2px solid var(--accent);flex-wrap:wrap;}
.logo{font-size:1.25rem;font-weight:800;letter-spacing:.5px;}
.logo b{color:var(--accent);}
nav{display:flex;gap:.25rem;flex-wrap:wrap;}
nav a{padding:.55rem .8rem;border-radius:8px;color:var(--text);font-weight:600;font-size:.92rem;min-height:44px;display:inline-flex;align-items:center;}
nav a:hover,nav a[aria-current="page"]{background:var(--panel2);color:var(--accent);}
.who{margin-left:auto;color:var(--muted);font-size:.85rem;display:flex;align-items:center;gap:.6rem;}
main{padding:1rem;max-width:1280px;margin:0 auto;}
h1{font-size:1.4rem;margin-bottom:1rem;}
h2{font-size:1.05rem;margin:1rem 0 .5rem;}
.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:1rem;}
.stat{font-size:2rem;font-weight:800;color:var(--accent);}
table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:12px;overflow:hidden;}
th,td{padding:.65rem .75rem;text-align:left;border-bottom:1px solid var(--line);font-size:.92rem;}
th{background:var(--panel2);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);}
form.stack{display:grid;gap:.75rem;max-width:560px;}
label{display:grid;gap:.25rem;font-weight:600;font-size:.9rem;}
input,select,textarea{padding:.7rem;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--text);font-size:1rem;min-height:44px;}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;background:var(--accent);color:var(--accent-text);font-weight:700;border:none;border-radius:10px;padding:.7rem 1.1rem;font-size:1rem;cursor:pointer;min-height:48px;}
button.secondary,.btn.secondary{background:var(--panel2);color:var(--text);border:1px solid var(--line);}
button.danger{background:var(--err);color:#fff;}
.chip{display:inline-block;padding:.25rem .6rem;border-radius:999px;font-size:.78rem;font-weight:700;border:1px solid transparent;}
.st-RECEIVED{background:var(--panel2);color:var(--text);}
.st-DIAGNOSING{background:color-mix(in srgb,var(--info) 20%,transparent);color:var(--info);}
.st-QUOTE_PENDING_APPROVAL{background:color-mix(in srgb,var(--warn) 25%,transparent);color:var(--warn);}
.st-APPROVED{background:color-mix(in srgb,var(--ok) 22%,transparent);color:var(--ok);}
.st-IN_REPAIR{background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--accent);}
.st-WAITING_PARTS{background:color-mix(in srgb,var(--warn) 30%,transparent);color:var(--warn);}
.st-TESTING{background:color-mix(in srgb,var(--info) 25%,transparent);color:var(--info);}
.st-READY_FOR_PICKUP{background:color-mix(in srgb,var(--ok) 30%,transparent);color:var(--ok);}
.st-DELIVERED{background:var(--ok);color:#04240f;}
.st-CANCELLED{background:var(--err);color:#fff;}
.board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);gap:.75rem;overflow-x:auto;padding-bottom:.5rem;}
.col{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:.6rem;min-height:180px;}
.col h3{font-size:.8rem;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem;}
.kcard{background:var(--panel2);border-radius:8px;padding:.55rem;margin-bottom:.5rem;font-size:.85rem;display:block;color:var(--text);}
.timeline{list-style:none;border-left:3px solid var(--accent);padding-left:1rem;display:grid;gap:.5rem;}
.timeline li{position:relative;font-size:.9rem;}
.timeline li::before{content:"";position:absolute;left:-1.45rem;top:.3rem;width:.7rem;height:.7rem;border-radius:50%;background:var(--accent);}
.notice{border-left:4px solid var(--info);background:var(--panel);padding:.7rem .9rem;border-radius:8px;margin:.75rem 0;font-size:.9rem;}
.notice.warn{border-left-color:var(--warn);}
.notice.err{border-left-color:var(--err);}
.notice.ok{border-left-color:var(--ok);}
.muted{color:var(--muted);font-size:.85rem;}
.actionsrow{display:flex;gap:.5rem;flex-wrap:wrap;margin:.5rem 0;}
@media (max-width:720px){header{padding:.5rem;}main{padding:.6rem;}h1{font-size:1.15rem;}}
`;

export interface PageContext {
  readonly locale: Locale;
  readonly theme: "dark" | "light";
  readonly activeNav?: string;
  readonly userLabel?: string;
  readonly tenantLabel?: string;
}

const NAV_ITEMS: readonly { href: string; key: string }[] = Object.freeze([
  { href: "/dashboard", key: "dashboard" },
  { href: "/customers", key: "customers" },
  { href: "/devices", key: "devices" },
  { href: "/orders", key: "orders" },
  { href: "/board", key: "board" },
  { href: "/voice", key: "voicePanel" },
  { href: "/ocr", key: "ocrPanel" },
  { href: "/mobile", key: "mobileView" },
  { href: "/modules", key: "modules" },
  { href: "/audit", key: "auditLog" }
]);

export function page(ctx: PageContext, title: string, body: string): string {
  const nav = ctx.userLabel === undefined
    ? ""
    : `<nav aria-label="main">${NAV_ITEMS.map((n) =>
        `<a href="${n.href}"${ctx.activeNav === n.href ? ' aria-current="page"' : ""}>${esc(t(ctx.locale, n.key))}</a>`
      ).join("")}</nav>
      <div class="who"><span>${esc(ctx.userLabel)} · ${esc(ctx.tenantLabel ?? "")}</span>
      <form method="post" action="/logout"><button class="secondary" type="submit">${esc(t(ctx.locale, "signOut"))}</button></form></div>`;
  return `<!DOCTYPE html>
<html lang="${ctx.locale}" data-theme="${ctx.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ServiceLumi</title>
<style>${CSS}</style>
</head>
<body>
<div class="demo" role="note">${esc(t(ctx.locale, "demoBanner"))}</div>
<header><span class="logo">Service<b>Lumi</b></span>${nav}</header>
<main>
${body}
</main>
</body>
</html>`;
}

export function stateChip(state: string): string {
  return `<span class="chip st-${esc(state)}">${esc(state)}</span>`;
}
