// PixiJS v8 renderer：createRenderer(canvas, game) → { render(alpha), resize(w,h), destroy() }（與 Canvas 版同一介面）
// 遊戲狀態唯讀。世界畫進低解析度 RenderTexture（view.w × view.h，nearest 放大），濾鏡也在低解析度上跑：
//   DisplacementFilter（水下折射）→ 自寫 god rays → 自寫潮汐震波；G / V 即時開關。HUD、選單、編輯器以 Pixi Graphics + Text 原生解析度繪製。
import { Application, Container, Graphics, Sprite, Text, RenderTexture, Rectangle } from 'pixi.js';
import { T, MENU, LEVEL_COUNT } from '../core/constants.js';
import { SPRITES } from '../core/sprite-data.js';
import { THEMES, LEVELS } from '../core/levels.js';
import { bossHead, bossSegments } from '../core/entities.js';
import { BRUSHES, BRUSH_NAMES } from '../core/editor.js';
import { buildTextures } from './textures.js';
import { createFilters } from './filters.js';
import { framePool, freePool, textPool } from './pool.js';

const FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",system-ui,sans-serif';
const MONO = 'Consolas,"Cascadia Mono",Menlo,monospace';
// 以 0.1 秒為單位取整再拆分，避免 59.96 → "00:60.0"
const fmt = t => { if (t == null) return '--:--.-'; const d = Math.round(t * 10), m = Math.floor(d / 600), s = (d % 600) / 10; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };

// CSS 色字串 → { color, alpha }（快取）
const colCache = new Map();
function C(s) {
  let r = colCache.get(s);
  if (r) return r;
  let n = 0, a = 1;
  if (s[0] === '#') { let h = s.slice(1); if (h.length === 3) h = h.split('').map(c => c + c).join(''); n = parseInt(h, 16); }
  else { const v = s.match(/[\d.]+/g).map(Number); n = (v[0] << 16) | (v[1] << 8) | v[2]; if (v.length > 3) a = v[3]; }
  r = { color: n, alpha: a }; colCache.set(s, r);
  return r;
}
const hex = s => C(s).color;
const mix = (a, b, k) => { const A = hex(a), B = hex(b), m = (sh) => Math.round(((A >> sh) & 255) * (1 - k) + ((B >> sh) & 255) * k) << sh; return m(16) | m(8) | m(0); };

// 各主題的光束設定：光源（0..1，可在畫面外）、顏色、強度
const RAYS = {
  shore: { l: [0.78, -0.25], c: [1.0, 0.95, 0.72], s: 0.34 },
  coral: { l: [0.3, -0.3], c: [0.55, 1.0, 0.95], s: 0.46 },
  wreck: { l: [0.62, -0.3], c: [0.7, 1.0, 0.75], s: 0.36 },
  crystal: { l: [0.5, -0.2], c: [0.85, 0.6, 1.0], s: 0.38 },
  storm: { l: [0.7, 0.18], c: [1.0, 0.9, 0.55], s: 0.26 },
  abyss: { l: [0.5, -0.3], c: [0.4, 0.5, 1.0], s: 0.34 },
};

