// 實體：玩家、螃蟹、水母、河豚、檢查點、潮之珠、Boss「渦潮巨鰻」與泡泡彈（純邏輯）
import { T, PHYS as P } from './constants.js';
import { moveX, moveY, waterAt, surfaceAbove, hazardHit, overlap, tileAt, solidAt } from './physics.js';

const approach = (v, t, a) => (v < t ? Math.min(v + a, t) : Math.max(v - a, t));

export function createPlayer(spawn) {
  return { x: spawn.x, y: spawn.y, w: 10, h: 14, vx: 0, vy: 0, facing: 1, onGround: false, groundTile: '',
    coyote: 0, jumpBuf: 0, dashT: 0, dashCd: 0, invuln: 0, hp: 3, maxHp: 3, inWater: false, depth: 0,
    anim: 'stand', animT: 0, lastSafe: { x: spawn.x, y: spawn.y }, prevX: spawn.x, prevY: spawn.y };
}

export function hurtPlayer(g, srcX) {
  const p = g.player;
  if (p.invuln > 0 || g.scene !== 'playing') return;
  p.hp--; p.invuln = P.invuln; p.vy = -200; p.vx = Math.sign(p.x + p.w / 2 - srcX || 1) * 140; p.dashT = 0;
  g.emit('hurt', p.x + p.w / 2, p.y + p.h / 2);
  if (p.hp <= 0) g.setScene('lose');
}

export function updatePlayer(g, dt) {
  const p = g.player, lv = g.level, inp = g.input;
  p.prevX = p.x; p.prevY = p.y;
  const dir = (inp.down.right ? 1 : 0) - (inp.down.left ? 1 : 0);
  if (dir) p.facing = dir;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const wasWater = p.inWater;
  p.inWater = waterAt(g, cx, cy);
  if (p.inWater) { p.depth = cy - surfaceAbove(g, cx, cy); if (!wasWater && p.vy > 120) g.emit('splash', cx, cy - 4); }
  else if (wasWater) g.emit('splash', cx, cy + 4);

  p.invuln = Math.max(0, p.invuln - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.jumpBuf = inp.pressed.jump ? P.buffer : Math.max(0, p.jumpBuf - dt);
  p.coyote = p.onGround ? P.coyote : Math.max(0, p.coyote - dt);

  if (inp.pressed.attack && p.dashCd <= 0) {
    p.dashT = P.dashT; p.dashCd = P.dashCd; p.vx = p.facing * P.dashV; p.vy = 0;
    g.emit('dash', cx, cy); g.audio.sfx('dash');
  }

  if (p.dashT > 0) {
    p.dashT -= dt;
    // 突刺結束時速度夾回跑速上限，避免保留突刺動量連跳加速
    p.vx = p.dashT > 0 ? p.facing * P.dashV : p.facing * P.maxRun;
    dashHits(g);
  } else if (p.inWater) {
    p.vx = approach(p.vx, dir * P.swimMax, P.swimAccel * dt);
    let ay = -Math.max(-P.buoy, Math.min(P.buoy, (p.depth - 1) * 40));
    if (inp.down.down) ay += P.diveAccel;
    p.vy += ay * dt;
    p.vy *= Math.max(0, 1 - P.waterDrag * dt);
    if (p.jumpBuf > 0) {
      p.jumpBuf = 0;
      if (p.depth < 9) { p.vy = P.surfaceJumpV; g.emit('splash', cx, cy); } else p.vy = Math.min(p.vy, P.strokeV);
      g.audio.sfx('swim');
    }
    p.vy = Math.max(-320, Math.min(160, p.vy));
  } else {
    const slip = p.onGround && p.groundTile === 'W';
    const acc = p.onGround ? (slip ? P.slipAccel : P.accel) : P.airAccel;
    if (dir) p.vx = approach(p.vx, dir * P.maxRun, acc * dt);
    else if (p.onGround) p.vx = approach(p.vx, 0, (slip ? P.slipFric : P.fric) * dt);
    else p.vx = approach(p.vx, 0, 200 * dt);
    p.vy = Math.min(P.maxFall, p.vy + P.grav * dt);
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = P.jumpV; p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
      g.emit('jump', cx, p.y + p.h); g.audio.sfx('jump');
    }
    if (!inp.down.jump && p.vy < P.jumpCut) p.vy = P.jumpCut;
  }

  p.hitWall = 0; p.hitCeil = false;
  const wasGround = p.onGround; p.onGround = false;
  moveX(lv, p, p.vx * dt);
  moveY(lv, p, p.vy * dt, inp.down.down && !p.inWater);
  if (p.onGround && !wasGround && !p.inWater) g.emit('land', p.x + p.w / 2, p.y + p.h);

  // 海流（只在水中）與陣風（只在水外）
  const cur = tileAt(lv, Math.floor((p.x + p.w / 2) / T), Math.floor((p.y + p.h / 2) / T));
  if (p.inWater && (cur === '<' || cur === '>')) moveX(lv, p, (cur === '<' ? -1 : 1) * P.currentV * dt);
  if (lv.wind && !p.inWater && g.gust > 0) moveX(lv, p, P.windV * g.gust * dt);

  // 危害、墜落
  const hx = hazardHit(lv, p);
  if (hx !== null) hurtPlayer(g, hx);
  if (p.onGround && !p.inWater && hx === null && p.invuln <= 0) { p.lastSafe.x = p.x; p.lastSafe.y = p.y; }
  if (p.y > lv.h * T + 40) {
    p.invuln = 0; hurtPlayer(g, p.x);
    p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = p.vy = 0; p.prevX = p.x; p.prevY = p.y;
  }

  p.animT += dt;
  p.anim = p.dashT > 0 ? 'dash' : p.inWater ? 'swim' : !p.onGround ? 'jump' : Math.abs(p.vx) > 10 ? 'run' : 'stand';
}

