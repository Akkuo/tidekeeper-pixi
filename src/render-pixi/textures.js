// 執行期產生材質：sprite-data 點陣、主題磚塊、碎片、泡泡 → 打包進一張圖集（nearest），
// 另外產生發光（radial，linear 取樣）與水下位移圖（DisplacementFilter 用）。不載入任何外部圖檔。
import { Texture, CanvasSource, Rectangle } from 'pixi.js';
import { T } from '../core/constants.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// 簡單的 shelf 打包圖集
function createAtlas(size) {
  const canvas = mk(size, size), ctx = canvas.getContext('2d');
  let x = 1, y = 1, rowH = 0;
  const pending = [];
  return {
    ctx,
    // draw(ctx, ox, oy) 在保留區塊內繪製；回傳 finalize 後才有效的 Texture holder
    add(w, h, draw) {
      if (x + w + 1 > size) { x = 1; y += rowH + 1; rowH = 0; }
      const ox = x, oy = y; x += w + 1; rowH = Math.max(rowH, h);
      if (oy + h > size) throw new Error('atlas full');
      ctx.save(); ctx.translate(ox, oy); draw(ctx); ctx.restore();
      const holder = { frame: new Rectangle(ox, oy, w, h), tex: null };
      pending.push(holder);
      return holder;
    },
    finalize() {
      const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest' });
      for (const h of pending) h.tex = new Texture({ source, frame: h.frame });
      return source;
    },
  };
}

function bakeRows(rows, pal, solid) {
  return c => {
    for (let y = 0; y < rows.length; y++) for (let i = 0; i < rows[y].length; i++) {
      const ch = rows[y][i];
      if (ch === '.' || !pal[ch]) continue;
      c.fillStyle = solid || pal[ch]; c.fillRect(i, y, 1, 1);
    }
  };
}

// 主題磚塊（與 Canvas 版同一套程式紋理演算法）
function tileDrawers(th) {
  const d = { rock: [], rockTop: [] };
  for (let v = 0; v < 4; v++) for (const top of [false, true]) {
    (top ? d.rockTop : d.rock).push(x => {
      x.fillStyle = th.rock; x.fillRect(0, 0, T, T);
      for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) {
        const r = hash(i + v * 31, j + v * 17);
        if (r < 0.12) { x.fillStyle = shade(th.rock, 0.78); x.fillRect(i, j, 1, 1); }
        else if (r > 0.94) { x.fillStyle = shade(th.rock, 1.15); x.fillRect(i, j, 1, 1); }
      }
      x.fillStyle = shade(th.rock, 0.85); x.fillRect(0, T - 1, T, 1);
      x.fillStyle = th.dark; x.fillRect((v * 5) % 12 + 1, 6 + v, 3, 2); x.fillRect((v * 9 + 6) % 13, 11, 2, 2);
      if (top) {
        x.fillStyle = th.top; x.fillRect(0, 0, T, 3);
        for (let i = 0; i < T; i++) if (hash(i, v) > 0.5) x.fillRect(i, 3, 1, 1 + (hash(v, i) > 0.7 ? 1 : 0));
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 0, T, 1);
      }
    });
  }
  d.B = x => {
    x.fillStyle = shade(th.rock, 1.2); x.fillRect(0, 0, T, T);
    x.fillStyle = shade(th.rock, 0.6); x.fillRect(0, 0, T, 1); x.fillRect(0, 0, 1, T); x.fillRect(T - 1, 0, 1, T); x.fillRect(0, T - 1, T, 1);
    x.strokeStyle = th.dark; x.lineWidth = 1; x.beginPath(); x.moveTo(3, 2); x.lineTo(7, 7); x.lineTo(5, 12); x.moveTo(7, 7); x.lineTo(13, 9); x.moveTo(10, 3); x.lineTo(8, 6); x.stroke();
  };
  for (const key of ['W', 'Wtop']) d[key] = x => {
    x.fillStyle = shade(th.rock, 0.9); x.fillRect(0, 0, T, T);
    x.fillStyle = 'rgba(160,220,255,0.35)'; x.fillRect(0, 0, T, T);
    for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect((i * 7) % 14 + 1, (i * 5) % 12 + 3, 2, 1); }
    if (key === 'Wtop') { x.fillStyle = '#cdf3ff'; x.fillRect(0, 0, T, 2); x.fillStyle = '#ffffff'; x.fillRect(2, 0, 4, 1); x.fillRect(10, 0, 3, 1); }
  };
  d.plank = x => {
    x.fillStyle = '#a8743c'; x.fillRect(0, 0, T, 5);
    x.fillStyle = '#d9a35f'; x.fillRect(0, 0, T, 1);
    x.fillStyle = '#6a4220'; x.fillRect(0, 4, T, 1); x.fillRect(7, 1, 1, 3); x.fillRect(2, 5, 2, 3); x.fillRect(12, 5, 2, 3);
  };
  return d;
}

