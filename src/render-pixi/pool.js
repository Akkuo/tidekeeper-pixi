// Sprite Pooling：兩種用法
// 1) 逐幀池（frame pool）：每幀 begin() 後依繪製順序 acquire()，end() 把沒用到的隱藏；物件永不銷毀，z 順序＝取用順序。
// 2) 回收池（free-list pool）：粒子／泡泡／碎片這類有壽命的物件，死亡時 release() 回收重用。
import { Sprite, Text } from 'pixi.js';

export function framePool(parent, create = () => new Sprite()) {
  const items = [];
  let used = 0;
  return {
    begin() { used = 0; },
    acquire() {
      let s = items[used];
      if (!s) { s = create(); items.push(s); parent.addChild(s); }
      used++; s.visible = true;
      return s;
    },
    end() { for (let i = used; i < items.length; i++) items[i].visible = false; },
    get active() { return used; },
    get size() { return items.length; },
  };
}

export function freePool(parent, create = () => new Sprite()) {
  const free = [];
  let total = 0, active = 0;
  return {
    acquire() {
      let s = free.pop();
      if (!s) { s = create(); parent.addChild(s); total++; }
      s.visible = true; active++;
      return s;
    },
    release(s) { s.visible = false; free.push(s); active--; },
    get active() { return active; },
    get size() { return total; },
  };
}

// 文字逐幀池：同一個槽位的字串／樣式沒變就不重新點陣化
export function textPool(parent, fontFamily) {
  const pool = framePool(parent, () => { const t = new Text({ text: '', style: { fontFamily } }); t._key = ''; return t; });
  return {
    begin: pool.begin, end: pool.end,
    get active() { return pool.active; }, get size() { return pool.size; },
    acquire(str, size, color, weight, shadow) {
      const t = pool.acquire();
      size = Math.round(size * 2) / 2;
      const key = `${size}|${color}|${weight}|${shadow}`;
      if (t._key !== key) {
        t._key = key;
        t.style = {
          fontFamily, fontSize: size, fontWeight: String(weight), fill: color,
          dropShadow: shadow ? { color: '#000a19', alpha: 0.6, blur: 0, angle: Math.PI / 4, distance: Math.max(1, size / 14) * 1.41 } : false,
        };
      }
      if (t.text !== str) t.text = str;
      return t;
    },
  };
}