export function createRenderer(canvas, game) {
  let app = null, ready = false, dead = false;
  let W = 1, H = 1, dpr = 1, lastEv = 0, lastT = performance.now(), rt = 0, bubbleAcc = 0, playerBubbleT = 0;
  const S = {}; // Pixi 物件集合（init 後填入）
  const parts = [], bubbles = [], debris = [];

  (async () => {
    try {
      app = new Application();
      await app.init({ canvas, width: W, height: H, resolution: dpr, autoDensity: true, antialias: false, background: '#02101f', preference: 'webgl', autoStart: false, sharedTicker: false });
      if (dead) { app.destroy(); return; }
      app.ticker.stop();
      setup();
      ready = true;
      resize(W, H);
    } catch (e) { console.error('Pixi 初始化失敗', e); }
  })();

  function setup() {
    const tx = buildTextures(SPRITES, THEMES);
    S.tx = tx;
    S.fx = createFilters(tx);
    // ---- 世界（畫進 RenderTexture）----
    S.worldRoot = new Container();
    S.worldRoot.addChild(S.fx.dispSprite);            // 位移圖：被下方不透明背景蓋住
    S.scene = new Container();
    S.worldRoot.addChild(S.scene);
    S.bgG = new Graphics(); S.waterBackG = new Graphics();
    S.cam = new Container(); S.camFront = new Container();
    S.waterFrontG = new Graphics(); S.titleG = new Graphics();
    S.scene.addChild(S.bgG, S.waterBackG, S.cam, S.waterFrontG, S.camFront, S.titleG);
    const layer = parent => { const c = new Container(); parent.addChild(c); return c; };
    const tileC = layer(S.cam); S.animG = new Graphics(); S.cam.addChild(S.animG);
    const entC = layer(S.cam); S.bossG = new Graphics(); S.cam.addChild(S.bossG);
    const actorC = layer(S.cam); S.fgG = new Graphics(); S.cam.addChild(S.fgG);
    const glowC = layer(S.cam); const partC = layer(S.cam); const debrisC = layer(S.cam);
    const bubbleC = layer(S.camFront);
    const titleSprC = layer(S.scene);
    S.dimG = new Graphics(); S.scene.addChild(S.dimG); // 標題暗幕畫在低解析度世界內（省一次全螢幕混合）
    S.pools = {
      tiles: framePool(tileC), ents: framePool(entC), actors: framePool(actorC), glow: framePool(glowC), titleSpr: framePool(titleSprC),
      parts: freePool(partC), bubbles: freePool(bubbleC), debris: freePool(debrisC),
    };
    // ---- 螢幕（stage）----
    S.worldSprite = new Sprite();
    app.stage.addChild(S.worldSprite);
    const hudLayer = () => {
      const root = new Container(); app.stage.addChild(root);
      const g = new Graphics(); root.addChild(g);
      const sprC = layer(root), txtC = layer(root);
      return { g, spr: framePool(sprC), txt: textPool(txtC, FONT), txtC };
    };
    S.hud = hudLayer(); S.over = hudLayer(); S.gpu = hudLayer();
    S.gpu.txtMono = textPool(S.gpu.txtC, MONO);
    // 標題字母（逐字漸層 #7c6cff → #3ad6ff）
    S.titleLetters = [];
    const titleC = new Container(); S.hud.g.parent.addChild(titleC);
    'TIDEKEEPER'.split('').forEach((ch, i, arr) => {
      const t = textPoolLetter(ch, mix('#7c6cff', '#3ad6ff', i / (arr.length - 1)));
      titleC.addChild(t); S.titleLetters.push(t);
    });
    S.titleC = titleC;
    S.rtex = null;
  }
  function textPoolLetter(ch, color) {
    // 單一字母 Text（大小在繪製時更新）；光暈用 dropShadow blur
    return new Text({ text: ch, style: { fontFamily: FONT, fontWeight: '900', fontSize: 64, fill: color, dropShadow: { color: '#7c6cff', alpha: 0.85, blur: 14, distance: 0, angle: 0 } } });
  }

  function resize(w, h) {
    W = w; H = h; dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!ready) return;
    app.renderer.resize(w, h, dpr);
  }

  // ---------- 繪圖小工具 ----------
  const fillRect = (g, x, y, w, h, c) => g.rect(x, y, w, h).fill(C(c));
  function put(pool, tex, x, y, o = {}) {
    const s = pool.acquire();
    s.texture = tex;
    const sx = o.sx || 1, sy = o.sy || sx;
    s.anchor.set(o.ax || 0, o.ay || 0);
    s.scale.set(o.flip ? -sx : sx, sy);
    s.position.set(o.flip ? x + tex.width * sx : x, y);
    s.rotation = o.rot || 0;
    s.alpha = o.alpha == null ? 1 : o.alpha;
    s.tint = o.tint == null ? 0xffffff : o.tint;
    s.blendMode = o.blend || 'normal';
    return s;
  }
  // 加法發光點：直徑 d（世界像素）
  const glow = (x, y, d, tint, alpha = 1) => put(S.pools.glow, S.tx.glow, x, y, { ax: 0.5, ay: 0.5, sx: d / 64, tint, alpha, blend: 'add' });
  function text(L, s, x, y, size, col = '#fff', align = 'left', weight = 700, shadow = true, pool = L.txt) {
    const c = C(col), t = pool.acquire(s, size, '#' + c.color.toString(16).padStart(6, '0'), weight, shadow);
    t.anchor.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    t.position.set(Math.round(x), Math.round(y));
    t.alpha = c.alpha;
    return t;
  }
  const panel = (L, x, y, w, h, a = 0.55) => L.g.roundRect(x, y, w, h, 10).fill({ color: 0x041022, alpha: a });

  // ---------- 粒子／碎片／泡泡（回收池） ----------
  function P(x, y, vx, vy, life, col, size = 1, grav = 200, add = false) {
    if (parts.length > 600) killPart(0);
    const s = S.pools.parts.acquire(), c = C(col);
    if (add) { s.texture = S.tx.glow; s.anchor.set(0.5); s.scale.set(size * 3 / 64); s.blendMode = 'add'; }
    else { s.texture = S.tx.white; s.anchor.set(0); s.scale.set(size); s.blendMode = 'normal'; }
    s.tint = c.color;
    parts.push({ x, y, vx, vy, life, max: life, a: c.alpha, size, grav, s, add });
  }
  function killPart(i) { S.pools.parts.release(parts[i].s); parts.splice(i, 1); }
  function D(x, y, theme) {
    const s = S.pools.debris.acquire(), r = Math.random;
    s.texture = S.tx.debris[theme][(r() * 4) | 0]; s.anchor.set(0.5); s.scale.set(1);
    debris.push({ x, y, vx: (r() - 0.5) * 220, vy: -60 - r() * 200, rot: 0, vr: (r() - 0.5) * 20, life: 1.1 + r() * 0.4, s });
  }
  function B(x, y) {
    if (bubbles.length > 140) return;
    const s = S.pools.bubbles.acquire(), r = Math.random;
    s.texture = S.tx.bubble; s.anchor.set(0.5); s.scale.set(r() < 0.6 ? 0.6 : 1); s.blendMode = r() < 0.5 ? 'add' : 'normal'; s.alpha = 0.7;
    bubbles.push({ x, y, vy: -(14 + r() * 22), ph: r() * 6.28, life: 6, s });
  }
  function consumeEvents() {
    const theme = game.level ? game.level.theme : 0, th = THEMES[theme];
    for (const e of game.events) {
      if (e.id <= lastEv) continue;
      lastEv = e.id;
      const r = Math.random, cam = game.camera, vw = game.view.w, vh = game.view.h;
      const scr = (x, y) => [(x - cam.x) / vw, (y - cam.y) / vh];
      switch (e.type) {
        case 'splash': for (let i = 0; i < 10; i++) P(e.x, e.y, (r() - 0.5) * 120, -60 - r() * 110, 0.6, '#cfefff', 1); for (let i = 0; i < 4; i++) B(e.x + (r() - 0.5) * 10, e.y + 6 + r() * 6); break;
        case 'jump': case 'land': for (let i = 0; i < 5; i++) P(e.x, e.y, (r() - 0.5) * 60, -r() * 30, 0.35, 'rgba(255,255,255,0.7)', 1, 40); break;
        case 'dash': for (let i = 0; i < 6; i++) P(e.x, e.y + (r() - 0.5) * 10, (r() - 0.5) * 30, (r() - 0.5) * 30, 0.3, '#3ad6ff', 2, 0, true); break;
        case 'break': for (let i = 0; i < 10; i++) P(e.x, e.y, (r() - 0.5) * 200, -r() * 180, 0.9, th.rock, 2, 500); for (let i = 0; i < 8; i++) D(e.x + (r() - 0.5) * 12, e.y + (r() - 0.5) * 12, theme); break;
        case 'kill': case 'hurt': case 'bosshit':
          for (let i = 0; i < (e.type === 'bosshit' ? 24 : 12); i++) P(e.x, e.y, (r() - 0.5) * 200, (r() - 0.5) * 200, 0.5, e.type === 'hurt' ? '#ff4d6d' : '#fff3a0', 2, 100, true);
          if (e.type === 'bosshit') S.fx.wave(...scr(e.x, e.y), 0.6, [1, 0.95, 0.5]);
          break;
        case 'pearl': case 'checkpoint': for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; P(e.x, e.y, Math.cos(a) * 70, Math.sin(a) * 70, 0.6, '#bff4ff', 1, 0, true); } break;
        case 'pop': for (let i = 0; i < 6; i++) P(e.x, e.y, (r() - 0.5) * 80, (r() - 0.5) * 80, 0.3, '#bff4ff', 1, 0); break;
        case 'bossdie': for (let i = 0; i < 80; i++) P(e.x + (r() - 0.5) * 60, e.y + (r() - 0.5) * 40, (r() - 0.5) * 260, (r() - 0.5) * 260, 1.6, i % 2 ? '#2fae9a' : '#fff36a', 2, 60, i % 3 === 0); S.fx.wave(...scr(e.x, e.y), 1.6, [1, 1, 0.6]); break;
        case 'tideup': case 'tidedown': case 'phase2': case 'roar': {
          for (let i = 0; i < 30; i++) P(cam.x + r() * vw, e.y, (r() - 0.5) * 40, e.type === 'tidedown' ? 60 : -90 - r() * 60, 0.8, '#cfefff', 1, 80);
          // 潮汐震波：以玩家為圓心擴散（Boss 怒吼／二階段用紅色）
          const p = game.player, cx = p ? p.x + p.w / 2 : e.x, cy = p ? p.y + p.h / 2 : e.y;
          const tint = e.type === 'tideup' ? [0.45, 0.85, 1] : e.type === 'tidedown' ? [1, 0.85, 0.5] : [1, 0.35, 0.5];
          S.fx.wave(...scr(cx, cy), e.type === 'phase2' ? 1.5 : 1, tint);
          break;
        }
        case 'thud': for (let i = 0; i < 14; i++) P(e.x, e.y, (r() - 0.5) * 160, (r() - 0.5) * 160, 0.5, '#9ff', 1, 0); break;
      }
    }
  }
  const solidPx = (x, y) => { const lv = game.level, r = lv && lv.grid[Math.floor(y / T)], c = r && r[Math.floor(x / T)]; return !r || c === '#' || c === 'B' || c === 'W'; };
  function stepParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) { killPart(i); continue; }
      p.s.position.set(p.add ? p.x : Math.round(p.x), p.add ? p.y : Math.round(p.y));
      p.s.alpha = Math.max(0, p.life / p.max) * p.a;
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt; d.vy += 500 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
      if (d.life <= 0) { S.pools.debris.release(d.s); debris.splice(i, 1); continue; }
      d.s.position.set(d.x, d.y); d.s.rotation = d.rot; d.s.alpha = Math.min(1, d.life * 2);
    }
    const wy = game.waterY;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.life -= dt; b.y += b.vy * dt; b.ph += dt * 3;
      if (b.life <= 0 || b.y < wy + 2 || game.scene === 'title' || solidPx(b.x, b.y)) { S.pools.bubbles.release(b.s); bubbles.splice(i, 1); continue; }
      b.s.position.set(Math.round(b.x + Math.sin(b.ph) * 1.5), Math.round(b.y));
    }
  }

  // ---------- 背景（Graphics 每幀重建） ----------
  function drawBackground(g, th, cx, cy, vw, vh, t) {
    // 天空漸層：16 條水平色帶（Graphics 逐帶填色）
    const N = 48;
    for (let i = 0; i < N; i++) g.rect(0, Math.floor(vh * i / N), vw, Math.ceil(vh / N) + 1).fill({ color: mix(th.sky[0], th.sky[1], i / (N - 1)) });
    const far = -cx * 0.15, near = -cx * 0.4, by = -cy * 0.2, wrap = (v, m) => ((v % m) + m) % m;
    const hills = (off, base, amp, freq, col) => {
      const pts = [0, vh];
      for (let x = 0; x <= vw; x += 8) pts.push(x, base - Math.abs(Math.sin((x - off) * freq)) * amp - Math.sin((x - off) * freq * 2.7) * amp * 0.3);
      pts.push(vw, vh); g.poly(pts).fill(C(col));
    };
    switch (th.key) {
      case 'shore':
        g.circle(vw * 0.75, vh * 0.2 + by, 22).fill(C('rgba(255,250,210,0.9)'));
        for (let i = 0; i < 5; i++) { const x = wrap(i * 140 + far * 0.6 + t * 6, vw + 120) - 60; g.rect(x, 30 + i * 13 + by, 46, 6).rect(x + 10, 25 + i * 13 + by, 24, 5); }
        g.fill(C('rgba(255,255,255,0.7)'));
        hills(far, vh * 0.62 + by, 28, 0.013, '#7fb7c8'); hills(near, vh * 0.72 + by, 20, 0.024, '#5e9aa0');
        break;
      case 'coral':
        for (let i = 0; i < 6; i++) { const x = wrap(i * 90 + far, vw + 200) - 100; g.poly([x, 0, x + 30, 0, x + 90 + Math.sin(t + i) * 10, vh, x + 40, vh]); }
        g.fill(C('rgba(200,255,255,0.08)'));
        for (const col of ['#a0406a', '#3a8a8a']) {
          for (let i = col === '#a0406a' ? 1 : 0; i < 14; i += 2) {
            const x = wrap(i * 47 + near, vw + 60) - 30, y = vh * 0.9 + by, h = 20 + (i * 13) % 25;
            g.moveTo(x, y).lineTo(x, y - h).moveTo(x, y - h * 0.5).lineTo(x - h * 0.3, y - h * 0.8).moveTo(x, y - h * 0.65).lineTo(x + h * 0.35, y - h);
          }
          g.stroke({ width: 3, color: hex(col) });
        }
        break;
      case 'wreck':
        hills(far, vh * 0.75 + by, 14, 0.02, '#2a4a3c');
        for (let i = 0; i < 6; i++) { const x = wrap(i * 70 + near, vw + 140) - 70, y = vh * 0.95 + by, a0 = Math.PI * 1.1; g.moveTo(x + Math.cos(a0) * 40, y + Math.sin(a0) * 40).arc(x, y, 40, a0, Math.PI * 1.9); }
        g.stroke({ width: 4, color: 0x21382e });
        break;
      case 'crystal':
        for (let i = 0; i < 10; i++) {
          const x = wrap(i * 61 + far, vw + 100) - 50, hgt = 40 + (i * 37) % 60;
          g.poly([x - 10, vh + by, x, vh - hgt + by, x + 12, vh + by]).poly([x + 20, by, x + 26, hgt * 0.6 + by, x + 32, by]).fill({ color: 0xc58cff, alpha: 0.18 + 0.1 * Math.sin(t * 2 + i) });
        }
        break;
      case 'storm': {
        const lx = wrap(vw * 0.7 + far * 0.5, vw + 200) - 100;
        fillRect(g, lx - 8, vh * 0.25 + by, 16, vh, '#2a2f38'); fillRect(g, lx - 6, vh * 0.22 + by, 12, 8, '#ffe27a');
        const a = t * 1.2, y0 = vh * 0.25 + by;
        g.poly([lx, y0, lx + Math.cos(a) * 400, y0 + Math.sin(a) * 60 - 30, lx + Math.cos(a) * 400, y0 + Math.sin(a) * 60 + 30]).fill(C('rgba(255,240,170,0.13)'));
        S.stormLamp = [lx, vh * 0.22 + by + 4];
        hills(near, vh * 0.8 + by, 18, 0.03, '#252a33');
        const wind = 6 + game.gust * 14;
        for (let i = 0; i < 60; i++) { const x = (i * 37 + t * 40 * i % 997) % vw, y = (i * 53 + t * 380) % vh; g.moveTo(x, y).lineTo(x - wind, y + 9); }
        g.stroke({ width: 1, color: 0xb4c8e6, alpha: 0.35 });
        if (game.flash > 0) g.rect(0, 0, vw, vh).fill({ color: 0xe6f0ff, alpha: game.flash * 0.6 });
        break;
      }
      case 'abyss': {
        const ox = vw / 2 + far * 0.2, oy = vh * 0.5 + by;
        for (let k = 0; k < 4; k++) for (let i = 0; i < 60; i++) { const a = i * 0.18 + t * 0.6 + k * 1.57, r = i * 3.2, x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r * 0.5; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke({ width: 2, color: 0x5a6aff, alpha: 0.25 });
        for (let i = 0; i < 30; i++) g.rect(wrap(i * 71 + far, vw), (i * 43 + t * 8) % vh, 1, 1).fill({ color: 0x96b4ff, alpha: 0.3 + 0.3 * Math.sin(t * 2 + i) });
        break;
      }
    }
  }

  // ---------- 世界 ----------
  function playerFrame(anim, at) {
    const s = S.tx.spr.player;
    if (anim === 'run') return Math.floor(at * 10) % 2 ? s.run1 : s.run2;
    return s[anim === 'dash' ? 'jump' : anim] || s.stand;
  }
  function drawWorld(alpha, t, vw, vh) {
    const lv = game.level, th = THEMES[lv.theme], tl = S.tx.tiles[lv.theme], spr = S.tx.spr, pl = S.pools;
    const cam = game.camera, g = S.animG, bg = S.bossG;
    const cx = Math.round(cam.px + (cam.x - cam.px) * alpha), cy = Math.round(cam.py + (cam.y - cam.py) * alpha);
    drawBackground(S.bgG, th, cx, cy, vw, vh, t);
    const wy = Math.round(game.waterY - cy), wb = Math.min(vh, lv.h * T - cy);
    if (wy < wb) S.waterBackG.rect(0, Math.max(0, wy), vw, wb - Math.max(0, wy)).fill({ color: hex(th.deep), alpha: 0.45 });
    S.cam.position.set(-cx, -cy); S.camFront.position.set(-cx, -cy);
    // 地圖外深色岩層
    const dark = hex(th.dark);
    if (cy + vh > lv.h * T) g.rect(cx, lv.h * T, vw, cy + vh - lv.h * T).fill({ color: dark });
    if (cx < 0) g.rect(cx, cy, -cx, vh).fill({ color: dark });
    if (cx + vw > lv.w * T) g.rect(lv.w * T, cy, cx + vw - lv.w * T, vh).fill({ color: dark });
    const x0 = Math.max(0, Math.floor(cx / T)), x1 = Math.min(lv.w - 1, Math.floor((cx + vw) / T));
    const y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(lv.h - 1, Math.floor((cy + vh) / T));
    const solid = c => c === '#' || c === 'B' || c === 'W';
    const pools = [], poolTops = [], currents = [], spikesUp = [], spikesDown = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = lv.grid[y][x], px = x * T, py = y * T;
      if (c === '.') continue;
      const above = y > 0 ? lv.grid[y - 1][x] : '#';
      if (c === '#') put(pl.tiles, solid(above) ? tl.rock[(x * 7 + y * 3) & 3] : tl.rockTop[(x * 5 + y) & 3], px, py);
      else if (c === 'B') put(pl.tiles, tl.B, px, py);
      else if (c === 'W') put(pl.tiles, solid(above) ? tl.W : tl.Wtop, px, py);
      else if (c === '=') put(pl.tiles, tl.plank, px, py);
      else if (c === '^') put(pl.tiles, spr.urchin.a.tex, px + 2, py + 8);
      else if (c === 'K') (y > 0 && solid(lv.grid[y - 1][x]) && !(y + 1 < lv.h && solid(lv.grid[y + 1][x])) ? spikesDown : spikesUp).push(px, py);
      else if (c === 't') { pools.push(px, py + (above === 't' ? 0 : 3), above === 't' ? T : T - 3); if (above !== 't') poolTops.push(px, py + 3 + Math.round(Math.sin(t * 3 + x))); }
      else if ((c === '<' || c === '>') && py + T > game.waterY) {
        const d = c === '<' ? -1 : 1;
        for (let i = 0; i < 2; i++) currents.push(px + ((((t * 90 * d + i * 8 + y * 5) % T) + T) % T), py + 4 + i * 7);
      }
    }
    for (let i = 0; i < pools.length; i += 3) g.rect(pools[i], pools[i + 1], T, pools[i + 2]);
    if (pools.length) g.fill({ color: hex(th.water), alpha: 0.5 });
    for (let i = 0; i < poolTops.length; i += 2) g.rect(poolTops[i], poolTops[i + 1], T, 1);
    if (poolTops.length) g.fill({ color: 0xe0faff });
    for (let i = 0; i < currents.length; i += 2) g.rect(currents[i], currents[i + 1], 5, 1);
    if (currents.length) g.fill({ color: 0xdcfaff, alpha: 0.35 });
    if (spikesUp.length || spikesDown.length) {
      for (let k = 0; k < spikesUp.length; k += 2) { const px = spikesUp[k], py = spikesUp[k + 1]; for (let i = 0; i < 3; i++) g.poly([px + 1 + i * 5, py + T, px + 3.5 + i * 5, py + 4, px + 6 + i * 5, py + T]); }
      for (let k = 0; k < spikesDown.length; k += 2) { const px = spikesDown[k], py = spikesDown[k + 1]; for (let i = 0; i < 3; i++) g.poly([px + 1 + i * 5, py, px + 3.5 + i * 5, py + 12, px + 6 + i * 5, py]); }
      g.fill({ color: hex(th.accent) });
      for (let k = 0; k < spikesUp.length; k += 2) g.rect(spikesUp[k] + 3, spikesUp[k + 1] + 10, 1, 3);
      for (let k = 0; k < spikesDown.length; k += 2) g.rect(spikesDown[k] + 3, spikesDown[k + 1] + 2, 1, 3);
      g.fill({ color: 0xffffff, alpha: 0.7 });
    }
    // 出口（加法光暈）
    if (lv.exit && !game.boss) {
      const e = lv.exit, gl = 0.6 + 0.4 * Math.sin(t * 4);
      glow(e.x + T / 2, e.y + T, 64, 0x3ad6ff, 0.55 * gl);
      g.rect(e.x + 2, e.y, 3, 2 * T).rect(e.x + 11, e.y, 3, 2 * T).rect(e.x + 2, e.y, 12, 3).fill({ color: 0x2a7fff });
      g.rect(e.x + 5, e.y + 3, 6, 2 * T - 3).fill({ color: 0x3ad6ff });
      g.rect(e.x + 7, e.y + 6 + ((t * 20) % 22), 2, 3).fill({ color: 0xffffff });
    }
    const editing = game.scene === 'editor';
    for (const e of editing ? [] : game.entities) {
      if (!e.alive) continue;
      const fr = Math.floor(e.t * 4) % 2 ? 'b' : 'a';
      if (e.type === 'crab') put(pl.ents, spr.crab[fr].tex, Math.round(e.x), Math.round(e.y));
      else if (e.type === 'jelly') {
        put(pl.ents, spr.jelly[e.stranded ? 'b' : fr].tex, Math.round(e.x), Math.round(e.y) - 2, { alpha: e.stranded ? 0.55 : 0.9 });
        if (!e.stranded) glow(e.x + 5, e.y + 3, 26, 0xff8ad8, 0.35 + 0.15 * Math.sin(t * 3 + e.x));
      }
      else if (e.type === 'puffer') put(pl.ents, spr.puffer[e.stranded ? 'b' : fr].tex, Math.round(e.x), Math.round(e.y) + (e.stranded ? 1 : 0), { flip: e.dir <= 0 });
      else if (e.type === 'pearl') {
        const bob = Math.round(Math.sin(e.t * 3) * 2);
        glow(e.x + 3, e.y + 3 + bob, 22, 0xbff4ff, 0.7);
        put(pl.ents, spr.pearl.a.tex, Math.round(e.x), Math.round(e.y) + bob);
      } else if (e.type === 'checkpoint') {
        g.rect(e.x + 3, e.y, 2, e.h).fill({ color: 0xd0d8e0 });
        g.poly([e.x + 5, e.y + 1, e.x + 15 + (e.on ? Math.sin(t * 6) * 2 : 0), e.y + 5, e.x + 5, e.y + 9]).fill({ color: e.on ? 0x3ad6ff : 0x7a8a99 });
        if (e.on) glow(e.x + 9, e.y + 5, 24, 0x3ad6ff, 0.5);
      }
    }
    // Boss
    const bs = game.boss;
    if (bs && !editing && bs.state !== 'dormant' && bs.state !== 'dead') {
      const segs = bossSegments(bs);
      for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i];
        bg.circle(s.x, s.y, s.r).fill({ color: i % 2 ? 0x16645c : 0x2fae9a });
        bg.rect(s.x - 1, s.y - s.r, 2, 2).fill({ color: 0xfff36a });
      }
      const hd = bossHead(bs), right = bs.trail[3].x <= bs.x ? (bs.state === 'tired' || bs.state === 'aim' ? bs.dir > 0 : true) : false;
      const flash = bs.hurtT > 0 && Math.floor(bs.hurtT * 20) % 2;
      if (bs.state === 'tired') { bg.circle(bs.x, bs.y, 14).stroke({ width: 2, color: 0xfff36a, alpha: 0.5 + 0.5 * Math.sin(t * 12) }); glow(bs.x, bs.y, 48, 0xfff36a, 0.4); }
      if (bs.state === 'aim') bg.rect(bs.arena.x0, bs.aimY - 8, bs.arena.x1 - bs.arena.x0, 16).fill({ color: 0xff3d6e, alpha: 0.15 + 0.1 * Math.sin(t * 20) });
      put(pl.actors, spr.eelHead.a.tex, Math.round(hd.x), Math.round(hd.y - 1), { flip: !right });
      if (flash) put(pl.actors, spr.eelHead.a.sil, Math.round(hd.x), Math.round(hd.y - 1), { flip: !right, alpha: 0.85, blend: 'add' });
      glow(hd.x + (right ? 15 : 3), hd.y + 3, 14, 0xff3d6e, 0.6);
    }
    for (const pr of editing ? [] : game.projectiles) { bg.circle(pr.x, pr.y, 4).fill({ color: 0xbff4ff, alpha: 0.3 }).stroke({ width: 1, color: 0xbff4ff }); glow(pr.x, pr.y, 16, 0xbff4ff, 0.6); }
    // 殘影（白色剪影 × tint）
    const gp = game.ghostPose;
    if (gp && !editing) put(pl.actors, playerFrame(gp.anim, t).sil, gp.x, gp.y, { flip: gp.facing <= 0, tint: 0xbff4ff, alpha: 0.35 });
    // 玩家
    const p = game.player, fg = S.fgG;
    if (p && !editing && game.scene !== 'title') {
      const px = Math.round(p.prevX + (p.x - p.prevX) * alpha), py = Math.round(p.prevY + (p.y - p.prevY) * alpha);
      if (!(p.invuln > 0 && Math.floor(p.invuln * 15) % 2)) {
        const fr = playerFrame(p.anim, p.animT), f = p.facing;
        if (p.anim === 'dash') { put(pl.actors, fr.sil, px - f * 8, py, { flip: f < 0, tint: 0xbff4ff, alpha: 0.35 }); glow(px + 5 + f * 6, py + 8, 34, 0x3ad6ff, 0.8); }
        put(pl.actors, fr.tex, px, py, { flip: f < 0 });
        const hx = f > 0 ? px + 9 : px + 1, hy = py + 8, len = p.anim === 'dash' ? 14 : 9;
        fg.rect(Math.min(hx, hx + f * len), hy, len, 1).fill({ color: 0xffcf5a });
        const tx = hx + f * len;
        fg.rect(tx, hy - 2, 1, 5).rect(tx + f, hy - 2, 1, 1).rect(tx + f, hy, f > 0 ? 2 : 1, 1).rect(tx + f, hy + 2, 1, 1).fill({ color: 0xe8fbff });
        if (p.inWater && (playerBubbleT -= 1 / 60) <= 0) { playerBubbleT = 0.35 + Math.random() * 0.3; B(px + 5 + f * 3, py + 2); }
      }
    }
    // 水體前層＋水面線
    const wf = S.waterFrontG;
    if (wy < wb) {
      const pts = [0, wb];
      for (let x = 0; x <= vw; x += 4) pts.push(x, wy + Math.sin((x + cx) * 0.12 + t * 3) * 1.5);
      pts.push(vw, wb);
      wf.poly(pts).fill({ color: hex(th.water), alpha: 0.28 });
      const wrow = lv.grid[Math.floor(game.waterY / T)];
      let n = 0;
      for (let x = 0; x < vw; x += 2) { const c = wrow && wrow[Math.floor((x + cx) / T)]; if (c === '#' || c === 'B' || c === 'W') continue; wf.rect(x, Math.round(wy + Math.sin((x + cx) * 0.12 + t * 3) * 1.5), 2, 1); n++; }
      if (n) wf.fill({ color: 0xe6faff, alpha: 0.85 });
      // 環境泡泡：依可見水量生成（回收池）
      if (!editing) {
        bubbleAcc += (wb - Math.max(0, wy)) / vh * 7 / 60;
        while (bubbleAcc >= 1) { bubbleAcc--; const bx = cx + Math.random() * vw, by = cy + Math.max(0, wy) + Math.random() * (wb - Math.max(0, wy)); if (!solidPx(bx, by)) B(bx, by); }
      }
    }
    return { wy };
  }

  function drawTitleWorld(vw, vh, t) {
    const th = THEMES[game.sel % 6];
    drawBackground(S.bgG, th, t * 30, 0, vw, vh, t);
    const g = S.titleG, wy = vh * 0.72, spr = S.tx.spr, pl = S.pools.titleSpr;
    const pts = [0, vh];
    for (let x = 0; x <= vw; x += 4) pts.push(x, wy + Math.sin(x * 0.05 + t * 2) * 3 + Math.sin(x * 0.13 - t * 3) * 1.5);
    pts.push(vw, vh);
    g.poly(pts).fill({ color: 0x0b4f9e, alpha: 0.6 });
    put(pl, spr.player.stand.tex, Math.round(vw / 2 - 5), Math.round(wy - 12 + Math.sin(t * 2) * 2));
    put(pl, spr.jelly[Math.floor(t * 4) % 2 ? 'a' : 'b'].tex, Math.round(vw * 0.3), Math.round(wy + 20 + Math.sin(t) * 6));
    put(pl, S.tx.glow, Math.round(vw * 0.3) + 5, Math.round(wy + 23 + Math.sin(t) * 6), { ax: 0.5, ay: 0.5, sx: 28 / 64, tint: 0xff8ad8, alpha: 0.5, blend: 'add' });
    put(pl, spr.puffer.a.tex, Math.round((t * 25) % (vw + 40) - 20), Math.round(wy + 40), { flip: true });
    S.dimG.rect(0, 0, vw, vh).fill({ color: 0x021028, alpha: 0.38 });
    return { wy, th };
  }

  // ---------- HUD ----------
  const small = () => Math.max(12, Math.min(18, Math.min(W, H) / 36));
  function drawHUD() {
    const L = S.hud, p = game.player, s = small(), sc = Math.max(2, Math.round(s / 6)), spr = S.tx.spr;
    panel(L, 8, 8, Math.max(150, s * 11), s * 3.4);
    for (let i = 0; i < p.maxHp; i++) put(L.spr, spr.heart.a.tex, 16 + i * (7 * sc + 4), 14, { sx: sc, alpha: i < p.hp ? 1 : 0.25 });
    for (let i = 0; i < 3; i++) put(L.spr, spr.pearl.a.tex, 16 + 3 * (7 * sc + 4) + 6 + i * (6 * sc + 3), 14, { sx: sc, alpha: i < game.pearlsGot ? 1 : 0.25 });
    text(L, fmt(game.runTime), 16, 14 + 6 * sc + s * 0.9, s, '#e8fbff');
    if (!game.custom) text(L, '最佳 ' + fmt(game.prog.best[game.levelIdx]), 16 + s * 5.2, 14 + 6 * sc + s * 0.9, s * 0.8, '#9fd8ff', 'left', 500);
    const lv = game.level, tw = Math.max(170, s * 12);
    panel(L, W - tw - 8, 8, tw, s * 3.4);
    text(L, game.custom ? '自訂關卡' : `${game.levelIdx + 1}. ${lv.name}`, W - 16, 8 + s * 0.9, s, '#fff', 'right');
    const td = game.tide, label = td.high ? '滿潮' : '乾潮', tc = td.high ? '#3ad6ff' : '#ffd27a';
    text(L, `Q 潮汐：${label}`, W - 16, 8 + s * 2.3, s * 0.85, tc, 'right');
    const bw = s * 4, bx = W - 16 - s * 7.6 - bw, by = 8 + s * 2.3 - 3;
    L.g.rect(bx, by, bw, 6).fill({ color: 0xffffff, alpha: 0.15 });
    L.g.rect(bx, by, bw * td.p, 6).fill({ color: hex(tc) });
    if (td.cd > 0 || td.trans > 0) L.g.rect(bx, by + 7, bw * (td.trans > 0 ? 1 : td.cd / 0.6), 2).fill({ color: 0xffffff, alpha: 0.6 });
    if (game.audio.muted) text(L, '靜音（M）', 16, 8 + s * 4.2, s * 0.75, '#ffb0b0', 'left', 500);
    if (lv.wind && game.gust > 0.1) text(L, '≋ 陣風 ≋', W / 2, H * 0.2, s * 1.1, `rgba(220,235,255,${game.gust.toFixed(2)})`, 'center');
    const bs = game.boss;
    if (bs && game.bossActive && bs.state !== 'dead') {
      const w = Math.min(W * 0.5, 420), x = (W - w) / 2, y = 8 + s * 3.9;
      text(L, '渦潮巨鰻' + (bs.phase === 2 ? '・狂潮' : ''), W / 2, y, s, '#ff9ab0', 'center');
      L.g.rect(x, y + s * 0.7, w, 8).fill({ color: 0, alpha: 0.5 });
      L.g.rect(x, y + s * 0.7, w * Math.max(0, bs.hp) / bs.maxHp, 8).fill({ color: bs.phase === 2 ? 0xff3d6e : 0x2fae9a });
    }
    return 8 + s * 3.4 + 6; // GPU HUD 放在右上關卡面板下方
  }
  function drawHints(cam) {
    const L = S.hud, lv = game.level, sx = W / game.view.w, sy = H / game.view.h, s = small() * 0.9;
    for (const h of lv.hints) {
      const x = (h.x - cam.x) * sx, y = (h.y - cam.y) * sy;
      if (x < -400 || x > W + 50 || y < -50 || y > H + 50) continue;
      const t = text(L, h.text, x, y, s, '#e8fbff', 'left', 600);
      panel(L, x - 8, y - s, t.width + 16, s * 2, 0.45);
    }
  }
  function overlay(title, lines, col) {
    const L = S.over;
    L.g.rect(0, 0, W, H).fill({ color: 0x020a18, alpha: 0.62 });
    const s = small(), big = Math.min(W / 10, 56);
    text(L, title, W / 2, H * 0.36, big, col, 'center', 900);
    lines.forEach((l, i) => { const last = i === lines.length - 1; text(L, l, W / 2, H * 0.36 + big * 0.9 + i * s * 1.8, last ? s * 0.9 : s * 1.1, last ? '#9fd8ff' : '#fff', 'center', last ? 500 : 700); });
  }
  function drawTitle(t) {
    const L = S.hud, s = small(), big = Math.min(W / 7.5, 110);
    // 逐字漸層標題（每個字母一個 Text，波浪起伏）
    const fs = Math.round(big);
    let total = 0;
    for (const lt of S.titleLetters) { if (lt.style.fontSize !== fs) lt.style.fontSize = fs; total += lt.width - fs * 0.04; }
    let x = W / 2 - total / 2;
    S.titleLetters.forEach((lt, i) => { lt.anchor.set(0, 0.5); lt.position.set(Math.round(x), Math.round(H * 0.2 + Math.sin(t * 1.5) * 4 + Math.sin(t * 3 + i * 0.6) * fs * 0.03)); x += lt.width - fs * 0.04; });
    text(L, '潮汐守望者 · Pixi 版', W / 2, H * 0.2 + big * 0.75, big * 0.3, '#e8fbff', 'center', 800);
    text(L, '切換滿潮與乾潮，讓整片海岸成為你的踏腳石', W / 2, H * 0.2 + big * 0.75 + big * 0.42, s, '#c9c2ff', 'center', 500);
    const x0 = MENU.cardX0 * W, x1 = MENU.cardX1 * W, y0 = MENU.cardY0 * H, y1 = MENU.cardY1 * H, cw = (x1 - x0) / LEVEL_COUNT;
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const cx = x0 + i * cw + 3, w = cw - 6, locked = i >= game.prog.unlocked, sel = i === game.sel;
      L.g.roundRect(cx, y0, w, y1 - y0, 10).fill(sel ? { color: 0x7c6cff, alpha: 0.34 } : { color: 0x041022, alpha: 0.55 });
      if (sel) L.g.roundRect(cx, y0, w, y1 - y0, 10).stroke({ width: 2, color: 0x3ad6ff });
      const f = Math.min(w / 5.2, s * 1.1);
      text(L, String(i + 1), cx + w / 2, y0 + (y1 - y0) * 0.22, f * 1.6, locked ? '#556' : '#fff', 'center', 900);
      text(L, locked ? '未解鎖' : LEVELS[i].name, cx + w / 2, y0 + (y1 - y0) * 0.5, f, locked ? '#667' : '#e8fbff', 'center', 700);
      if (!locked) {
        text(L, fmt(game.prog.best[i]), cx + w / 2, y0 + (y1 - y0) * 0.7, f * 0.8, '#9fd8ff', 'center', 500);
        text(L, '●'.repeat(game.prog.pearls[i] | 0) + '○'.repeat(3 - (game.prog.pearls[i] | 0)), cx + w / 2, y0 + (y1 - y0) * 0.87, f * 0.75, '#bff4ff', 'center', 500);
      }
    }
    const blink = 0.55 + 0.45 * Math.sin(t * 4);
    text(L, 'Enter / Space / 點擊 開始', W / 2, H * 0.76, s * 1.3, `rgba(255,255,255,${blink.toFixed(2)})`, 'center', 800);
    const lines = W < 700
      ? ['←/→ 或 1–6 選關・A/D 移動・Space 跳', 'X/J 突刺・Q 潮汐・↓ 下潛・P 暫停・M 靜音', 'F2 關卡編輯器・G 濾鏡開關']
      : ['←/→ 或 1–6 選關　A/D ←/→ 移動　Space/W/↑ 跳　X/J 三叉戟突刺', 'Q 切換潮汐　↓ 水中下潛　P/Esc 暫停　M 靜音　G 濾鏡開關　F2 關卡編輯器'];
    lines.forEach((l, i) => text(L, l, W / 2, H * 0.84 + i * s * 1.6, s * 0.9, '#cfe8ff', 'center', 500));
  }
  function drawEditorOverlay() {
    const L = S.hud, ed = game.editor, s = small(), vw = game.view.w, vh = game.view.h, sx = W / vw, sy = H / vh, g = L.g;
    for (let x = Math.floor(ed.camX / T); x * T < ed.camX + vw; x++) { const X = Math.round((x * T - ed.camX) * sx) + 0.5; g.moveTo(X, 0).lineTo(X, H); }
    for (let y = Math.floor(ed.camY / T); y * T < ed.camY + vh; y++) { const Y = Math.round((y * T - ed.camY) * sy) + 0.5; g.moveTo(0, Y).lineTo(W, Y); }
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
    const NAMES = { S: ['起', '#7dff9a'], E: ['終', '#3ad6ff'], C: ['旗', '#ffffff'], o: ['珠', '#bff4ff'], c: ['蟹', '#ff6a4a'], j: ['母', '#ff8ad8'], p: ['豚', '#ffd84a'], X: ['鰻', '#ff3d6e'] };
    const fsz = Math.max(10, T * sx * 0.6);
    const xa = Math.max(0, Math.floor(ed.camX / T) - 1), xb = Math.min(ed.w - 1, Math.ceil((ed.camX + vw) / T) + 1);
    for (let y = 0; y < ed.h; y++) for (let x = xa; x <= xb; x++) {
      const m = NAMES[ed.grid[y][x]];
      if (!m) continue;
      const X = (x * T + 8 - ed.camX) * sx, Y = (y * T + 8 - ed.camY) * sy;
      if (Y < -20 || Y > H + 20) continue;
      text(L, m[0], X, Y, fsz, m[1], 'center', 800, false);
    }
    if (ed.cursor.x >= 0) g.rect((ed.cursor.x * T - ed.camX) * sx, (ed.cursor.y * T - ed.camY) * sy, T * sx, T * sy).stroke({ width: 2, color: 0xffe27a });
    panel(L, 8, 8, W - 16, s * 2.2);
    text(L, '關卡編輯器　左鍵畫・右鍵擦・方向鍵捲動・1–9/0、[ ] 筆刷・G 配色・Q 潮汐預覽・T 試玩・X 匯出・L 載入・N 新建・F2/Esc 離開', 16, 8 + s * 1.1, Math.min(s * 0.78, (W - 40) / 62), '#e8fbff', 'left', 600);
    const bh = s * 2.4, by = H - bh - 8;
    panel(L, 8, by, W - 16, bh);
    const cw = (W - 32) / BRUSHES.length;
    BRUSHES.forEach((c, i) => {
      const x = 16 + i * cw;
      if (i === ed.brush) g.rect(x, by + 4, cw - 4, bh - 8).fill({ color: 0x7c6cff, alpha: 0.45 });
      text(L, BRUSH_NAMES[c], x + cw / 2 - 2, by + bh / 2, Math.min(s * 0.75, cw / 3.2), i === ed.brush ? '#fff' : '#9fb8cc', 'center', 600);
    });
    if (ed.msgT > 0) text(L, ed.msg, W / 2, by - s * 1.2, s, `rgba(255,230,130,${Math.min(1, ed.msgT).toFixed(2)})`, 'center');
    return 8 + s * 2.2 + 6;
  }
  // 右上 GPU HUD：FPS、作用中 sprite、pool 大小、濾鏡狀態
  function drawGPU(y) {
    const L = S.gpu, pl = S.pools, on = game.settings.fx;
    const pools = [pl.tiles, pl.ents, pl.actors, pl.glow, pl.titleSpr, pl.parts, pl.bubbles, pl.debris, S.hud.spr, S.over.spr];
    let act = 0, size = 0;
    for (const p of pools) { act += p.active; size += p.size; }
    const fs = Math.max(10, Math.min(13, Math.min(W, H) / 46)), lh = fs * 1.35, w = fs * 17.5, x = W - w - 8;
    const lines = [
      [`GPU · ${app.renderer.name === 'webgl' ? 'WebGL' + (app.renderer.context.webGLVersion || '') : app.renderer.name}`, '#c9c2ff'],
      [`FPS ${String(game.fps).padStart(3)}`, game.fps >= 50 ? '#7dffb0' : game.fps >= 30 ? '#ffe27a' : '#ff6a8a'],
      [`Sprites ${act} / Pool ${size}`, '#e8fbff'],
      [`粒子 ${pl.parts.active}/${pl.parts.size} 泡 ${pl.bubbles.active}/${pl.bubbles.size} 碎 ${pl.debris.active}/${pl.debris.size}`, '#9fd8ff'],
      [on ? `Filters ON  ${S.fx.shock.enabled ? 'DISP RAYS SHOCK' : 'DISP RAYS'}` : 'Filters OFF（G 開啟）', on ? '#7dffb0' : '#ff9ab0'],
    ];
    L.g.roundRect(x, y, w, lh * lines.length + 8, 8).fill({ color: 0x0a0624, alpha: 0.62 }).stroke({ width: 1, color: 0x7c6cff, alpha: 0.7 });
    lines.forEach(([s, c], i) => text(L, s, x + 8, y + 4 + lh * (i + 0.5), fs, c, 'left', 600, false, i === 3 ? L.txt : L.txtMono));
  }

  // ---------- 主繪製 ----------
  function render(alpha) {
    if (!ready) return;
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; rt += dt;
    const vw = game.view.w, vh = game.view.h, pl = S.pools;
    if (!S.rtex || S.rtex.width !== vw || S.rtex.height !== vh) {
      if (S.rtex) S.rtex.destroy(true);
      S.rtex = RenderTexture.create({ width: vw, height: vh, resolution: 1, scaleMode: 'nearest' });
      S.worldSprite.texture = S.rtex;
      S.scene.filterArea = new Rectangle(0, 0, vw, vh);
    }
    S.worldSprite.width = W; S.worldSprite.height = H;
    for (const g of [S.bgG, S.waterBackG, S.animG, S.bossG, S.fgG, S.waterFrontG, S.titleG, S.dimG, S.hud.g, S.over.g, S.gpu.g]) g.clear();
    for (const p of [pl.tiles, pl.ents, pl.actors, pl.glow, pl.titleSpr, S.hud.spr, S.over.spr, S.hud.txt, S.over.txt, S.gpu.txt, S.gpu.txtMono]) p.begin();
    consumeEvents(); stepParticles(dt);
    const sc = game.scene, inWorld = game.level && sc !== 'title' && !(sc === 'win' && !game.player);
    S.cam.visible = S.camFront.visible = !!inWorld;
    let wy, th;
    if (inWorld) { wy = drawWorld(alpha, rt, vw, vh).wy; th = THEMES[game.level.theme]; }
    else { const r = drawTitleWorld(vw, vh, rt); wy = r.wy; th = r.th; }
    // 濾鏡：G / V 共用 core 的 settings.fx
    const fx = S.fx, on = game.settings.fx;
    fx.update(dt);
    if (on !== S.filtersOn) { S.scene.filters = on ? fx.list : null; S.filtersOn = on; }
    if (on) {
      fx.dispSprite.position.set(-((rt * 14) % S.tx.dispPeriod), Math.min(vh, Math.max(-200, wy - 1)));
      fx.dispSprite.scale.set(1, Math.max(1, (vh + 20) / 128));
      const R = RAYS[th.key], u = fx.raysU;
      u.uLight[0] = th.key === 'storm' && S.stormLamp ? S.stormLamp[0] / vw : R.l[0]; u.uLight[1] = th.key === 'storm' && S.stormLamp ? S.stormLamp[1] / vh : R.l[1];
      u.uColor[0] = R.c[0]; u.uColor[1] = R.c[1]; u.uColor[2] = R.c[2];
      u.uStrength = R.s; u.uWater = wy / vh; u.uTime = rt;
    }
    app.renderer.render({ container: S.worldRoot, target: S.rtex, clear: true });
    // HUD
    S.titleC.visible = sc === 'title';
    let gpuY = 8;
    if (sc === 'title') drawTitle(rt);
    else if (sc === 'editor') gpuY = drawEditorOverlay();
    else if (game.player) {
      const cam = game.camera;
      drawHints({ x: cam.px + (cam.x - cam.px) * alpha, y: cam.py + (cam.y - cam.py) * alpha });
      gpuY = drawHUD();
      const r = game.result;
      if (sc === 'paused') overlay('已暫停', ['P / Esc / Enter 繼續', 'R 重新開始', '水中按 ↓ 下潛・Q 切換潮汐', 'Q 回標題（或回編輯器）'], '#7c6cff');
      else if (sc === 'clear') overlay('關卡完成！', [`時間 ${fmt(r.time)}${r.newBest ? '　★ 新紀錄' : ''}`, `潮之珠 ${r.pearls} / ${r.total}`, r.best != null ? `最佳 ${fmt(r.best)}` : '自訂關卡', 'Enter 下一關・R 重玩・Q 回標題'], '#7dffb0');
      else if (sc === 'lose') overlay('被浪捲走了……', ['潮汐不等人', game.checkpoint ? 'Enter：從檢查點重來' : 'Enter：從起點重來', 'R 整關重新開始・Q 回標題'], '#ff6a8a');
      else if (sc === 'win') overlay('深淵平息了', ['渦潮巨鰻沉入海底，潮汐重歸平靜', `最終關時間 ${fmt(r && r.time)}`, `六關最佳合計 ${fmt(Object.values(game.prog.best).reduce((a, v) => a + v, 0))}`, 'Enter 回標題'], '#ffe27a');
    }
    drawGPU(gpuY);
    for (const p of [pl.tiles, pl.ents, pl.actors, pl.glow, pl.titleSpr, S.hud.spr, S.over.spr, S.hud.txt, S.over.txt, S.gpu.txt, S.gpu.txtMono]) p.end();
    app.renderer.render({ container: app.stage });
  }

  // 自動驗證用：renderer 端統計（唯讀）
  window.__gpu = () => ready ? { renderer: app.renderer.name, filters: !!S.filtersOn, shock: S.fx.shock.enabled, parts: S.pools.parts.active, bubbles: S.pools.bubbles.active, debris: S.pools.debris.active,
    sprites: [S.pools.tiles, S.pools.ents, S.pools.actors, S.pools.glow].reduce((a, p) => a + p.active, 0) } : null;

  return { render, resize, destroy() { dead = true; if (ready) app.destroy(); ready = false; } };
}
