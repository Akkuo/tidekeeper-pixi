// 輸入抽象：KeyboardEvent.code → 動作。DOM 綁定由宿主（main.js）負責，這裡只管狀態。
export const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', KeyS: 'down', ArrowDown: 'down',
  KeyX: 'attack', KeyJ: 'attack', KeyQ: 'tide', KeyP: 'pause', Escape: 'pause',
  Enter: 'confirm', NumpadEnter: 'confirm', KeyM: 'mute', KeyR: 'restart', KeyV: 'fx', F2: 'editor',
};
// 會被 preventDefault 的額外按鍵（選關數字、編輯器用鍵）
export const EXTRA_KEYS = ['Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
  'BracketLeft', 'BracketRight', 'KeyT', 'KeyL', 'KeyN', 'KeyG', 'Tab'];

export function createInput() {
  const inp = {
    down: {}, pressed: {}, codes: [],
    press(action) { if (!inp.down[action]) inp.pressed[action] = true; inp.down[action] = true; },
    release(action) { inp.down[action] = false; },
    keyDown(code) { inp.codes.push(code); const a = KEYMAP[code]; if (a) inp.press(a); return !!a || EXTRA_KEYS.includes(code); },
    keyUp(code) { const a = KEYMAP[code]; if (a) inp.release(a); },
    releaseAll() { inp.down = {}; },
    endStep() { inp.pressed = {}; inp.codes.length = 0; },
  };
  return inp;
}
