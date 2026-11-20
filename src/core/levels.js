// 關卡資料：主題、區塊模板、6 大關組成、解析成執行期關卡。純資料與純函式。
import { T, ROWS, ENTITY_CHARS } from './constants.js';

export const THEMES = [
  { key: 'shore', sky: ['#3fa9e8', '#bfeaff'], rock: '#c9a26b', dark: '#7d5f3c', top: '#5fd36a', water: '#2a9dff', deep: '#0b4f9e', accent: '#3ad6ff', bgm: 0 },
  { key: 'coral', sky: ['#07607a', '#36c4c4'], rock: '#e0607a', dark: '#8a2a44', top: '#ffb0c0', water: '#18c8c0', deep: '#05506a', accent: '#ff8ad8', bgm: 1 },
  { key: 'wreck', sky: ['#173129', '#46705a'], rock: '#7a5a3a', dark: '#3a2616', top: '#9fbf6a', water: '#2f8f7a', deep: '#0b322c', accent: '#d8c070', bgm: 2 },
  { key: 'crystal', sky: ['#160c28', '#3b2a5e'], rock: '#b8acdc', dark: '#5e4f8a', top: '#ffffff', water: '#6a8cff', deep: '#1e1660', accent: '#c58cff', bgm: 3 },
  { key: 'storm', sky: ['#1b2028', '#4a5566'], rock: '#5a6270', dark: '#2a2f38', top: '#8a96a6', water: '#3a6a8a', deep: '#0c1f30', accent: '#ffe27a', bgm: 4 },
  { key: 'abyss', sky: ['#02040e', '#0c1c40'], rock: '#2c3262', dark: '#11142c', top: '#5a6aff', water: '#1a3aaa', deep: '#030a28', accent: '#ff3d6e', bgm: 5 },
];

const R = (s, n) => Array(n).fill(s);
// 區塊模板：rows 由下往上對齊（不足的上方補空白），ground = 底部補幾列實心岩
const CHUNKS = {
  start: { rows: ['..S.............'], ground: 4 },
  flat: { rows: ['.........o......', '................', '................', '......c.........'], ground: 4 },
  flat2: { rows: ['.......C........'], ground: 4 },
  pit: { rows: ['................', '######...#######', '######...#######', '######^^^#######'], ground: 1 },
  wall: { rows: ['..........o.....', ...R('........######..', 7)], ground: 4 },
  cave: { rows: [...R('################', 10), ...R('<<<<<<<<<<<<<<<<', 4)], ground: 4 },
  breakwall: { rows: R('........BB......', 14), ground: 4 },
  stairs: { rows: ['.........o......', '.......====.....', '................', '................', '...====.....====', '................', '................'], ground: 4 },
  slip: { rows: ['.....^......^...', 'WWWWWWWWWWWWWWWW'], ground: 3 },
  pool: { rows: ['.........j......', '####tttttt######', '####tttttt######', '####tttttt######'], ground: 1 },
  lagoon: { rows: ['...==..==..==...', '................', '................', '##............##', '##............##', '##...j....j...##'], ground: 1 },
  hull: { rows: [...R('################', 4), '................', '...........o....', '..........####..', '................', '................', '....=====.......', '................', '................', '................', '..p......c......'], ground: 4 },
  spikecave: { rows: [...R('################', 8), 'KKKKKKKKKKKKKKKK', '................', '................', '................', '................', '....K......K....', 'WWWWWWWWWWWWWWWW'], ground: 3 },
  pillars: { rows: ['.........##.....', '.....##..##.....', '.##..##..##.....', '.##..##..##.....', ...R('###..##..##..###', 3)], ground: 1 },
  end: { rows: ['.........E......'], ground: 4 },
  arena: { rows: arenaRows(), ground: 0 },
};

function arenaRows() {
  const w = 32, rows = [];
  for (let y = 0; y < ROWS; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      let c = '.';
      if (y === 0 || y >= 14 || x === w - 1) c = '#';
      else if (y === 11 && ((x >= 5 && x <= 9) || (x >= 22 && x <= 26))) c = '=';
      else if (y === 8 && x >= 13 && x <= 18) c = '=';
      else if (y === 13 && x === 29) c = 'E';
      else if (y === 9 && x === 16) c = 'X';
      r += c;
    }
    rows.push(r);
  }
  return rows;
}

