// localStorage 存取，全部包 try/catch；失敗時遊戲照常可玩
const KEY = 'tidekeeper.v1';

export function loadJSON(key, fallback) {
  try { const s = globalThis.localStorage && globalThis.localStorage.getItem(key); return s ? JSON.parse(s) : fallback; }
  catch (e) { return fallback; }
}
export function saveJSON(key, value) {
  try { globalThis.localStorage && globalThis.localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

export function loadProgress() {
  const d = loadJSON(KEY, null) || {};
  return { unlocked: Math.max(1, d.unlocked | 0), best: d.best || {}, pearls: d.pearls || {}, muted: !!d.muted };
}
export const saveProgress = prog => saveJSON(KEY, prog);