function dashHits(g) {
  const p = g.player, lv = g.level;
  const hb = { x: p.facing > 0 ? p.x + p.w - 2 : p.x - 8, y: p.y + 1, w: 10, h: p.h - 2 };
  const x0 = Math.floor(hb.x / T), x1 = Math.floor((hb.x + hb.w) / T);
  const y0 = Math.floor(hb.y / T), y1 = Math.floor((hb.y + hb.h) / T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (tileAt(lv, x, y) === 'B') { lv.grid[y][x] = '.'; g.emit('break', x * T + 8, y * T + 8); g.audio.sfx('break'); }
  }
  const hit = { x: Math.min(hb.x, p.x), y: p.y - 2, w: p.w + 10, h: p.h + 4 };
  for (const e of g.entities) {
    if (!e.alive || !e.enemy) continue;
    if (overlap(hit, e)) { e.alive = false; g.emit('kill', e.x + e.w / 2, e.y + e.h / 2); g.audio.sfx('hit'); }
  }
  const b = g.boss;
  if (b && b.state === 'tired' && overlap(hit, bossHead(b))) damageBoss(g);
}

export function spawnEntity(s) {
  const base = { type: s.type, x: s.x, y: s.y, vx: 0, vy: 0, dir: -1, alive: true, t: Math.random() * 6, enemy: false, stranded: false };
  switch (s.type) {
    case 'crab': return { ...base, x: s.x + 2, y: s.y + 8, w: 12, h: 8, enemy: true };
    case 'jelly': return { ...base, x: s.x + 3, y: s.y + 3, w: 10, h: 10, enemy: true, homeY: s.y };
    case 'puffer': return { ...base, x: s.x + 3, y: s.y + 6, w: 10, h: 8, enemy: true, homeY: s.y + 6, dir: 1 };
    case 'pearl': return { ...base, x: s.x + 5, y: s.y + 5, w: 6, h: 6 };
    case 'checkpoint': return { ...base, x: s.x + 4, y: s.y - 8, w: 8, h: 24, on: false };
    default: return null;
  }
}

