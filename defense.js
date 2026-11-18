const battlefield = byId('defense-board');
const fieldActors = byId('defense-actors');
const shooter = byId('defense-shooter');
const upgrades = byId('defense-upgrades');
const defenseStory = byId('defense-story');
let defenseStorySeen = false;
const initialFireInterval = .34;
const penguinCry = new Audio('素材/凑企鹅糖哭.wav');
const eliteDefeat = new Audio('素材/cnmd.wav');
const battleLaugh = new Audio('素材/奶蛙-捧腹大笑-桌宠版.wav');
const battleLaughDuration = 2.2;
battleLaugh.volume = .45;
let battleLaughTimer;
penguinCry.preload = 'auto';
penguinCry.volume = .55;
eliteDefeat.preload = 'auto';
eliteDefeat.volume = .55;
const activeCries = new Map();
const cryPool = [penguinCry];
const maxCryVoices = 8;
const battleBuffers = new Map();
const battleLoading = new Set();
const battleVoices = new Map();
const fence = battlefield.querySelector('.yard-fence');
const defenseMeter = document.querySelector('.meter');
const milestoneProgress = byId('defense-milestone-progress');
const milestoneText = byId('defense-milestone-text');
milestoneProgress.max = defenseMilestoneSeconds;
let breachTimer;
let dragPointer = null;
let dragOrigin;
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
  clearTimeout(battleLaughTimer);
  battleLaugh.pause();
  for (const source of battleVoices.keys()) source.stop();
  battleVoices.clear();
}

function loadBattleAudio() {
  if (!audioContext || location.protocol === 'file:') return;
  for (const clip of [penguinCry, eliteDefeat, battleLaugh]) {
    if (battleBuffers.has(clip) || battleLoading.has(clip)) continue;
    battleLoading.add(clip);
    fetch(clip.src).then(response => {
      if (!response.ok) throw new Error('Battle audio unavailable');
      return response.arrayBuffer();
    }).then(bytes => audioContext.decodeAudioData(bytes))
      .then(buffer => battleBuffers.set(clip, buffer))
      .catch(() => {})
      .finally(() => battleLoading.delete(clip));
  }
}

function balanceBattleAudio() {
  const volume = .55 / Math.pow(Math.max(1, battleVoices.size), .75);
  for (const {gain} of battleVoices.values()) gain.gain.value = volume;
}

function playBattleBuffer(clip, duration) {
  const buffer = battleBuffers.get(clip);
  if (!buffer || audioContext.state !== 'running') return false;
  for (const [source, voice] of battleVoices) {
    if (voice.clip === clip && clip === eliteDefeat) {
      battleVoices.delete(source);
      source.stop();
    }
  }
  if (battleVoices.size >= maxCryVoices) {
    const oldest = battleVoices.keys().next().value;
    battleVoices.delete(oldest);
    oldest.stop();
  }
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  source.connect(gain).connect(audioContext.destination);
  battleVoices.set(source, {clip, gain});
  source.onended = () => {
    battleVoices.delete(source);
    source.disconnect();
    gain.disconnect();
    balanceBattleAudio();
  };
  balanceBattleAudio();
  source.start(0, 0, Math.min(duration, buffer.duration));
  return true;
}

function playEliteSound() {
  if (muted) return;
  if (playBattleBuffer(eliteDefeat, Infinity)) return;
  eliteDefeat.currentTime = 0;
  eliteDefeat.play().catch(() => {});
}