export const LEVELS = [
  { name: '潮池海岸', en: 'Tidepool Shore', theme: 0,
    chunks: ['start', 'flat', 'pit', 'flat2', 'wall', 'breakwall', 'cave', 'stairs', 'end'],
    hints: [[0, 3, 9, 'A/D 或 ←/→ 移動，Space 跳（按久跳更高）'], [2, 2, 9, '跳過海膽坑；掉下去也能游上來'],
      [4, 1, 5, '按 Q 切換潮汐：滿潮時隨水位浮上高處'], [5, 1, 9, 'X / J 三叉戟突刺，擊破易碎牆'],
      [5, 11, 6, '前方洞穴滿潮有逆流——乾潮再走'], [7, 1, 5, '水中按 ↓ 下潛']] },
  { name: '珊瑚迴廊', en: 'Coral Corridor', theme: 1,
    chunks: ['start', 'lagoon', 'pool', 'flat', 'wall', 'lagoon', 'flat2', 'cave', 'stairs', 'end'],
    hints: [[0, 3, 9, '水母浮在水面——潛到下方，或換個潮汐'], [2, 1, 9, '潮池永遠有水：按住 ↓ 從水母下方潛過去']] },
  { name: '沉船殘骸', en: 'Shipwreck', theme: 2,
    chunks: ['start', 'breakwall', 'hull', 'pit', 'flat2', 'hull', 'wall', 'breakwall', 'stairs', 'end'],
    hints: [[0, 3, 9, '乾潮時河豚擱淺，無法傷人']] },
  { name: '鹽晶洞窟', en: 'Salt Crystal Cave', theme: 3,
    chunks: ['start', 'spikecave', 'slip', 'flat2', 'wall', 'cave', 'spikecave', 'stairs', 'flat', 'end'],
    hints: [[0, 3, 9, '滿潮會把你浮上頂部晶刺；鹽地很滑']] },
  { name: '暴風燈塔', en: 'Storm Lighthouse', theme: 4, wind: true,
    chunks: ['start', 'pillars', 'slip', 'pillars', 'flat2', 'wall', 'breakwall', 'pillars', 'stairs', 'flat', 'end'],
    hints: [[0, 3, 9, '陣風會把你往左吹；水中不受風']] },
  { name: '深淵王座', en: 'Abyssal Throne', theme: 5, boss: true,
    chunks: ['start', 'flat', 'wall', 'flat2', 'stairs', 'arena'],
    hints: [[5, 2, 4, '渦潮巨鰻衝刺後會力竭——趁機突刺頭部！']] },
];

function chunkRows(name) {
  const c = CHUNKS[name];
  const w = Math.max(...c.rows.map(r => r.length));
  const body = [...c.rows, ...R('#'.repeat(w), c.ground)].map(r => r.padEnd(w, '.'));
  while (body.length < ROWS) body.unshift('.'.repeat(w));
  return body.slice(-ROWS);
}

// 把關卡定義組成字串列（編輯器也用這個格式）
export function levelRows(idx) {
  const def = LEVELS[idx];
  const rows = R('', ROWS);
  const hints = [];
  let x0 = 0;
  def.chunks.forEach((name, ci) => {
    const cr = chunkRows(name);
    for (let y = 0; y < ROWS; y++) rows[y] += cr[y];
    for (const h of def.hints) if (h[0] === ci) hints.push({ x: (x0 + h[1]) * T, y: h[2] * T, text: h[3] });
    x0 += cr[0].length;
  });
  // 每關恰好 3 顆潮之珠：取第一、中間、最後一顆，其餘移除
  const pearls = [];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'o') pearls.push([x, y]); });
  const keep = pearls.length <= 3 ? pearls : [pearls[0], pearls[Math.floor(pearls.length / 2)], pearls[pearls.length - 1]];
  for (const p of pearls) if (!keep.includes(p)) rows[p[1]] = rows[p[1]].slice(0, p[0]) + '.' + rows[p[1]].slice(p[0] + 1);
  return { rows, hints };
}

// 字串列 → 執行期關卡（grid 可被修改，例如易碎牆）
export function parseLevel(rows, opts = {}) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const grid = [], spawns = [];
  let spawn = { x: 2 * T, y: 12 * T }, exit = null;
  for (let y = 0; y < h; y++) {
    const line = [];
    for (let x = 0; x < w; x++) {
      const c = rows[y][x] || '.';
      if (ENTITY_CHARS.includes(c)) {
        line.push('.');
        if (c === 'S') spawn = { x: x * T + 3, y: y * T + 2 };
        else if (c === 'E') exit = { x: x * T, y: y * T - 2 * T, w: T, h: 3 * T };
        else spawns.push({ type: { o: 'pearl', c: 'crab', j: 'jelly', p: 'puffer', C: 'checkpoint', X: 'boss' }[c], x: x * T, y: y * T });
      } else line.push(c);
    }
    grid.push(line);
  }
  return { w, h, grid, spawn, exit, spawns, hints: opts.hints || [], theme: opts.theme || 0,
    wind: !!opts.wind, boss: !!opts.boss, name: opts.name || '自訂關卡', en: opts.en || 'Custom' };
}

export function buildLevel(idx) {
  const def = LEVELS[idx];
  const { rows, hints } = levelRows(idx);
  return parseLevel(rows, { hints, theme: def.theme, wind: def.wind, boss: def.boss, name: def.name, en: def.en });
}