export function updateEntities(g, dt) {
  const lv = g.level, p = g.player;
  for (const e of g.entities) {
    if (!e.alive) continue;
    e.t += dt;
    if (e.type === 'crab') {
      e.vy = Math.min(P.maxFall, e.vy + P.grav * dt);
      e.hitWall = 0; e.onGround = false;
      moveX(lv, e, e.dir * 30 * dt);
      moveY(lv, e, e.vy * dt);
      const fx = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
      const below = tileAt(lv, Math.floor(fx / T), Math.floor((e.y + e.h + 2) / T));
      if (e.hitWall || (e.onGround && !solidAt(lv, Math.floor(fx / T), Math.floor((e.y + e.h + 2) / T)) && below !== '=')) e.dir *= -1;
    } else if (e.type === 'jelly' || e.type === 'puffer') {
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      if (waterAt(g, cx, cy)) {
        e.stranded = false;
        const surf = surfaceAbove(g, cx, cy);
        const target = e.type === 'jelly' ? surf + 6 + Math.sin(e.t * 2) * 4 : Math.max(e.homeY, surf + 6);
        e.vy += (target - cy) * 10 * dt; e.vy *= 1 - 3 * dt;
        if (e.type === 'puffer') { e.hitWall = 0; moveX(lv, e, e.dir * 36 * dt); if (e.hitWall) e.dir *= -1; }
        else moveX(lv, e, Math.sin(e.t * 0.7) * 10 * dt);
      } else {
        e.stranded = true;
        e.vy = Math.min(P.maxFall, e.vy + P.grav * dt);
      }
      e.onGround = false;
      moveY(lv, e, e.vy * dt);
    } else if (e.type === 'pearl') {
      if (overlap(p, e)) { e.alive = false; g.pearlsGot++; g.emit('pearl', e.x + 3, e.y + 3); g.audio.sfx('pearl'); }
      continue;
    } else if (e.type === 'checkpoint') {
      if (!e.on && overlap(p, e)) { e.on = true; g.checkpoint = { x: e.x - 1, y: e.y + 8 }; g.emit('checkpoint', e.x + 4, e.y); g.audio.sfx('checkpoint'); }
      continue;
    }
    if (e.enemy && !e.stranded && p.dashT <= 0 && overlap(p, e)) hurtPlayer(g, e.x + e.w / 2);
    if (e.y > lv.h * T + 60) e.alive = false;
  }
  // 泡泡彈
  for (const b of g.projectiles) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt;
    if (b.t <= 0 || solidAt(lv, Math.floor(b.x / T), Math.floor(b.y / T))) { b.dead = true; g.emit('pop', b.x, b.y); continue; }
    if (overlap(p, { x: b.x - 4, y: b.y - 4, w: 8, h: 8 })) { b.dead = true; hurtPlayer(g, b.x); g.emit('pop', b.x, b.y); }
  }
  g.projectiles = g.projectiles.filter(b => !b.dead);
}

// ---------- Boss：渦潮巨鰻 ----------
export function createBoss(s, lv) {
  // 競技場：從 X 所在欄往左右找牆
  const row = Math.floor(s.y / T);
  let x1 = Math.floor(s.x / T); while (x1 < lv.w - 1 && !solidAt(lv, x1 + 1, row)) x1++;
  const left = x1 - 30;
  const b = { x: s.x + 8, y: (lv.h - 1) * T, hp: 8, maxHp: 8, phase: 1, state: 'dormant', t: 0, dir: -1, trail: [],
    hurtT: 0, arena: { x0: (left + 2) * T, x1: (x1 - 1) * T, y0: 2 * T, y1: 13 * T, enter: (left + 3) * T },
    tideTimer: 5, shots: 0, aimY: 0 };
  for (let i = 0; i < 60; i++) b.trail.push({ x: b.x, y: b.y });
  return b;
}
export const bossHead = b => ({ x: b.x - 9, y: b.y - 7, w: 18, h: 14 });
export const bossSegments = b => { const out = []; for (let i = 1; i <= 11; i++) { const p = b.trail[Math.min(b.trail.length - 1, i * 5)]; out.push({ x: p.x, y: p.y, r: 7 - i * 0.35 }); } return out; };

function damageBoss(g) {
  const b = g.boss;
  b.hp--; b.state = 'hurt'; b.t = 0; b.hurtT = 0.6;
  g.emit('bosshit', b.x, b.y); g.audio.sfx('bosshit');
  if (b.hp <= 0) { b.state = 'dying'; b.t = 0; g.emit('bossdie', b.x, b.y); g.audio.sfx('win'); return; }
  if (b.phase === 1 && b.hp <= b.maxHp / 2) {
    b.phase = 2; b.tideTimer = 0.2; g.emit('phase2', b.x, b.y); g.audio.sfx('roar');
  }
}