function playPenguinCry() {
  if (muted) return;
  if (playBattleBuffer(penguinCry, 1.65)) return;
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
  clearTimeout(breachTimer);
  fence.classList.remove('breached');
  defenseMeter.classList.remove('breached');
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
    if (type !== 'normal') {
      const health = document.createElement('progress');
      health.className = 'elite-health';
      health.max = health.value = hp;
      badge.append(health);
      enemy.health = health;
      enemy.badgeLabel = badge.firstChild;
    }
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
    if (defense.damage > 1) element.classList.add('charged-shot');
    if (defense.pierce) element.classList.add('piercing-shot');
    const shot = {element, x: defense.x + offset, y: 79, damage: defense.damage,
      hits: new Set(), remaining: defense.pierce ? 2 : 1};
    placeActor(shot);
    fieldActors.append(element);
    defense.shots.push(shot);
  }
  if (defense.ranks.rate > 0) showBattlePop(defense.x, 79, '', 'rapid-flash');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  shooter.animate([
    {transform: 'translateX(-50%) scale(1)'},
    {transform: 'translateX(-50%) scale(1.12,.86)', offset: .28},
    {transform: 'translateX(-50%) scale(1)'},
  ], {duration: 170});
}

function milkSplash(x, y, defeated = false) {
  const splash = document.createElement('span');
  splash.className = defeated ? 'milk-splash defeat-splash' : 'milk-splash';
  placeActor({element: splash, x, y});
  fieldActors.append(splash);
  splash.addEventListener('animationend', () => splash.remove(), {once: true});
}

function showBattlePop(x, y, label, className = '') {
  const element = document.createElement('span');
  element.className = 'defense-pop ' + className;
  element.textContent = label;
  placeActor({element, x: Math.max(12, Math.min(88, x)), y});
  fieldActors.append(element);
  element.addEventListener('animationend', () => element.remove(), {once: true});
}

function flashBreach() {
  fence.classList.add('breached');
  defenseMeter.classList.add('breached');
  clearTimeout(breachTimer);
  breachTimer = setTimeout(() => {
    fence.classList.remove('breached');
    defenseMeter.classList.remove('breached');
  }, 260);
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
    apply: () => {
      defense.lives += 1;
      showBattlePop(50, 87, '+1 耐久', 'repair-pop');
      showBattlePop(50, 87, '', 'gate-aura repair-aura');
    }},
  {id: 'fence', name: '加固栅栏', detail: '耐久上限和当前耐久各 +1', available: () => defense.ranks.fence < 5,
    apply: () => {
      defense.maxLives += 1;
      defense.lives += 1;
      showBattlePop(50, 87, '+1 耐久上限', 'fence-pop');
      showBattlePop(50, 87, '', 'gate-aura fence-aura');
    }},
  {id: 'sweep', name: '清场奶浪', detail: '击退当前场上的普通企鹅', available: () => true,
    apply: () => {
      showBattlePop(50, 82, '', 'sweep-wave');
      for (const enemy of defense.enemies.slice()) {
        if (enemy.type === 'normal') defeatEnemy(enemy);
      }
    }},
];

const autoSkills = [
  {id: 'laugh', name: '捧腹大笑', seconds: 12, detail: '笑声冲击波伤害前方企鹅，并减速 1 秒'},
  {id: 'bubbles', name: '奶泡连珠', seconds: 7, detail: '优先攻击离家门最近的企鹅，连发 3 枚半伤奶泡'},
  {id: 'bounce', name: '肚皮弹弹', seconds: 10, detail: '家门前有企鹅时，将它们弹退'},
];
const autoSkillState = new Map();

function skillCooldown(skill, rank) {
  return skill.seconds * (1 - .15 * (rank - 1));
}

