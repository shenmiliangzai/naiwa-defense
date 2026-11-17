const battlefield = byId('defense-board');
const fieldActors = byId('defense-actors');
const shooter = byId('defense-shooter');
const upgrades = byId('defense-upgrades');
const initialFireInterval = .34;
const penguinCry = new Audio('素材/凑企鹅糖哭.wav');
const eliteDefeat = new Audio('素材/cnmd.wav');
penguinCry.preload = 'auto';
penguinCry.volume = .55;
eliteDefeat.preload = 'auto';
eliteDefeat.volume = .55;
const activeCries = new Map();
const cryPool = [penguinCry];
const maxCryVoices = 8;
let dragPointer = null;
let defenseBest = 0;
try { defenseBest = Number(localStorage.getItem('naiwa-defense-best')) || 0; } catch {}

const defense = {
  enemies: [], shots: [], keys: new Set(), x: 50, time: 0, last: 0,
  wave: 1, score: 0, kills: 0, lives: 3, maxLives: 3, damage: 1,
  rate: initialFireInterval, paths: 1, pierce: false, nextShot: 0, nextEnemy: .5,
  ranks: {},
  nextElite: 20, eliteIndex: 0, pending: 0,
  round: 0, reviveUsed: false, rewardPaid: 0,
};
const eliteTypes = ['armor', 'dash', 'sway'];
const eliteNames = {armor: '铁桶', dash: '冲刺', sway: '摇摆'};

function balanceCries() {
  const volume = .55 / Math.pow(Math.max(1, activeCries.size), .75);
  for (const voice of activeCries.keys()) voice.volume = volume;
}

function stopCryVoice(voice) {
  clearTimeout(activeCries.get(voice));
  activeCries.delete(voice);
  voice.pause();
  balanceCries();
}

function stopPenguinCry() {
  for (const voice of activeCries.keys()) stopCryVoice(voice);
  penguinCry.pause();
}

function stopDefenseSounds() {
  stopPenguinCry();
  eliteDefeat.pause();
}

function playEliteSound() {
  if (muted) return;
  eliteDefeat.currentTime = 0;
  eliteDefeat.play().catch(() => {});
}

function playPenguinCry() {
  if (muted) return;
  let voice = cryPool.find(clip => !activeCries.has(clip));
  if (!voice && cryPool.length < maxCryVoices) {
    voice = penguinCry.cloneNode();
    voice.muted = false;
    cryPool.push(voice);
  }
  if (!voice) {
    voice = activeCries.keys().next().value;
    stopCryVoice(voice);
  }
  voice.muted = false;
  voice.currentTime = 0;
  const timer = setTimeout(() => stopCryVoice(voice), 1650);
  activeCries.set(voice, timer);
  balanceCries();
  voice.play().catch(() => {
    if (activeCries.get(voice) === timer) stopCryVoice(voice);
  });
}

function defenseLives() { return boosted('gate') ? 5 : 3; }

function combatPower() {
  const firepower = defense.damage * (initialFireInterval / defense.rate);
  const coverage = 1 + .45 * (defense.paths - 1);
  const pierce = defense.pierce ? 1.2 : 1;
  const durability = 1 + .08 * (defense.maxLives - 3);
  return Math.round(100 * firepower * coverage * pierce * durability);
}

function enemyStats(type) {
  const waveGrowth = defense.wave - 1;
  // A square root lets upgrades stay useful while enemies scale with the build.
  const pressure = Math.max(0, Math.sqrt(combatPower() / 100) - 1);
  const baseHp = type === 'normal' ? 1 + Math.floor(waveGrowth / 4) :
    (type === 'armor' ? 9 : 5) + Math.floor(waveGrowth * 1.5);
  const extraHp = type === 'normal' ? Math.floor(pressure * 1.2) : Math.floor(pressure * 3);
  return {hp: baseHp + extraHp, speed: Math.min(32, 13 + defense.wave * 1.8) *
    (1 + Math.min(.25, pressure * .045))};
}

function clearDefenseEnemies() {
  fieldActors.replaceChildren();
  defense.enemies = [];
  defense.shots = [];
  defense.keys.clear();
  endDefenseDrag();
  battlefield.classList.remove('upgrade-paused');
  if (upgrades.open) upgrades.close();
}

function placeActor(actor) {
  actor.element.style.left = actor.x + '%';
  actor.element.style.top = actor.y + '%';
}

function positionShooter(x) {
  defense.x = Math.max(6, Math.min(94, x));
  shooter.style.left = defense.x + '%';
}

