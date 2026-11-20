// 磚塊碰撞與水體查詢（純邏輯）
import { T, SOLID_TILES } from './constants.js';

export function tileAt(lv, cx, cy) {
  if (cx < 0 || cx >= lv.w || cy < 0) return '#';
  if (cy >= lv.h) return '.';
  return lv.grid[cy][cx];
}
export const isSolidTile = c => SOLID_TILES.includes(c);
export const solidAt = (lv, cx, cy) => isSolidTile(tileAt(lv, cx, cy));

// 某世界座標是否在水中：低於全域水線（且不是實心），或位於潮池格
export function waterAt(g, x, y) {
  const cx = Math.floor(x / T), cy = Math.floor(y / T);
  const t = tileAt(g.level, cx, cy);
  if (isSolidTile(t)) return false;
  return t === 't' || (y >= g.waterY && cy < g.level.h + 4);
}

// 由 (x,y) 往上找水面高度（處理潮池與全域水線）
export function surfaceAbove(g, x, y) {
  const lv = g.level, cx = Math.floor(x / T);
  let cy = Math.floor(y / T);
  for (let i = 0; i < 40; i++) {
    const up = tileAt(lv, cx, cy - 1);
    if (isSolidTile(up)) return cy * T;
    if (up === 't' || cy * T > g.waterY) { cy--; continue; }
    break;
  }
  return tileAt(lv, cx, cy) !== 't' && g.waterY > cy * T ? g.waterY : cy * T;
}

export function moveX(lv, b, dx) {
  if (!dx) return;
  b.x += dx;
  const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
  if (dx > 0) {
    const cx = Math.floor((b.x + b.w - 0.01) / T);
    for (let y = y0; y <= y1; y++) if (solidAt(lv, cx, y)) { b.x = cx * T - b.w; b.vx = 0; b.hitWall = 1; return; }
  } else {
    const cx = Math.floor(b.x / T);
    for (let y = y0; y <= y1; y++) if (solidAt(lv, cx, y)) { b.x = (cx + 1) * T; b.vx = 0; b.hitWall = -1; return; }
  }
}

export function moveY(lv, b, dy, dropThrough = false) {
  if (!dy) return;
  const prevBottom = b.y + b.h;
  b.y += dy;
  const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
  if (dy > 0) {
    const cy = Math.floor((b.y + b.h - 0.01) / T);
    for (let x = x0; x <= x1; x++) {
      const t = tileAt(lv, x, cy);
      if (isSolidTile(t) || (t === '=' && !dropThrough && prevBottom <= cy * T + 0.01)) {
        b.y = cy * T - b.h; b.vy = 0; b.onGround = true; b.groundTile = t; return;
      }
    }
  } else {
    const cy = Math.floor(b.y / T);
    for (let x = x0; x <= x1; x++) if (solidAt(lv, x, cy)) { b.y = (cy + 1) * T; b.vy = 0; b.hitCeil = true; return; }
  }
}

export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// 檢查物體是否碰到危害磚（海膽 ^、晶刺 K），回傳碰到的格中心 x 或 null
export function hazardHit(lv, b) {
  const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.01) / T);
  const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.01) / T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = tileAt(lv, x, y);
    if (t !== '^' && t !== 'K') continue;
    const r = t === '^' ? { x: x * T + 3, y: y * T + 7, w: T - 6, h: T - 7 } : { x: x * T + 3, y: y * T + 3, w: T - 6, h: T - 6 };
    if (overlap(b, r)) return x * T + T / 2;
  }
  return null;
}