// 回傳 { spr[name][frame] = {tex, sil}, tiles[theme] = {...}, debris[theme] = Texture[], white, bubble, glow, disp, sources }
export function buildTextures(SPRITES, THEMES) {
  const atlas = createAtlas(512);
  const spr = {};
  for (const [name, d] of Object.entries(SPRITES)) {
    spr[name] = {};
    for (const [f, rows] of Object.entries(d.frames)) {
      const w = rows[0].length, h = rows.length;
      spr[name][f] = { tex: atlas.add(w, h, bakeRows(rows, d.pal)), sil: atlas.add(w, h, bakeRows(rows, d.pal, '#ffffff')) };
    }
  }
  const tiles = THEMES.map(th => {
    const d = tileDrawers(th), out = { rock: [], rockTop: [] };
    for (const k of ['rock', 'rockTop']) for (const fn of d[k]) out[k].push(atlas.add(T, T, fn));
    for (const k of ['B', 'W', 'Wtop', 'plank']) out[k] = atlas.add(T, T, d[k]);
    return out;
  });
  const white = atlas.add(1, 1, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 1, 1); });
  const bubble = atlas.add(5, 5, c => {
    c.fillStyle = 'rgba(230,250,255,0.9)'; c.fillRect(1, 0, 3, 1); c.fillRect(1, 4, 3, 1); c.fillRect(0, 1, 1, 3); c.fillRect(4, 1, 1, 3);
    c.fillStyle = 'rgba(255,255,255,1)'; c.fillRect(1, 1, 1, 1);
  });
  const source = atlas.finalize();
  const unwrap = o => { if (o && o.tex !== undefined && o.frame) return o.tex; if (Array.isArray(o)) return o.map(unwrap); if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = unwrap(o[k]); return r; } return o; };
  const out = { spr: unwrap(spr), tiles: unwrap(tiles), white: white.tex, bubble: bubble.tex };
  // 碎片：從易碎牆材質切 4×4 小塊（共用圖集來源，不另建圖）
  out.debris = tiles.map(t => [0, 1, 2, 3].map(i => new Texture({ source, frame: new Rectangle(t.B.frame.x + (i % 2) * 6 + 2, t.B.frame.y + (i >> 1) * 6 + 2, 4, 4) })));

  // 發光：徑向漸層（linear 取樣，配合加法混合）
  const gc = mk(64, 64), g = gc.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  out.glow = new Texture({ source: new CanvasSource({ resource: gc, scaleMode: 'linear' }) });

  // 水下位移圖：x 方向週期 128px 的平滑雜訊（R=x 位移、G=y 位移，128 為不位移）；頂端 6 列淡入，
  // 配合 clamp-to-edge，位移圖上緣以上（水面以上）取樣到中性灰＝不扭曲。
  const DW = 1024, DH = 128, dc = mk(DW, DH), dx = dc.getContext('2d'), img = dx.createImageData(DW, DH);
  const P = Math.PI * 2 / 128;
  for (let y = 0; y < DH; y++) {
    const fade = Math.min(1, y / 6);
    for (let x = 0; x < DW; x++) {
      const r = Math.sin(x * P * 2 + y * 0.21) * 0.55 + Math.sin(x * P * 5 - y * 0.13 + 1.7) * 0.3 + Math.sin(x * P * 9 + y * 0.37) * 0.15;
      const s = Math.cos(x * P * 3 + y * 0.17 + 0.6) * 0.6 + Math.sin(x * P * 7 - y * 0.29) * 0.4;
      const i = (y * DW + x) * 4;
      img.data[i] = 128 + r * 110 * fade; img.data[i + 1] = 128 + s * 110 * fade; img.data[i + 2] = 128; img.data[i + 3] = 255;
    }
  }
  dx.putImageData(img, 0, 0);
  out.disp = new Texture({ source: new CanvasSource({ resource: dc, scaleMode: 'linear', addressMode: 'clamp-to-edge' }) });
  out.dispPeriod = 128;
  return out;
}