function spawnEnemy(type) {
  const element = document.createElement('div');
  element.className = 'invader ' + type;
  element.innerHTML = '<span class="invader-body"></span><i></i><i></i>';
  const {hp, speed} = enemyStats(type);
  const x = 8 + Math.random() * 84;
  const enemy = {element, type, hp, speed, x, origin: x, y: 8, born: defense.time};
  if (type !== 'normal' || hp > 1) {
    const badge = document.createElement('b');
    badge.textContent = type === 'normal' ? hp : eliteNames[type] + ' ' + hp;
    element.append(badge);
    enemy.badge = badge;
  }
  placeActor(enemy);
  fieldActors.append(element);
  defense.enemies.push(enemy);
}

function fireMilk() {
  const offsets = Array.from({length: defense.paths}, (_, index) => (index - (defense.paths - 1) / 2) * 7);
  for (const offset of offsets) {
    const element = document.createElement('span');
    element.className = 'milk-shot';
    const shot = {element, x: defense.x + offset, y: 79, damage: defense.damage,
      hits: new Set(), remaining: defense.pierce ? 2 : 1};
    placeActor(shot);
    fieldActors.append(element);
    defense.shots.push(shot);
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  shooter.animate([
    {transform: 'translateX(-50%) scale(1)'},
    {transform: 'translateX(-50%) scale(1.12,.86)', offset: .28},
    {transform: 'translateX(-50%) scale(1)'},
  ], {duration: 170});
}

function milkSplash(x, y) {
  const splash = document.createElement('span');
  splash.className = 'milk-splash';
  placeActor({element: splash, x, y});
  fieldActors.append(splash);
  splash.addEventListener('animationend', () => splash.remove(), {once: true});
}

const abilities = [
  {id: 'rate', name: '快手奶蛙', detail: '发射间隔缩短 20%', available: () => defense.ranks.rate < 3,
    apply: () => { defense.rate *= .8; }},
  {id: 'damage', name: '浓缩奶弹', detail: '每发伤害 +1，可无限升级', available: () => true,
    apply: () => { defense.damage += 1; }},
  {id: 'paths', name: '增加弹道', detail: '每次多发一枚平行奶弹，最多 3 枚', available: () => defense.paths < 3,
    apply: () => { defense.paths += 1; }},
  {id: 'pierce', name: '穿透奶弹', detail: '奶弹可多命中一只企鹅', available: () => !defense.pierce,
    apply: () => { defense.pierce = true; }},
  {id: 'repair', name: '修补家门', detail: '恢复 1 点耐久', available: () => defense.lives < defense.maxLives,
    apply: () => { defense.lives += 1; }},
  {id: 'fence', name: '加固栅栏', detail: '耐久上限和当前耐久各 +1', available: () => defense.ranks.fence < 5,
    apply: () => { defense.maxLives += 1; defense.lives += 1; }},
  {id: 'sweep', name: '清场奶浪', detail: '击退当前场上的普通企鹅', available: () => true,
    apply: () => {
      for (const enemy of defense.enemies.slice()) {
        if (enemy.type === 'normal') defeatEnemy(enemy);
      }
    }},
];

function offerUpgrade() {
  battlefield.classList.add('upgrade-paused');
  defense.keys.clear();
  endDefenseDrag();
  const options = byId('defense-cards');
  options.replaceChildren();
  const eligible = abilities.filter(card => card.available());
  const choices = Math.min(3, eligible.length);
  for (let i = 0; i < choices; i++) {
    const [card] = eligible.splice(Math.floor(Math.random() * eligible.length), 1);
    const button = document.createElement('button');
    const title = document.createElement('strong');
    const detail = document.createElement('span');
    title.textContent = card.name;
    detail.textContent = card.detail;
    button.type = 'button';
    button.append(title, detail);
    button.addEventListener('click', () => {
      if (!upgrades.open) return;
      card.apply();
      defense.ranks[card.id] += 1;
      showDefenseRanks();
      defense.pending -= 1;
      defenseStatus();
      if (defense.pending > 0) return offerUpgrade();
      upgrades.close();
      battlefield.classList.remove('upgrade-paused');
      defense.last = performance.now();
      frame = requestAnimationFrame(defenseTick);
    });
    options.append(button);
  }
  if (!upgrades.open) upgrades.showModal();
}

function defeatEnemy(enemy) {
  milkSplash(enemy.x, enemy.y);
  enemy.element.remove();
  defense.enemies = defense.enemies.filter(entry => entry !== enemy);
  defense.kills += 1;
  if (enemy.type === 'normal') playPenguinCry();
  else playEliteSound();
  defense.score += enemy.type === 'normal' ? 10 : 50;
  if (enemy.type !== 'normal') defense.pending += 1;
}

function moveShots(dt) {
  defense.shots = defense.shots.filter(shot => {
    const previousY = shot.y;
    shot.y -= 105 * dt;
    for (const enemy of defense.enemies.slice().sort((a, b) => b.y - a.y)) {
      if (shot.hits.has(enemy) || Math.abs(enemy.x - shot.x) > 5 ||
          shot.y > enemy.y + 4 || previousY < enemy.y - 4) continue;
      shot.hits.add(enemy);
      shot.remaining -= 1;
      enemy.hp -= shot.damage;
      if (enemy.hp <= 0) defeatEnemy(enemy);
      else {
        milkSplash(enemy.x, enemy.y);
        if (enemy.badge) enemy.badge.textContent = enemy.type === 'normal' ? enemy.hp : eliteNames[enemy.type] + ' ' + enemy.hp;
      }
      if (!shot.remaining) break;
    }
    if (shot.remaining && shot.y > -5 && shot.x > -5 && shot.x < 105) {
      placeActor(shot);
      return true;
    }
    shot.element.remove();
    return false;
  });
}

function defenseStatus() {
  byId('result').textContent = '第 ' + defense.wave + ' 波 · 家门 ' + defense.lives + '/' + defense.maxLives +
    ' · ' + defense.score + ' 分 · ' + Math.floor(defense.time) + ' 秒';
  byId('fill').style.width = Math.max(0, defense.lives / defense.maxLives * 100) + '%';
}

function showDefenseRanks() {
  byId('defense-power').textContent = combatPower();
  for (const [id, rank] of Object.entries(defense.ranks)) {
    const level = id === 'paths' ? defense.paths : rank;
    byId('defense-' + id).textContent = 'Lv.' + level;
  }
}

function finishDefense() {
  clearDefenseEnemies();
  action.hidden = false;
  if (defense.score > defenseBest) {
    defenseBest = defense.score;
    try { localStorage.setItem('naiwa-defense-best', defenseBest); } catch {}
  }
  finish(0, false, '第 ' + defense.wave + ' 波 · 坚持 ' + Math.floor(defense.time) + ' 秒 · 击退 ' +
    defense.kills + ' 只 · ' + defense.score + ' 分｜最高 ' + defenseBest);
}

function reviveDefense(round) {
  if (levelId !== 'defense' || state !== 'lost' || defense.round !== round || defense.reviveUsed) return false;
  defense.reviveUsed = true;
  resetRound();
  defense.lives = Math.min(2, defense.maxLives);
  defense.pending = 0;
  defense.nextEnemy = Math.max(defense.nextEnemy, defense.time + 1.4);
  defense.nextElite = Math.max(defense.nextElite, defense.time + 2);
  defense.nextShot = defense.time;
  defense.last = performance.now();
  state = 'playing';
  stage.dataset.state = state;
  action.hidden = true;
  battlefield.focus();
  defenseStatus();
  frame = requestAnimationFrame(defenseTick);
  return true;
}

function defenseTick(now) {
  if (state !== 'playing' || levelId !== 'defense' || upgrades.open) return;
  const dt = Math.min(.05, Math.max(0, (now - defense.last) / 1000));
  defense.last = now;
  defense.time += dt;
  const wave = 1 + Math.floor(defense.time / 18);
  if (wave > defense.wave) {
    defense.score += (wave - defense.wave) * 30;
    defense.wave = wave;
  }
  const direction = Number(defense.keys.has('ArrowRight')) - Number(defense.keys.has('ArrowLeft'));
  if (direction) positionShooter(defense.x + direction * dt * 72);
  if (defense.time >= defense.nextEnemy) {
    spawnEnemy('normal');
    defense.nextEnemy = defense.time + Math.max(.23, .80 - (wave - 1) * .09);
  }
  if (defense.time >= defense.nextElite) {
    spawnEnemy(eliteTypes[defense.eliteIndex++ % eliteTypes.length]);
    defense.nextElite = defense.time + Math.max(6.5, 13 - wave * .65);
  }
  if (defense.time >= defense.nextShot) {
    fireMilk();
    defense.nextShot = defense.time + defense.rate;
  }
  for (const enemy of defense.enemies) {
    const age = defense.time - enemy.born;
    const sprinting = enemy.type === 'dash' && age >= 1.05;
    enemy.element.classList.toggle('sprinting', sprinting);
    const speed = enemy.type === 'armor' ? .7 : enemy.type === 'dash' ? (sprinting ? 2 : .52) : 1;
    enemy.y += enemy.speed * speed * dt;
    if (enemy.type === 'sway') enemy.x = Math.max(6, Math.min(94, enemy.origin + Math.sin(age * 4) * 13));
    placeActor(enemy);
  }
  moveShots(dt);
  const livesBeforeBreach = defense.lives;
  defense.enemies = defense.enemies.filter(enemy => {
    if (enemy.y < 85) return true;
    enemy.element.remove();
    defense.lives -= 1;
    return false;
  });
  if (defense.lives < livesBeforeBreach) playEliteSound();
  defenseStatus();
  if (defense.lives <= 0) return finishDefense();
  if (defense.pending > 0) return offerUpgrade();
  frame = requestAnimationFrame(defenseTick);
}

action.addEventListener('click', () => {
  if (levelId !== 'defense' || levelHome.open || shop.open || state === 'playing') return;
  startRound('', '企鹅来了！');
  stopDefenseSounds();
  if (!muted) {
    penguinCry.muted = true;
    penguinCry.play().then(() => {
      if (!activeCries.has(penguinCry)) penguinCry.pause();
      penguinCry.muted = false;
    }).catch(() => { penguinCry.muted = false; });
    eliteDefeat.muted = true;
    eliteDefeat.play().then(() => {
      eliteDefeat.pause();
      eliteDefeat.muted = false;
    }).catch(() => { eliteDefeat.muted = false; });
  }
  const lives = defenseLives();
  Object.assign(defense, {time: 0, last: performance.now(), wave: 1, score: 0, kills: 0,
    lives, maxLives: lives, damage: boosted('cannon') ? 2 : 1, rate: initialFireInterval, paths: 1,
    pierce: false, nextShot: 0, nextEnemy: .5, nextElite: 20, eliteIndex: 0, pending: 0});
  defense.round += 1;
  defense.reviveUsed = false;
  defense.rewardPaid = 0;
  defense.ranks = Object.fromEntries(abilities.map(card => [card.id, 0]));
  showDefenseRanks();
  positionShooter(50);
  action.hidden = true;
  battlefield.focus();
  defenseStatus();
  frame = requestAnimationFrame(defenseTick);
});

function dragShooter(event) {
  const bounds = battlefield.getBoundingClientRect();
  positionShooter((event.clientX - bounds.left) / bounds.width * 100);
}

function endDefenseDrag() {
  const pointer = dragPointer;
  dragPointer = null;
  battlefield.removeAttribute('data-dragging');
  if (pointer !== null && battlefield.hasPointerCapture(pointer)) {
    battlefield.releasePointerCapture(pointer);
  }
}

for (const type of ['dragstart', 'selectstart', 'auxclick', 'contextmenu']) {
  battlefield.addEventListener(type, event => event.preventDefault());
}
battlefield.addEventListener('mousedown', event => {
  if (event.button !== 0) event.preventDefault();
});
battlefield.addEventListener('pointerdown', event => {
  if (state !== 'playing' || upgrades.open || dragPointer !== null || event.button !== 0) return;
  event.preventDefault();
  dragPointer = event.pointerId;
  battlefield.setPointerCapture(event.pointerId);
  battlefield.setAttribute('data-dragging', '');
  dragShooter(event);
});
battlefield.addEventListener('pointermove', event => {
  if (event.pointerId !== dragPointer) return;
  if (event.pointerType === 'mouse' && !(event.buttons & 1)) return endDefenseDrag();
  event.preventDefault();
  dragShooter(event);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  battlefield.addEventListener(type, event => {
    if (event.pointerId === dragPointer) endDefenseDrag();
  });
}
document.addEventListener('keydown', event => {
  if (levelId !== 'defense' || state !== 'playing' || upgrades.open ||
      !['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
  event.preventDefault();
  defense.keys.add(event.code);
});
document.addEventListener('keyup', event => defense.keys.delete(event.code));
window.addEventListener('blur', () => {
  defense.keys.clear();
  endDefenseDrag();
});
upgrades.addEventListener('cancel', event => event.preventDefault());

document.querySelector('[data-level="defense"]').click();
