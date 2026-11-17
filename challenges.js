const challenge = byId('challenge');
const roadTiles = [...byId('sneak-road').children];
const choicePanel = byId('choices');
const choiceButtons = [byId('choice-left'), byId('choice-right')];
const challengeLevels = ['sort', 'sneak', 'memory', 'endless', 'rhythm'];
const moves = ['拍肚皮', '歪脑袋'];
let challengeTimer;
let count = 0;
let expected = 0;
let asleep = false;
let sequence = [];
let step = 0;
let showing = false;
const rhythmTrack = byId('rhythm-track');
let beatAt;
let note;
let rhythmScore = 0;
let rhythmRecord = 0;
let endlessRecord = 0;
try { endlessRecord = Number(localStorage.getItem('naiwa-endless-best')) || 0; } catch {}
try { rhythmRecord = Number(localStorage.getItem('naiwa-rhythm-best')) || 0; } catch {}

function paintRoad(steps) {
  stage.style.setProperty('--sneak-step', steps * 10 + '%');
  roadTiles.forEach((tile, index) => tile.toggleAttribute('data-passed', index < steps));
}

function resetChallenge() {
  clearTimeout(challengeTimer);
  note?.remove();
  note = null;
  byId('fill').getAnimations().forEach(animation => animation.cancel());
  challenge.textContent = '';
  choicePanel.hidden = true;
  action.hidden = false;
}

function openLevelHome() {
  resetRound();
  resetChallenge();
  levelHome.showModal();
}

byId('open-levels').addEventListener('click', openLevelHome);
levelHome.addEventListener('cancel', event => event.preventDefault());

function endChallenge(won, message) {
  resetChallenge();
  // These games share the reaction clips, with the same result sequence.
  finish(won ? 1 : 0, won, message);
}

function showChoices(labels) {
  action.hidden = true;
  labels.forEach((label, index) => { choiceButtons[index].textContent = label; });
  choicePanel.hidden = false;
  choiceButtons[0].focus();
}

function dealSnack() {
  clearTimeout(challengeTimer);
  expected = Math.random() < .5 ? 0 : 1;
  challenge.textContent = expected === 0 ? '🥛 牛奶' : '🐟 小鱼';
  const endless = levelId === 'endless';
  byId('result').textContent = endless ? count + ' 分｜最高分 ' + endlessRecord : '分对 ' + count + ' / 8';
  const limit = endless ? Math.max(480, 2100 - count * 55) : 2100 - count * 130;
  if (endless) {
    const fill = byId('fill');
    fill.getAnimations().forEach(animation => animation.cancel());
    fill.animate([{width: '100%'}, {width: '0%'}], {duration: limit});
  }
  challengeTimer = setTimeout(() => missSnack('夜宵等凉了！'), limit);
}

function missSnack(message) {
  if (levelId === 'endless') {
    if (count > endlessRecord) {
      endlessRecord = count;
      try { localStorage.setItem('naiwa-endless-best', count); } catch {}
    }
    message += ' · ' + count + ' 分｜最高分 ' + endlessRecord;
  }
  endChallenge(false, message);
}

function setAwake(isAsleep) {
  asleep = isAsleep;
  stage.style.setProperty('--sleep-tilt', asleep ? '16deg' : '0deg');
  challenge.textContent = asleep ? '💤 睡着了' : '👀 睁眼了！';
  challengeTimer = setTimeout(() => setAwake(!asleep), 480 + Math.random() * (asleep ? 650 : 780));
}

function showMemory(round) {
  showing = true;
  step = 0;
  sequence = Array.from({length: round + 1}, () => Math.random() < .5 ? 0 : 1);
  byId('result').textContent = '第 ' + round + ' / 3 轮 · 先看';
  choiceButtons.forEach(button => { button.disabled = true; });
  function showMove(index) {
    stage.style.setProperty('--move-tilt', '0deg');
    stage.style.setProperty('--move-squash', '1');
    if (index === sequence.length) {
      showing = false;
      challenge.textContent = '轮到你了';
      byId('result').textContent = '第 ' + round + ' / 3 轮 · 按顺序复述';
      choiceButtons.forEach(button => { button.disabled = false; });
      choiceButtons[0].focus();
      return;
    }
    challenge.textContent = '';
    challengeTimer = setTimeout(() => {
      const move = sequence[index];
      challenge.textContent = (index + 1) + ' · ' + moves[move];
      stage.style.setProperty('--move-tilt', move ? '-15deg' : '0deg');
      stage.style.setProperty('--move-squash', move ? '1' : '.83');
      challengeTimer = setTimeout(() => showMove(index + 1), 580);
    }, 140);
  }
  showMove(0);
}

