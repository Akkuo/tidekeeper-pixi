// Ghost 殘影：每 2 個邏輯步記錄一次玩家位置，最佳紀錄存 localStorage 並在下次半透明重播
import { loadJSON, saveJSON } from './save.js';

const STEP = 2;
const ANIMS = ['stand', 'run', 'jump', 'swim', 'dash'];
const key = id => 'tidekeeper.ghost.' + id;

export function createGhost(levelId) {
  const saved = levelId == null ? null : loadJSON(key(levelId), null);
  return { levelId, rec: [], play: saved && Array.isArray(saved.f) ? saved.f : null, playTime: saved ? saved.t : 0, frame: 0 };
}

export function recordGhost(gh, p) {
  if (gh.frame++ % STEP) return;
  if (gh.rec.length > 3 * 60 * 60 * 3) return; // 上限約 6 分鐘
  gh.rec.push(Math.round(p.x), Math.round(p.y), (p.facing > 0 ? 1 : 0) | (Math.max(0, ANIMS.indexOf(p.anim)) << 1));
}

// 回傳目前時間點的殘影姿勢；沒有紀錄或播完回傳 null
export function ghostPose(gh) {
  if (!gh.play) return null;
  const i = Math.floor(gh.frame / STEP) * 3;
  if (i + 2 >= gh.play.length) return null;
  const f = gh.play[i + 2];
  return { x: gh.play[i], y: gh.play[i + 1], facing: f & 1 ? 1 : -1, anim: ANIMS[f >> 1] || 'stand' };
}

export function commitGhost(gh, time) {
  if (gh.levelId == null) return;
  saveJSON(key(gh.levelId), { t: time, f: gh.rec });
}