function triggerAutoSkills() {
  for (const skill of autoSkills) {
    const entry = autoSkillState.get(skill.id);
    if (!entry || defense.time < entry.readyAt) continue;
    const enemies = defense.enemies.slice().sort((a, b) => b.y - a.y);
    if (enemies.length === 0) continue;
    if (skill.id === 'bounce' && enemies[0].y < 66) continue;
    entry.readyAt = defense.time + skillCooldown(skill, entry.rank);
    showBattlePop(defense.x, 72, skill.name, 'skill-pop');
    if (skill.id === 'laugh') {
      showBattlePop(defense.x, 77, '', 'laugh-wave');
      if (!muted && !playBattleBuffer(battleLaugh, battleLaughDuration)) {
        battleLaugh.currentTime = 0;
        battleLaugh.play().catch(() => {});
        clearTimeout(battleLaughTimer);
        battleLaughTimer = setTimeout(() => battleLaugh.pause(), battleLaughDuration * 1000);
      }
      for (const enemy of enemies) {
        enemy.slowUntil = defense.time + 1;
        damageEnemy(enemy, defense.damage);
      }
    } else if (skill.id === 'bubbles') {
      showBattlePop(defense.x, 79, '', 'bubble-ring');
      for (let i = 0; i < 3; i++) {
        launchBubble(enemies[0], i);
      }
    } else {
      showBattlePop(50, 80, '', 'bounce-wave');
      for (const enemy of enemies) {
        if (enemy.y < 66) break;
        showBattlePop(enemy.x, enemy.y, '↑', 'bounce-arrow');
        enemy.y -= 14;
        placeActor(enemy);
        milkSplash(enemy.x, enemy.y);
      }
    }
  }
}

function launchBubble(target, index) {
  const element = document.createElement('span');
  element.className = 'milk-shot skill-bubble';
  const shot = {element, target, x: defense.x + (index - 1) * 5, y: 79, damage: defense.damage / 2};
  placeActor(shot);
  fieldActors.append(element);
  defense.shots.push(shot);
}

function skillCard(skill) {
  const rank = (autoSkillState.get(skill.id)?.rank || 0) + 1;
  const cooldown = skillCooldown(skill, rank);
  return {
    ...skill, rare: true,
    detail: 'Lv.' + rank + ' · 冷却 ' + Number(cooldown.toFixed(2)) + ' 秒 · ' + skill.detail,
    apply: () => autoSkillState.set(skill.id, {rank, readyAt: defense.time + cooldown}),
  };
}

