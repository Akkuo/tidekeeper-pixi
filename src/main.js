// 進入點（Pixi 版）：建立 core 遊戲（與 Canvas 版逐位元組相同）、PixiJS renderer，綁定鍵盤／指標／觸控，跑固定步長主迴圈
import { createGame } from './core/game.js';
import { createAudio } from './core/audio.js';
import { DT } from './core/constants.js';
import { KEYMAP, EXTRA_KEYS } from './core/input.js';
import { createRenderer } from './render-pixi/renderer.js';
import { setupTouch } from './touch.js';

const canvas = document.getElementById('game');
const audio = createAudio();
const game = createGame({
  audio,
  host: {
    copy(text) {
      try { if (!navigator.clipboard) return false; navigator.clipboard.writeText(text).catch(() => {}); return true; }
      catch (e) { return false; }
    },
  },
});
const renderer = createRenderer(canvas, game);

function layout() { const w = window.innerWidth, h = window.innerHeight; renderer.resize(w, h); game.setView(w, h); }
addEventListener('resize', layout);
layout();

addEventListener('keydown', e => {
  audio.unlock();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.repeat) { if (KEYMAP[e.code] || EXTRA_KEYS.includes(e.code)) e.preventDefault(); return; }
  // G：編輯器外即時開關所有 Filter（走 core 既有的 fx 動作，與 V 同一個開關；編輯器內 G 仍是換配色）
  if (e.code === 'KeyG' && game.scene !== 'editor') game.input.pressed.fx = true;
  if (game.input.keyDown(e.code)) e.preventDefault();
});
addEventListener('keyup', e => game.input.keyUp(e.code));
addEventListener('blur', () => game.input.releaseAll());

const norm = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
canvas.addEventListener('pointerdown', e => {
  audio.unlock();
  const [nx, ny] = norm(e);
  game.pointer(nx, ny, e.button === 2 ? 2 : 1, true);
});
canvas.addEventListener('pointermove', e => {
  if (game.scene !== 'editor') return;
  const [nx, ny] = norm(e);
  game.pointer(nx, ny, e.buttons & 1 ? 1 : e.buttons & 2 ? 2 : 0, false);
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

setupTouch(game, audio);

// 固定步長迴圈 + 插值繪製
let last = performance.now(), acc = 0, fpsN = 0, fpsT = last;
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000); last = now;
  while (acc >= DT) { game.update(DT); acc -= DT; }
  renderer.render(acc / DT);
  fpsN++;
  if (now - fpsT >= 500) { game.fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 自動驗證掛鉤
const q = new URLSearchParams(location.search);
window.__debug = () => ({ ...game.snapshot(), gpu: window.__gpu ? window.__gpu() : null }); // gpu：renderer 端唯讀統計
if (q.get('debug') === '1') window.__game = game; // 僅供自動測試傳送／檢查
window.__start = (lvl) => { audio.unlock(); game.startLevel(Math.max(0, Math.min(5, (lvl || +q.get('level') || 1) - 1))); };
if (q.get('autostart') === '1') window.__start();
