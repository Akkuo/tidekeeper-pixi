// 觸控控制（DOM）：左側虛擬搖桿、右側 跳／刺／潮 按鈕、暫停鈕、直式提示
export function setupTouch(game, audio) {
  const root = document.getElementById('touch');
  const inp = game.input;
  const hint = document.getElementById('rotate');
  let shown = false;
  const show = () => { if (shown) return; shown = true; root.hidden = false; portraitHint(); };
  if (matchMedia('(pointer: coarse)').matches) show();
  addEventListener('touchstart', show, { passive: true, once: true });

  const stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
  let sid = null;
  const setDir = (dx, dy) => {
    const k = 0.3;
    dx < -k ? inp.press('left') : inp.release('left');
    dx > k ? inp.press('right') : inp.release('right');
    dy > 0.55 ? inp.press('down') : inp.release('down');
  };
  const moveStick = e => {
    const r = stick.getBoundingClientRect(), rad = r.width / 2;
    let dx = (e.clientX - r.left - rad) / rad, dy = (e.clientY - r.top - rad) / rad;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    knob.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
    setDir(dx, dy);
  };
  stick.addEventListener('pointerdown', e => { audio.unlock(); sid = e.pointerId; stick.setPointerCapture(sid); moveStick(e); e.preventDefault(); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === sid) moveStick(e); });
  const endStick = e => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; setDir(0, 0); };
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

  for (const btn of root.querySelectorAll('[data-act]')) {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', e => {
      audio.unlock(); btn.setPointerCapture(e.pointerId); btn.classList.add('on'); e.preventDefault();
      // 標題／結算畫面上，跳躍鈕也當確認
      if (act === 'jump' && game.scene !== 'playing') inp.pressed.confirm = true;
      inp.press(act);
    });
    const up = () => { btn.classList.remove('on'); inp.release(act); };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up);
  }

  function portraitHint() {
    if (!shown || innerWidth >= innerHeight) { hint.hidden = true; return; }
    hint.hidden = false; clearTimeout(portraitHint.t); portraitHint.t = setTimeout(() => { hint.hidden = true; }, 4000);
  }
  addEventListener('resize', portraitHint);
}