function offerUpgrade() {
  battlefield.classList.add('upgrade-paused');
  defense.keys.clear();
  endDefenseDrag();
  const options = byId('defense-cards');
  options.replaceChildren();
  const eligible = abilities.filter(card => card.available());
  const skills = autoSkills.filter(skill => (autoSkillState.get(skill.id)?.rank || 0) < 3);
  const cards = [];
  if (skills.length && Math.random() < .30) {
    cards.push(skillCard(skills[Math.floor(Math.random() * skills.length)]));
  }
  while (cards.length < 3 && eligible.length) {
    cards.push(...eligible.splice(Math.floor(Math.random() * eligible.length), 1));
  }
  for (const card of cards) {
    const button = document.createElement('button');
    const icon = document.createElement('img');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const detail = document.createElement('span');
    title.textContent = card.name;
    detail.textContent = card.detail;
    button.type = 'button';
    icon.src = '素材/技能图标/' + card.id + '.png';
    icon.alt = '';
    icon.draggable = false;
    if (card.rare) button.className = 'rare-skill-card';
    copy.append(title, detail);
    button.append(icon, copy);
    button.addEventListener('click', () => {
      if (!upgrades.open) return;
      card.apply();
      if (!card.rare) defense.ranks[card.id] += 1;
      if (['rate', 'damage', 'paths', 'pierce'].includes(card.id)) {
        showBattlePop(defense.x, 74, card.name, 'upgrade-pop');
      }
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
  const elite = enemy.type !== 'normal';
  milkSplash(enemy.x, enemy.y, elite);
  if (elite) showBattlePop(enemy.x, enemy.y, '+50');
  enemy.element.classList.add('invader-defeated');
  enemy.element.addEventListener('animationend', event => {
    if (event.target === enemy.element) enemy.element.remove();
  });
  defense.enemies = defense.enemies.filter(entry => entry !== enemy);
  defense.kills += 1;
  if (enemy.type === 'normal') playPenguinCry();
  else playEliteSound();
  defense.score += enemy.type === 'normal' ? 10 : 50;
  if (enemy.type !== 'normal') defense.pending += 1;
}

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  if (enemy.hp <= 0) return defeatEnemy(enemy);
  milkSplash(enemy.x, enemy.y);
  enemy.element.querySelector('.invader-body').animate(
    [{filter: 'brightness(2.3)'}, {filter: 'brightness(1)'}], {duration: 100});
  if (enemy.health) {
    enemy.health.value = enemy.hp;
    enemy.badgeLabel.textContent = eliteNames[enemy.type] + ' ' + enemy.hp;
  } else if (enemy.badge) enemy.badge.textContent = enemy.hp;
}

function moveShots(dt) {
  let hit = false;
  defense.shots = defense.shots.filter(shot => {
    if (shot.target) {
      if (!defense.enemies.includes(shot.target)) {
        shot.target = defense.enemies.reduce((closest, enemy) =>
          !closest || enemy.y > closest.y ? enemy : closest, null);
        if (!shot.target) {
          shot.element.remove();
          return false;
        }
      }
      const dx = shot.target.x - shot.x;
      const dy = shot.target.y - shot.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= Math.max(4, 155 * dt)) {
        showBattlePop(shot.target.x, shot.target.y, '', 'bubble-ring');
        damageEnemy(shot.target, shot.damage);
        hit = true;
        shot.element.remove();
        return false;
      }
      shot.x += dx / distance * 155 * dt;
      shot.y += dy / distance * 155 * dt;
      placeActor(shot);
      return true;
    }
    const previousY = shot.y;
    shot.y -= 105 * dt;
    for (const enemy of defense.enemies.slice().sort((a, b) => b.y - a.y)) {
      if (shot.hits.has(enemy) || Math.abs(enemy.x - shot.x) > 5 ||
          shot.y > enemy.y + 4 || previousY < enemy.y - 4) continue;
      shot.hits.add(enemy);
      shot.remaining -= 1;
      if (shot.remaining > 0) showBattlePop(enemy.x, enemy.y, '', 'pierce-glint');
      hit = true;
      damageEnemy(enemy, shot.damage);
      if (!shot.remaining) break;
    }
    if (shot.remaining && shot.y > -5 && shot.x > -5 && shot.x < 105) {
      placeActor(shot);
      return true;
    }
    shot.element.remove();
    return false;
  });
  if (hit && defense.time >= defense.nextHitSound) {
    defense.nextHitSound = defense.time + .075;
    playTone(620, 240, .055, .055);
  }
}

function defenseStatus() {
  const status = byId('result');
  const caption = '第 ' + defense.wave + ' 波 · 家门 ' + Math.max(0, defense.lives) + '/' + defense.maxLives +
    ' · ' + defense.score + ' 分 · ' + Math.floor(defense.time) + ' 秒';
  if (status.textContent !== caption) status.textContent = caption;
  byId('fill').style.width = Math.max(0, defense.lives / defense.maxLives * 100) + '%';
  milestoneProgress.value = Math.min(defenseMilestoneSeconds, Math.floor(defense.time));
  const label = defense.time >= defenseMilestoneSeconds ? '+' + defenseMilestoneCoins + ' 金币待结算' :
    '守满 ' + defenseMilestoneSeconds + ' 秒得 ' + defenseMilestoneCoins + ' 金币';
  if (milestoneText.textContent !== label) milestoneText.textContent = label;
  const skillStatus = byId('defense-skill-status');
  const timers = autoSkills.filter(skill => autoSkillState.has(skill.id)).map(skill => {
    const {rank, readyAt} = autoSkillState.get(skill.id);
    const left = Math.ceil(readyAt - defense.time);
    return skill.name + ' Lv.' + rank + ' · ' + (left > 0 ? left + '秒' : '就绪');
  }).join('｜');
  if (skillStatus.textContent !== timers) skillStatus.textContent = timers;
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
  const {battle, milestone} = defenseCoinBreakdown();
  const targetOffer = ['cannon', 'gate'].find(id => !wallet.owned.includes(id));
  const next = targetOffer ? offers[targetOffer] : null;
  const remaining = next ? next.price - wallet.coins : 0;
  byId('defense-rewards').textContent = '本局累计 · 战斗 ' + battle + ' 金币 · 里程碑 ' + milestone + ' 金币' +
    (next ? remaining > 0 ? '｜距' + next.name + '还差 ' + remaining + ' 金币' : '｜可购买' + next.name : '');
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
  defense.nextHitSound = defense.time;
  defense.last = performance.now();
  state = 'playing';
  stage.dataset.state = state;
  action.hidden = true;
  battlefield.focus();
  defenseStatus();
  frame = requestAnimationFrame(defenseTick);
  return true;
}

function afterBattleFeedback(next) {
  const endAt = performance.now() + 230;
  endDefenseDrag();
  function waitForFeedback(now) {
    if (state !== 'playing' || levelId !== 'defense') return;
    if (now >= endAt) next();
    else frame = requestAnimationFrame(waitForFeedback);
  }
  frame = requestAnimationFrame(waitForFeedback);
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
    enemy.y += enemy.speed * speed * dt * (enemy.slowUntil > defense.time ? .55 : 1);
    if (enemy.type === 'sway') enemy.x = Math.max(6, Math.min(94, enemy.origin + Math.sin(age * 4) * 13));
    placeActor(enemy);
  }
  moveShots(dt);
  triggerAutoSkills();
  const livesBeforeBreach = defense.lives;
  defense.enemies = defense.enemies.filter(enemy => {
    if (enemy.y < 85) return true;
    enemy.element.remove();
    defense.lives -= 1;
    showBattlePop(enemy.x, 85, '−1 耐久', 'breach-pop');
    return false;
  });
  if (defense.lives < livesBeforeBreach) {
    flashBreach();
    playEliteSound();
  }
  defenseStatus();
  if (defense.lives <= 0) return afterBattleFeedback(finishDefense);
  if (defense.pending > 0) return afterBattleFeedback(offerUpgrade);
  frame = requestAnimationFrame(defenseTick);
}