function nextBeat() {
  const travel = Math.max(560, 1050 - count * 22);
  expected = Math.random() < .5 ? 0 : 1;
  note = document.createElement('div');
  note.className = expected ? 'rhythm-note right' : 'rhythm-note';
  note.textContent = expected ? '🐧' : '🐸';
  note.style.setProperty('--lane', expected ? '75%' : '25%');
  note.style.setProperty('--travel', travel + 'ms');
  rhythmTrack.append(note);
  beatAt = performance.now() + travel;
  challengeTimer = setTimeout(() => finishRhythm('漏拍了'), travel + rhythmWindow());
}

function finishRhythm(reason) {
  if (rhythmScore > rhythmRecord) {
    rhythmRecord = rhythmScore;
    try { localStorage.setItem('naiwa-rhythm-best', rhythmRecord); } catch {}
  }
  endChallenge(false, reason + ' · ' + rhythmScore + ' 分 · ' + count + ' 连击｜最高分 ' + rhythmRecord);
}

action.addEventListener('click', () => {
  if (!challengeLevels.includes(levelId) || levelHome.open) return;
  if (state === 'playing' && levelId === 'sneak') {
    if (!asleep) return endChallenge(false, '被凑企鹅发现了！');
    playTone(300, 175, .09, .12);
    count += 1;
    paintRoad(count);
    byId('fill').style.width = count / 6 * 100 + '%';
    if (count === 6) return endChallenge(true, '悄悄溜过去了！');
    byId('result').textContent = '已走 ' + count + ' / 6 步';
    return;
  }
  if (state === 'playing') return;
  count = 0;
  showing = false;
  choiceButtons.forEach(button => { button.disabled = false; });
  startRound('走一步', '准备好了');
  stage.dataset.mode = levelId;
  if (levelId === 'sneak') {
    paintRoad(0);
    setAwake(true);
    byId('result').textContent = '已走 0 / 6 步';
    return;
  }
  if (levelId === 'sort' || levelId === 'endless') {
    showChoices(['奶蛙', '凑企鹅']);
    dealSnack();
  } else if (levelId === 'rhythm') {
    rhythmScore = 0;
    showChoices(['🐸 奶蛙', '🐧 凑企鹅']);
    byId('result').textContent = '0 分 · 0 连击｜最高分 ' + rhythmRecord;
    nextBeat();
  } else {
    showChoices(moves);
    showMemory(1);
  }
});

choiceButtons.forEach((button, index) => button.addEventListener('click', () => {
  if (state !== 'playing' || showing || levelHome.open) return;
  if (levelId === 'sort' || levelId === 'endless') {
    if (index !== expected) return missSnack('夜宵送错了！');
    playTone(420, 260, .08, .13);
    count += 1;
    if (levelId === 'sort') {
      if (count === 8) return endChallenge(true, '8 份夜宵全分对！');
      byId('fill').style.width = count / 8 * 100 + '%';
    }
    dealSnack();
  } else if (levelId === 'rhythm') {
    const offset = performance.now() - beatAt;
    const distance = Math.abs(offset);
    if (index !== expected || distance > rhythmWindow()) {
      const reason = index !== expected ? '按错轨道' : offset < 0 ? '抢拍了' : '慢了一拍';
      return finishRhythm(reason);
    }
    clearTimeout(challengeTimer);
    note.remove();
    playTone(index ? 520 : 330, index ? 380 : 240, .12, .18);
    count += 1;
    const rating = distance <= 65 ? '精准' : distance <= 115 ? '不错' : '接住';
    const points = distance <= 65 ? 100 : distance <= 115 ? 70 : 40;
    const gained = points + (count % 5 === 0 ? 50 : 0);
    rhythmScore += gained;
    byId('fill').style.width = points + '%';
    byId('result').textContent = rating + ' +' + gained + ' · ' + rhythmScore + ' 分 · ' + count + ' 连击';
    nextBeat();
  } else if (levelId === 'memory') {
    if (index !== sequence[step]) return endChallenge(false, '动作顺序错了！');
    playTone(index ? 500 : 340, 230, .09, .13);
    step += 1;
    if (step < sequence.length) {
      challenge.textContent = '已答 ' + step + ' / ' + sequence.length;
      return;
    }
    count += 1;
    if (count === 3) return endChallenge(true, '三轮动作全记住了！');
    byId('fill').style.width = count / 3 * 100 + '%';
    showMemory(count + 1);
  }
}));

document.addEventListener('keydown', event => {
  if (levelId !== 'rhythm' || state !== 'playing' || levelHome.open || event.repeat) return;
  const lane = ['ArrowLeft', 'ArrowRight'].indexOf(event.code);
  if (lane < 0) return;
  event.preventDefault();
  choiceButtons[lane].click();
});
