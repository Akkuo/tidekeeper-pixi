// 遊戲狀態機：title / playing / paused / clear / lose / win / editor（純邏輯）
import { T, TIDE, WATER_LOW_ROW, WATER_HIGH_ROW, MENU, LEVEL_COUNT, PHYS } from './constants.js';
import { LEVELS, THEMES, buildLevel, parseLevel, levelRows } from './levels.js';
import { createInput } from './input.js';
import { createPlayer, updatePlayer, spawnEntity, updateEntities, createBoss, updateBoss } from './entities.js';
import { createGhost, recordGhost, ghostPose, commitGhost } from './ghost.js';
import { loadProgress, saveProgress } from './save.js';
import { createEditor, editorKeys, editorPaint, exportJSON, loadCustom, BRUSHES } from './editor.js';
import { overlap } from './physics.js';

const ease = t => t * t * (3 - 2 * t);

export function createGame({ audio, host = {} }) {
  const prog = loadProgress();
  const g = {
    scene: 'title', frame: 0, time: 0, sel: 0, prog, input: createInput(), audio, host,
    settings: { fx: true }, view: { w: 444, h: 270, scale: 1 }, camera: { x: 0, y: 0, px: 0, py: 0 },
    level: null, levelIdx: 0, custom: false, player: null, entities: [], projectiles: [], boss: null, bossActive: false,
    tide: { high: false, p: 0, trans: 0, cd: 0 }, waterY: 0, gust: 0, flash: 0,
    runTime: 0, pearlsGot: 0, checkpoint: null, result: null, ghost: null, ghostPose: null,
    events: [], evSeq: 0, editor: null, fps: 0, sceneT: 0,
  };
  audio.setMuted(prog.muted);
  audio.setMusic(6);

  g.emit = (type, x, y) => {
    g.events.push({ id: ++g.evSeq, type, x, y });
    if (g.events.length > 64) g.events.shift();
    if (type === 'hurt') audio.sfx('hurt');
  };
  g.setScene = s => {
    g.scene = s; g.sceneT = 0; g.input.releaseAll();
    if (s === 'lose') audio.sfx('lose');
  };

  function loadLevel(lv) {
    g.level = lv;
    g.player = createPlayer(lv.spawn);
    g.entities = []; g.projectiles = []; g.boss = null; g.bossActive = false;
    for (const s of lv.spawns) {
      if (s.type === 'boss') g.boss = createBoss(s, lv);
      else { const e = spawnEntity(s); if (e) g.entities.push(e); }
    }
    g.tide = { high: false, p: 0, trans: 0, cd: 0 };
    g.waterLowY = WATER_LOW_ROW * T + (lv.h - 18) * T; g.waterHighY = WATER_HIGH_ROW * T + (lv.h - 18) * T;
    g.waterY = g.waterLowY;
    g.runTime = 0; g.pearlsGot = 0; g.checkpoint = null; g.result = null; g.gust = 0;
    g.pearlsTotal = g.entities.filter(e => e.type === 'pearl').length;
    snapCamera();
    g.setScene('playing');
  }
  g.startLevel = idx => {
    g.levelIdx = idx; g.custom = false;
    loadLevel(buildLevel(idx));
    g.ghost = createGhost(idx);
    audio.setMusic(THEMES[LEVELS[idx].theme].bgm); audio.sfx('start');
  };
  g.startCustom = (rows, theme) => {
    g.custom = true;
    loadLevel(parseLevel(rows, { theme, boss: rows.some(r => r.includes('X')) }));
    g.ghost = createGhost(null);
    audio.setMusic(THEMES[theme].bgm);
  };
  g.restart = () => { if (g.custom) g.startCustom(editorRowsCache, g.editor ? g.editor.theme : 0); else g.startLevel(g.levelIdx); };
  let editorRowsCache = null;

  g.toggleTide = forced => {
    const td = g.tide;
    if (!forced && (td.trans > 0 || td.cd > 0)) { audio.sfx('deny'); return; }
    td.high = !td.high; td.trans = TIDE.trans; td.from = td.p;
    audio.sfx(td.high ? 'tide' : 'tideDown');
    g.emit(td.high ? 'tideup' : 'tidedown', g.player.x, g.waterY);
  };

  function updateTide(dt) {
    const td = g.tide;
    if (td.trans > 0) {
      td.trans = Math.max(0, td.trans - dt);
      const k = 1 - td.trans / TIDE.trans, to = td.high ? 1 : 0;
      td.p = td.from + (to - td.from) * ease(k);
      if (td.trans === 0) td.cd = TIDE.cooldown;
    } else td.cd = Math.max(0, td.cd - dt);
    g.waterY = g.waterLowY + (g.waterHighY - g.waterLowY) * td.p;
  }

  function snapCamera() { updateCamera(1, true); }
  function updateCamera(dt, snap) {
    const p = g.player, v = g.view, c = g.camera, lv = g.level;
    const tx = p.x + p.w / 2 - v.w / 2 + p.facing * 24, ty = p.y + p.h / 2 - v.h * 0.55;
    c.px = c.x; c.py = c.y;
    const k = snap ? 1 : Math.min(1, 5 * dt);
    c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    clampCam(c, lv.w * T, lv.h * T);
    if (snap) { c.px = c.x; c.py = c.y; }
  }
  function clampCam(c, W, H) {
    const v = g.view;
    c.x = W <= v.w ? (W - v.w) / 2 : Math.max(0, Math.min(W - v.w, c.x));
    c.y = H <= v.h ? (H - v.h) / 2 : Math.max(0, Math.min(H - v.h, c.y));
  }

  function levelClear() {
    const t = g.runTime;
    audio.sfx(g.boss ? 'win' : 'clear');
    if (g.custom) { g.result = { time: t, pearls: g.pearlsGot, total: g.pearlsTotal, best: null, newBest: false }; g.setScene('clear'); return; }
    const id = g.levelIdx, prev = prog.best[id];
    const newBest = !prev || t < prev;
    if (newBest) { prog.best[id] = t; commitGhost(g.ghost, t); }
    prog.pearls[id] = Math.max(prog.pearls[id] | 0, g.pearlsGot);
    prog.unlocked = Math.max(prog.unlocked, Math.min(LEVEL_COUNT, id + 2));
    saveProgress(prog);
    g.result = { time: t, pearls: g.pearlsGot, total: g.pearlsTotal, best: prog.best[id], newBest };
    g.setScene(id === LEVEL_COUNT - 1 ? 'win' : 'clear');
    if (g.scene === 'win') audio.setMusic(6);
  }
  g.bossDefeated = () => levelClear();

  function openEditor() {
    let rows, theme = 0;
    const saved = loadCustom();
    if (saved && saved.rows) { rows = saved.rows; theme = saved.theme | 0; } else { rows = levelRows(g.sel).rows; theme = LEVELS[g.sel].theme; }
    g.editor = createEditor(rows, theme);
    g.level = parseLevel(rows, { theme });
    g.setScene('editor');
    audio.setMusic(-1);
  }

  // 指標輸入（正規化 0..1 螢幕座標）；buttons: 0 移動、1 畫、2 擦
  g.pointer = (nx, ny, buttons, isTap) => {
    if (g.scene === 'editor') {
      const ed = g.editor, cx = Math.floor((ed.camX + nx * g.view.w) / T), cy = Math.floor((ed.camY + ny * g.view.h) / T);
      ed.cursor = { x: cx, y: cy };
      if (buttons && editorPaint(ed, cx, cy, buttons === 2)) { audio.sfx('paint'); refreshEditorLevel(); }
      return;
    }
    if (!isTap) return;
    if (g.scene === 'title') {
      if (ny >= MENU.cardY0 && ny <= MENU.cardY1 && nx >= MENU.cardX0 && nx <= MENU.cardX1) {
        const i = Math.floor((nx - MENU.cardX0) / (MENU.cardX1 - MENU.cardX0) * LEVEL_COUNT);
        if (i < prog.unlocked) { g.sel = i; g.startLevel(i); } else audio.sfx('deny');
      } else g.startLevel(g.sel);
    } else if (g.scene === 'paused') g.setScene('playing');
    else if (['clear', 'lose', 'win'].includes(g.scene) && g.sceneT > 0.4) g.input.pressed.confirm = true;
  };
  function refreshEditorLevel() { const ed = g.editor; g.level = parseLevel(ed.grid.map(r => r.join('')), { theme: ed.theme }); }

  g.setView = (cssW, cssH) => {
    const scale = Math.max(1, Math.min(cssW / 320, cssH / 270));
    g.view.w = Math.max(160, Math.round(cssW / scale)); g.view.h = Math.max(120, Math.round(cssH / scale)); g.view.scale = scale;
    if (g.level && g.player) snapCamera();
  };

  g.update = dt => {
    const inp = g.input, a = inp.pressed;
    g.frame++; g.time += dt; g.sceneT += dt;
    if (a.mute) { prog.muted = audio.toggleMute(); saveProgress(prog); }
    if (a.fx) g.settings.fx = !g.settings.fx;
    switch (g.scene) {
      case 'title':
        if (a.left) { g.sel = (g.sel + prog.unlocked - 1) % prog.unlocked; audio.sfx('select'); }
        if (a.right) { g.sel = (g.sel + 1) % prog.unlocked; audio.sfx('select'); }
        for (const c of inp.codes) if (/^Digit[1-6]$/.test(c)) { const i = +c[5] - 1; if (i < prog.unlocked) { g.sel = i; g.startLevel(i); } else audio.sfx('deny'); }
        if (g.scene === 'title' && (a.confirm || a.jump)) g.startLevel(g.sel);
        if (a.editor) openEditor();
        break;
      case 'playing': stepPlaying(dt); break;
      case 'paused':
        if (a.pause || a.confirm) g.setScene('playing');
        else if (a.restart) g.restart();
        else if (a.tide) exitToMenu();
        break;
      case 'clear':
        if (g.sceneT < 0.4) break;
        if (a.confirm || a.jump) { if (g.custom) backToEditor(); else g.startLevel(Math.min(LEVEL_COUNT - 1, g.levelIdx + 1)); }
        else if (a.restart) g.restart();
        else if (a.tide || a.pause) exitToMenu();
        break;
      case 'lose':
        if (g.sceneT < 0.4) break;
        if (a.confirm || a.jump) respawn();
        else if (a.restart) g.restart();
        else if (a.tide || a.pause) exitToMenu();
        break;
      case 'win':
        if (g.sceneT > 0.8 && (a.confirm || a.jump || a.pause)) { g.scene = 'title'; g.sel = 0; audio.setMusic(6); }
        break;
      case 'editor': {
        const cmd = editorKeys(g.editor, inp.codes, inp.down, dt, g.view.w, g.view.h, T);
        g.camera.x = g.camera.px = g.editor.camX; g.camera.y = g.camera.py = g.editor.camY;
        g.waterY = g.editor.tidePreview ? WATER_HIGH_ROW * T : WATER_LOW_ROW * T;
        if (inp.codes.some(c => c === 'KeyG' || c === 'KeyN' || c === 'KeyL')) refreshEditorLevel();
        if (cmd === 'test') { editorRowsCache = g.editor.grid.map(r => r.join('')); g.startCustom(editorRowsCache, g.editor.theme); }
        else if (cmd === 'export') { const ok = g.host.copy ? g.host.copy(exportJSON(g.editor)) : false; g.editor.msg = ok === false ? '已存檔（剪貼簿不可用）' : '已匯出 JSON 到剪貼簿並存檔'; g.editor.msgT = 3; }
        else if (cmd === 'exit') { g.scene = 'title'; audio.setMusic(6); }
        break;
      }
    }
    audio.update();
    inp.endStep();
  };

  function exitToMenu() { if (g.custom && g.editor) backToEditor(); else { g.setScene('title'); audio.setMusic(6); } }
  function backToEditor() { refreshEditorLevel(); g.setScene('editor'); audio.setMusic(-1); }
  function respawn() {
    const p = g.player, at = g.checkpoint || g.level.spawn;
    Object.assign(p, createPlayer(at));
    snapCamera(); g.setScene('playing');
  }

  function stepPlaying(dt) {
    const a = g.input.pressed;
    if (a.pause) { g.setScene('paused'); return; }
    if (a.restart) { g.restart(); return; }
    if (a.tide) g.toggleTide(false);
    updateTide(dt);
    if (g.level.wind) {
      const ph = g.time % 4.5;
      g.gust = ph < 2.4 ? 0 : ph < 2.8 ? (ph - 2.4) / 0.4 : ph < 3.6 ? 1 : ph < 4 ? (4 - ph) / 0.4 : 0;
      if (Math.random() < 0.004) g.flash = 1;
    }
    g.flash = Math.max(0, g.flash - dt * 3);
    updatePlayer(g, dt);
    if (g.scene !== 'playing') return;
    updateEntities(g, dt);
    if (g.scene !== 'playing') return; // 同一幀先敗北時，不讓 Boss 死亡動畫改判勝利
    if (g.boss) updateBoss(g, dt);
    if (g.scene !== 'playing') return;
    g.runTime += dt;
    if (g.level.exit && !g.boss && overlap(g.player, g.level.exit)) { levelClear(); return; }
    recordGhost(g.ghost, g.player);
    g.ghostPose = ghostPose(g.ghost);
    updateCamera(dt, false);
  }

  // 可 JSON 序列化的狀態快照（自動驗證用）
  g.snapshot = () => {
    const p = g.player;
    return {
      scene: g.scene, frame: g.frame, fps: g.fps, level: g.custom ? 'custom' : g.levelIdx + 1,
      levelName: g.level ? g.level.name : null,
      player: p ? { x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1), hp: p.hp, onGround: p.onGround, inWater: p.inWater, anim: p.anim } : null,
      tide: g.tide.high ? 'high' : 'low', tideProgress: +g.tide.p.toFixed(2), waterY: Math.round(g.waterY),
      pearls: g.pearlsGot, time: +g.runTime.toFixed(2), enemies: g.entities.filter(e => e.enemy && e.alive).length,
      boss: g.boss ? { hp: g.boss.hp, phase: g.boss.phase, state: g.boss.state } : null,
      unlocked: prog.unlocked, fx: g.settings.fx, brush: g.editor ? BRUSHES[g.editor.brush] : null,
    };
  };
  return g;
}