action.addEventListener('click', () => {
  if (levelId !== 'defense' || levelHome.open || shop.open || state === 'playing') return;
  if (!defenseStorySeen) {
    if (!defenseStory.open) defenseStory.showModal();
    return;
  }
  startDefense();
});

function dismissDefenseStory() {
  if (!defenseStory.open) return;
  defenseStorySeen = true;
  defenseStory.close();
  startDefense();
}

byId('defense-story-skip').addEventListener('click', dismissDefenseStory);
byId('defense-story-start').addEventListener('click', dismissDefenseStory);
defenseStory.addEventListener('cancel', event => {
  event.preventDefault();
  dismissDefenseStory();
});

function startDefense() {
  startRound('', '企鹅来了！');
  stopDefenseSounds();
  loadBattleAudio();
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
    pierce: false, nextShot: 0, nextHitSound: 0, nextEnemy: .5, nextElite: 20, eliteIndex: 0, pending: 0});
  defense.round += 1;
  defense.reviveUsed = false;
  autoSkillState.clear();
  defense.rewardPaid = 0;
  defense.ranks = Object.fromEntries(abilities.map(card => [card.id, 0]));
  showDefenseRanks();
  positionShooter(50);
  action.hidden = true;
  battlefield.focus();
  defenseStatus();
  frame = requestAnimationFrame(defenseTick);
}

function dragShooter(event) {
  const width = battlefield.getBoundingClientRect().width;
  if (width > 0) positionShooter(dragOrigin.shooterX + (event.clientX - dragOrigin.clientX) / width * 100);
}

function endDefenseDrag() {
  const pointer = dragPointer;
  dragPointer = null;
  dragOrigin = null;
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
  dragOrigin = {clientX: event.clientX, shooterX: defense.x};
  battlefield.setPointerCapture(event.pointerId);
  battlefield.setAttribute('data-dragging', '');
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
