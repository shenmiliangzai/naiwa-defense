const byId = id => document.getElementById(id);
const action = byId('action');
const sound = byId('sound');
const stage = byId('stage');
const laugh = byId('laugh');
const fail = byId('fail');
const celebration = byId('celebration');
const laughGif = '素材/奶蛙-捧腹大笑.gif';
const failGif = '素材/凑企鹅-高松灯二创-咕咕嘎嘎.gif';
for (const src of [laughGif, failGif]) {
  const preloadGif = new Image();
  preloadGif.src = src;
}
const target = .92;
document.documentElement.style.setProperty('--target', target * 100 + '%');
byId('target-hint').textContent = '绿区 ' + target * 100 + '%–99%';
let duration = 0;
let state = 'ready';
let started = 0;
let frame = 0;
let muted = false;
let revealTimer = 0;
let audioContext;
let record = 0;
try { record = Number(localStorage.getItem('naiwa-best')) || 0; } catch {}
byId('result').textContent = '最高分 ' + record;

function paint(pressure) {
  const percent = pressure * 100;
  byId('fill').style.width = percent + '%';
  byId('needle').style.left = 'calc(' + percent + '% - 2px)';
  byId('frog').style.setProperty('--sx', 1 + pressure * .51);
  byId('frog').style.setProperty('--sy', 1 + pressure * .27);
  const pumpCycles = 3 * pressure + 5 * pressure ** 2;
  const stroke = 24 * Math.sin(Math.PI * pumpCycles) ** 2;
  stage.style.setProperty('--stroke', stroke + 'px');
}

function playBurst() {
  playTone(180, 45, .2, .38);
}

function playTone(from, to, duration, volume) {
  if (muted || !audioContext) return;
  const now = audioContext.currentTime;
  const thump = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(from, now);
  thump.frequency.exponentialRampToValueAtTime(to, now + duration * .8);
  envelope.gain.setValueAtTime(volume, now);
  envelope.gain.exponentialRampToValueAtTime(.001, now + duration);
  thump.connect(envelope).connect(audioContext.destination);
  thump.start(now);
  thump.stop(now + duration);
}

function showResult(won) {
  const animation = document.createElement('img');
  animation.className = 'result-clip';
  animation.alt = '';
  animation.draggable = false;
  animation.src = won ? laughGif : failGif;
  if (won && levelId === 'pump') showPumpWin(animation);
  else celebration.replaceChildren(animation);
  const clip = won ? laugh : fail;
  clip.muted = muted;
  clip.currentTime = 0;
  clip.play().catch(() => {});
}

function finish(pressure, passed = pressure >= roundTarget() && pressure < 1, outcome = '') {
  if (state !== 'playing') return;
  cancelAnimationFrame(frame);
  const won = passed;
  state = won ? 'won' : 'lost';
  stage.dataset.state = state;
  const score = Math.floor(pressure * 100);
  if (won && levelId === 'timing' && score > record) {
    record = score;
    try { localStorage.setItem('naiwa-best', record); } catch {}
  }
  const message = won ? '放气成功 · ' + score + ' 分' :
    pressure >= 1 ? '噗！撑爆了' : '放早了 · ' + score + '%';
  const earned = awardCoins(won);
  byId('result').textContent = (outcome || message) + (levelId === 'timing' ? '｜最高分 ' + record : '') + (earned ? '｜+' + earned + ' 金币' : '');
  action.textContent = levelId === 'hold' ? '按住再来' : '再来一局';
  if (won) showResult(true);
  else {
    playBurst();
    revealTimer = setTimeout(() => showResult(false), 460);
  }
}

function tick(now) {
  if (state !== 'playing') return;
  const pressure = Math.min(1, (now - started) / duration);
  paint(pressure);
  if (pressure === 1) finish(pressure);
  else frame = requestAnimationFrame(tick);
}

function unlockAudio() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (AudioEngine && !audioContext) audioContext = new AudioEngine();
  if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
}

function resetRound() {
  cancelAnimationFrame(frame);
  clearTimeout(revealTimer);
  if (stage.dataset.mode === 'defense') {
    clearDefenseEnemies();
    stopDefenseSounds();
  }
  laugh.pause();
  fail.pause();
  celebration.replaceChildren();
  paint(0);
  state = 'ready';
  stage.dataset.state = state;
}

function startRound(label, message) {
  unlockAudio();
  resetRound();
  // Prime the failure clip while handling the player's gesture.
  fail.muted = true;
  fail.play().then(() => {
    if (state === 'playing') {
      fail.pause();
      fail.currentTime = 0;
      fail.muted = muted;
    }
  }).catch(() => {});
  state = 'playing';
  stage.dataset.state = state;
  byId('result').textContent = message;
  action.textContent = label;
  started = performance.now();
}

let levelId = 'timing';
action.addEventListener('click', () => {
  if (levelId !== 'timing') return;
  if (state === 'playing') {
    const pressure = Math.min(1, (performance.now() - started) / duration);
    paint(pressure);
    finish(pressure);
    return;
  }
  startRound('放气！', '等绿区……');
  duration = 2400 + Math.random() * 2100;
  frame = requestAnimationFrame(tick);
});

sound.addEventListener('click', () => {
  muted = !muted;
  laugh.muted = fail.muted = muted;
  if (muted) stopDefenseSounds();
  else if (levelId === 'defense') {
    unlockAudio();
    loadBattleAudio();
  }
  sound.textContent = muted ? '开声音' : '静音';
  sound.setAttribute('aria-pressed', String(muted));
});

document.addEventListener('keydown', event => {
  if (byId('level-home').open || byId('shop').open || byId('defense-story').open || event.key === ' ' && action.hidden) return;
  if (levelId === 'hold') return;
  if (event.code !== 'Space' || event.target.closest('button')) return;
  event.preventDefault();
  if (!event.repeat) action.click();
});
