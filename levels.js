const modes = {
  timing: ['奶蛙禁止膨胀', '等指针进绿区，再让凑企鹅放气。', '开始膨胀'],
  pump: ['凑企鹅狂按打气', '倒计时内把气量打满 16 格。停手太久，奶蛙就会漏气。', '开始打气'],
  hold: ['奶蛙憋住别松', '按住让奶蛙膨胀，指针进绿区时松手。', '按住蓄力'],
  sort: ['谁的夜宵', '牛奶给奶蛙，小鱼给凑企鹅。连续分对 8 份。', '开始分夜宵'],
  sneak: ['别吵醒凑企鹅', '趁凑企鹅闭眼走 6 步，睁眼时别动。', '开始潜行'],
  memory: ['奶蛙跟拍', '先看奶蛙的动作，再照顺序按。连续通过三轮。', '看奶蛙表演'],
  endless: ['无尽夜宵', '牛奶给奶蛙，小鱼给凑企鹅。每分对一份得 1 分，分错或超时结束。', '开始挑战'],
  rhythm: ['蛙企鹅拍', '音符落到虚线时点对应按钮。越精准分越高，失误才结束。', '开始接拍'],
  defense: ['奶蛙守家', '拖动奶蛙左右移动，奶弹自动发射。击败强化企鹅选能力，守到家门被突破。', '开始守家'],
};
const levelButtons = [...document.querySelectorAll('[data-level]')];
const levelHome = byId('level-home');
let air = 0;
let lastPump = 0;
let holdInput = null;
const pumpDialog = byId('pump-win');
const pumpReplay = byId('pump-replay');
let replayTimer;

function showPumpWin(animation) {
  animation.className = '';
  byId('pump-win-animation').replaceChildren(animation);
  byId('pump-win-reward').textContent = byId('result').textContent;
  pumpReplay.disabled = true;
  pumpDialog.showModal();
  replayTimer = setTimeout(() => { pumpReplay.disabled = false; }, 650);
}

pumpDialog.addEventListener('cancel', event => event.preventDefault());
pumpReplay.addEventListener('click', () => {
  if (pumpReplay.disabled) return;
  clearTimeout(replayTimer);
  pumpDialog.close();
  byId('pump-win-animation').replaceChildren();
  resetRound();
  action.textContent = modes.pump[2];
  byId('result').textContent = '准备好了';
  action.focus();
});

for (const button of levelButtons) {
  button.addEventListener('click', () => {
    levelHome.close();
    resetRound();
    resetChallenge();
    holdInput = null;
    levelId = button.dataset.level;
    stage.dataset.mode = levelId;
    if (levelId === 'sneak') paintRoad(0);
    for (const entry of levelButtons) {
      entry.setAttribute('aria-pressed', String(entry === button));
    }
    const [title, instructions, label] = modes[levelId];
    byId('title').textContent = title;
    byId('instructions').textContent = instructions;
    action.textContent = label;
    byId('result').textContent = levelId === 'defense' ? '家门 ' + defenseLives() + ' 点耐久｜最高分 ' + defenseBest :
      levelId === 'timing' ? '最高分 ' + record :
      levelId === 'endless' ? '最高分 ' + endlessRecord :
      levelId === 'rhythm' ? '最高分 ' + rhythmRecord : '准备好了';
    refreshBoostHint();
    action.focus();
  });
}

function pumpTick(now) {
  if (state !== 'playing' || levelId !== 'pump') return;
  const remaining = pumpLimit() - (now - started);
  const effectiveAir = Math.max(0, air - Math.max(0, now - lastPump - 360) / 260);
  paint(effectiveAir / 16);
  if (remaining <= 0) {
    finish(effectiveAir / 16, false, '时间到 · 奶蛙漏气了');
    return;
  }
  byId('result').textContent = '剩 ' + (remaining / 1000).toFixed(1) + ' 秒 · ' + Math.floor(effectiveAir) + ' / 16';
  frame = requestAnimationFrame(pumpTick);
}

action.addEventListener('click', () => {
  if (levelId !== 'pump') return;
  if (state !== 'playing') {
    if (pumpDialog.open) return;
    startRound('快按打气！', '剩 ' + (pumpLimit() / 1000).toFixed(1) + ' 秒 · 0 / 16');
    playTone(360, 150, .065, .16);
    air = 0;
    lastPump = started;
    frame = requestAnimationFrame(pumpTick);
    return;
  }
  const now = performance.now();
  if (now - started >= pumpLimit()) return;
  playTone(360, 150, .065, .16);
  air = Math.max(0, air - Math.max(0, now - lastPump - 360) / 260) + 1;
  lastPump = now;
  if (air >= 16) finish(1, true, '打气成功 · 16 下');
});

function beginHold(input) {
  if (levelHome.open || byId('shop').open || levelId !== 'hold' || holdInput !== null || state === 'playing') return;
  holdInput = input;
  startRound('进绿区就松手', '正在蓄力……');
  duration = 1800 + Math.random() * 1100;
  frame = requestAnimationFrame(tick);
}

function releaseHold(input, cancelled = false) {
  if (holdInput !== input) return;
  holdInput = null;
  if (state !== 'playing') return;
  if (cancelled) {
    resetRound();
    action.textContent = modes.hold[2];
    byId('result').textContent = '蓄力已取消';
    return;
  }
  const pressure = Math.min(1, (performance.now() - started) / duration);
  paint(pressure);
  finish(pressure);
}

action.addEventListener('pointerdown', event => {
  if (levelId !== 'hold' || event.button !== 0 || holdInput !== null) return;
  action.setPointerCapture(event.pointerId);
  beginHold(event.pointerId);
});
action.addEventListener('pointerup', event => releaseHold(event.pointerId));
action.addEventListener('pointercancel', event => releaseHold(event.pointerId, true));
action.addEventListener('lostpointercapture', event => releaseHold(event.pointerId, true));
document.addEventListener('keydown', event => {
  if (levelId !== 'hold' || event.code !== 'Space' || (event.target.closest('button') && event.target !== action)) return;
  event.preventDefault();
  if (!event.repeat) beginHold('space');
});
document.addEventListener('keyup', event => {
  if (levelId === 'hold' && event.code === 'Space' && holdInput === 'space') {
    event.preventDefault();
    releaseHold('space');
  }
});
window.addEventListener('blur', () => releaseHold('space', true));