export function updateBoss(g, dt) {
  const b = g.boss, p = g.player, A = b.arena;
  if (!b) return;
  b.t += dt; b.hurtT = Math.max(0, b.hurtT - dt);
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  const goto = (tx, ty, k) => { b.x += (tx - b.x) * Math.min(1, k * dt); b.y += (ty - b.y) * Math.min(1, k * dt); };
  const mid = (A.x0 + A.x1) / 2;
  switch (b.state) {
    case 'dormant':
      if (pcx > A.enter) { b.state = 'emerge'; b.t = 0; g.bossActive = true; g.audio.sfx('roar'); g.emit('roar', mid, A.y1); }
      break;
    case 'emerge': goto(mid, 7 * T, 2); if (b.t > 1.6) { b.state = 'swim'; b.t = 0; } break;
    case 'swim': {
      const k = b.t * (b.phase === 2 ? 1.6 : 1.2);
      goto(mid + Math.sin(k) * (A.x1 - A.x0) * 0.32, 7 * T + Math.sin(k * 2) * 3 * T, 4);
      if (b.phase === 2 && b.t > 0.5 * (b.shots + 1) && b.shots < 3) {
        b.shots++;
        const a = Math.atan2(pcy - b.y, pcx - b.x);
        for (const da of [-0.25, 0, 0.25]) g.projectiles.push({ x: b.x, y: b.y, vx: Math.cos(a + da) * 115, vy: Math.sin(a + da) * 115, t: 4 });
        g.audio.sfx('bubble');
      }
      if (b.t > (b.phase === 2 ? 1.8 : 2.4)) {
        b.state = 'aim'; b.t = 0; b.shots = 0;
        b.dir = pcx < mid ? -1 : 1; // 從玩家另一側衝過來
        b.aimY = Math.max(A.y0 + 8, Math.min(A.y1 - 8, pcy));
      }
      break;
    }
    case 'aim':
      goto(b.dir < 0 ? A.x1 : A.x0, b.aimY, 5);
      b.aimY += (Math.max(A.y0 + 8, Math.min(A.y1 - 8, pcy)) - b.aimY) * Math.min(1, 2 * dt);
      if (b.t > (b.phase === 2 ? 0.7 : 0.95)) { b.state = 'lunge'; b.t = 0; g.audio.sfx('lunge'); }
      break;
    case 'lunge':
      b.x += b.dir * (b.phase === 2 ? 360 : 290) * dt;
      if ((b.dir < 0 && b.x <= A.x0) || (b.dir > 0 && b.x >= A.x1)) {
        b.x = Math.max(A.x0, Math.min(A.x1, b.x)); b.state = 'tired'; b.t = 0; g.emit('thud', b.x, b.y);
      }
      break;
    case 'tired': b.y += Math.sin(b.t * 6) * 0.2; if (b.t > (b.phase === 2 ? 1.5 : 1.9)) { b.state = 'swim'; b.t = 0; } break;
    case 'hurt': goto(mid, 6 * T, 1.5); if (b.t > 0.8) { b.state = 'swim'; b.t = 0; } break;
    case 'dying': b.y += 30 * dt; if (b.t > 2.2) { b.state = 'dead'; g.bossDefeated(); } break;
  }
  b.trail.unshift({ x: b.x, y: b.y }); b.trail.length = 60;

  // 第 2 階段：強制改變潮汐
  if (b.phase === 2 && b.state !== 'dying' && b.state !== 'dead') {
    b.tideTimer -= dt;
    if (b.tideTimer <= 0) { b.tideTimer = 5; g.toggleTide(true); }
  }
  // 接觸傷害（力竭時頭部無害）
  if (['swim', 'aim', 'lunge', 'emerge'].includes(b.state) && p.dashT <= 0) {
    if (overlap(p, bossHead(b))) hurtPlayer(g, b.x);
    else for (const s of bossSegments(b)) if (overlap(p, { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 })) { hurtPlayer(g, s.x); break; }
  }
}
