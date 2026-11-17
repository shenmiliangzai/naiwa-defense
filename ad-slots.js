const defenseStartAd = byId('ad-defense-start');
const defenseResultAd = byId('ad-defense-result');
const reviveAd = byId('ad-defense-revive');
const reviveStatus = byId('ad-revive-status');
const isAdPreview = location.protocol === 'file:' ||
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let checkingReviveAd = false;

function reviveAdProvider() {
  if (typeof window.playDefenseRewardedAd === 'function') return window.playDefenseRewardedAd;
  if (isAdPreview) return async () => {
    await new Promise(resolve => setTimeout(resolve, 900));
    return true;
  };
  return null;
}

function refreshAdSlots() {
  const inDefense = stage.dataset.mode === 'defense';
  const phase = stage.dataset.state;
  defenseStartAd.hidden = !inDefense || phase !== 'ready';
  defenseResultAd.hidden = !inDefense || phase !== 'lost';
  if (defenseResultAd.hidden && !checkingReviveAd) reviveStatus.textContent = '';
  reviveAd.hidden = defenseResultAd.hidden || defense.reviveUsed;
  const provider = reviveAdProvider();
  reviveAd.disabled = checkingReviveAd || !provider;
  reviveAd.textContent = isAdPreview && typeof window.playDefenseRewardedAd !== 'function' ?
    '模拟看广告 · 复活并清场' : '看广告复活并清场';
}

reviveAd.addEventListener('click', async () => {
  const provider = reviveAdProvider();
  if (!provider || checkingReviveAd || reviveAd.hidden) return;
  const round = defense.round;
  checkingReviveAd = true;
  reviveStatus.textContent = isAdPreview && typeof window.playDefenseRewardedAd !== 'function' ?
    '正在模拟广告播放…' : '正在播放激励视频…';
  refreshAdSlots();
  try {
    const completed = await provider('defense_revive_rewarded');
    if (completed === true) {
      reviveDefense(round);
      reviveStatus.textContent = '';
    } else reviveStatus.textContent = '完整看完视频后才能复活。';
  } catch {
    reviveStatus.textContent = '广告暂时无法播放，请稍后重试。';
  } finally {
    checkingReviveAd = false;
    refreshAdSlots();
  }
});

const adStateObserver = new MutationObserver(refreshAdSlots);
adStateObserver.observe(stage, {attributes: true, attributeFilter: ['data-mode', 'data-state']});
refreshAdSlots();
