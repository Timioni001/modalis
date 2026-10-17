/**
 * Scripts that run before the first paint, plus the storage keys they read.
 *
 * They live outside any "use client" module on purpose: the root layout is a server component, and
 * a string exported from a client module reaches it as a client reference, not as text. That
 * shipped `function(){throw …}` as the inline script, so neither preference survived a reload.
 */
export const THEME_KEY = "modalis-theme";

export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;

/**
 * Whether the desktop sidebar is expanded or folded to an icon rail.
 *
 * A display preference kept in this browser only. `SIDEBAR_SCRIPT` runs before the first paint so
 * a folded sidebar never opens wide and then snaps shut.
 */
export const SIDEBAR_KEY = "modalis-sidebar";

export const SIDEBAR_SCRIPT = `(function(){try{if(localStorage.getItem("${SIDEBAR_KEY}")==="collapsed")document.documentElement.dataset.sidebar="collapsed";}catch(e){}})();`;
