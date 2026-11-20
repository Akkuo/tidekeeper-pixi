// 關卡編輯器邏輯：畫磚、放出生點／出口／敵人、匯出 JSON、存 localStorage。無任何繪圖。
import { ROWS } from './constants.js';
import { loadJSON, saveJSON } from './save.js';

export const BRUSHES = ['#', '=', 'B', 'W', 't', '^', 'K', '<', '>', 'o', 'c', 'j', 'p', 'C', 'S', 'E', '.'];
export const BRUSH_NAMES = {
  '#': '岩石', '=': '單向木板', B: '易碎牆', W: '濕滑地', t: '潮池', '^': '海膽', K: '晶刺', '<': '左海流', '>': '右海流',
  o: '潮之珠', c: '螃蟹', j: '水母', p: '河豚', C: '檢查點', S: '出生點', E: '出口', '.': '橡皮擦',
};
const KEY = 'tidekeeper.custom';

export function blankRows(w = 64) {
  const rows = [];
  for (let y = 0; y < ROWS; y++) rows.push(y >= 14 ? '#'.repeat(w) : '.'.repeat(w));
  rows[13] = '..S' + '.'.repeat(w - 6) + 'E..';
  return rows;
}

export function createEditor(rows, theme = 0) {
  return { grid: rows.map(r => r.split('')), w: rows[0].length, h: rows.length, theme, brush: 0,
    camX: 0, camY: 0, cursor: { x: -1, y: -1 }, msg: '左鍵畫、右鍵擦；1–9/0 或 [ ] 換筆刷', msgT: 4, tidePreview: false };
}
export const loadCustom = () => loadJSON(KEY, null);
export const editorRows = ed => ed.grid.map(r => r.join(''));
export const exportJSON = ed => JSON.stringify({ format: 'tidekeeper-level-1', theme: ed.theme, rows: editorRows(ed) }, null, 1);

export function editorSave(ed) {
  const ok = saveJSON(KEY, { theme: ed.theme, rows: editorRows(ed) });
  return ok;
}

export function editorPaint(ed, cx, cy, erase) {
  if (cx < 0 || cy < 0 || cx >= ed.w || cy >= ed.h) return false;
  const c = erase ? '.' : BRUSHES[ed.brush];
  if (ed.grid[cy][cx] === c) return false;
  if (c === 'S' || c === 'E') for (const r of ed.grid) for (let x = 0; x < r.length; x++) if (r[x] === c) r[x] = '.';
  ed.grid[cy][cx] = c;
  // 畫到最右側兩欄時自動加寬（上限 400 欄）
  if (cx >= ed.w - 2 && ed.w < 400) { for (let y = 0; y < ed.h; y++) ed.grid[y].push(...(y >= 14 ? '########' : '........').split('')); ed.w += 8; }
  return true;
}

// 處理編輯器鍵盤；回傳要宿主執行的指令（'test'/'exit'/'export'）或 null
export function editorKeys(ed, codes, down, dt, viewW, viewH, T) {
  let cmd = null;
  for (const c of codes) {
    if (c.startsWith('Digit')) { const n = +c.slice(5); ed.brush = n === 0 ? 9 : n - 1; flash(ed, '筆刷：' + BRUSH_NAMES[BRUSHES[ed.brush]]); }
    else if (c === 'BracketRight') { ed.brush = (ed.brush + 1) % BRUSHES.length; flash(ed, '筆刷：' + BRUSH_NAMES[BRUSHES[ed.brush]]); }
    else if (c === 'BracketLeft') { ed.brush = (ed.brush + BRUSHES.length - 1) % BRUSHES.length; flash(ed, '筆刷：' + BRUSH_NAMES[BRUSHES[ed.brush]]); }
    else if (c === 'KeyG') { ed.theme = (ed.theme + 1) % 6; flash(ed, '配色主題 ' + (ed.theme + 1)); }
    else if (c === 'KeyQ') { ed.tidePreview = !ed.tidePreview; flash(ed, ed.tidePreview ? '預覽：滿潮' : '預覽：乾潮'); }
    else if (c === 'KeyN') { const g = createEditor(blankRows(), ed.theme); Object.assign(ed, g); flash(ed, '新空白關卡'); }
    else if (c === 'KeyL') { const s = loadCustom(); if (s && s.rows) { Object.assign(ed, createEditor(s.rows, s.theme | 0)); flash(ed, '已載入存檔'); } else flash(ed, '沒有存檔'); }
    else if (c === 'KeyX') { editorSave(ed); cmd = 'export'; }
    else if (c === 'KeyT') { editorSave(ed); cmd = 'test'; }
    else if (c === 'F2' || c === 'Escape') cmd = 'exit';
  }
  const sp = 260 * dt;
  if (down.left) ed.camX -= sp; if (down.right) ed.camX += sp;
  if (down.jump) ed.camY -= sp; if (down.down) ed.camY += sp;
  ed.camX = Math.max(-T * 2, Math.min(ed.w * T - viewW + T * 2, ed.camX));
  ed.camY = Math.max(Math.min(0, (ed.h * T - viewH) / 2), Math.min(Math.max(0, ed.h * T - viewH), ed.camY));
  ed.msgT = Math.max(0, ed.msgT - dt);
  return cmd;
}
export function flash(ed, msg) { ed.msg = msg; ed.msgT = 2.5; }
