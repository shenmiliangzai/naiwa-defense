const offers = {
  valve: {name: '稳压阀', price: 60, detail: '压线放气、憋住别松：绿区从最后 8% 扩大到 14%。'},
  pump: {name: '备用气瓶', price: 80, detail: '狂按打气：倒计时从 4 秒延长到 5 秒。'},
  rhythm: {name: '节拍护腕', price: 100, detail: '蛙企鹅拍：接住判定从 ±170 毫秒扩大到 ±225 毫秒。'},
  cannon: {name: '双份奶弹', price: 60, detail: '奶蛙守家：每次命中造成 2 点伤害，能一击打退普通装甲企鹅。'},
  gate: {name: '加厚家门', price: 80, detail: '奶蛙守家：家门耐久从 3 点提高到 5 点。'},
};
const economyKey = 'naiwa-economy';
const wallet = {coins: 0, owned: [], enabled: true};
try {
  const saved = JSON.parse(localStorage.getItem(economyKey));
  if (Number.isSafeInteger(saved?.coins) && saved.coins >= 0) wallet.coins = saved.coins;
  if (Array.isArray(saved?.owned)) wallet.owned = Object.keys(offers).filter(id => saved.owned.includes(id));
  if (saved?.enabled === false) wallet.enabled = false;
} catch {}

const shop = byId('shop');
const boostToggle = byId('boost-enabled');
let fromHome = false;

function saveWallet() {
  try { localStorage.setItem(economyKey, JSON.stringify(wallet)); } catch {}
}

function boosted(id) {
  return wallet.enabled && wallet.owned.includes(id);
}

function roundTarget() { return boosted('valve') ? .86 : target; }
function pumpLimit() { return boosted('pump') ? 5000 : 4000; }
function rhythmWindow() { return boosted('rhythm') ? 225 : 170; }

function refreshBoostHint() {
  const greenZone = levelId === 'timing' || levelId === 'hold';
  const percentage = Math.round(roundTarget() * 100);
  document.documentElement.style.setProperty('--target', greenZone ? percentage + '%' : '100%');
  byId('target-hint').textContent = greenZone ? '绿区 ' + percentage + '%–99%' :
    levelId === 'pump' ? pumpLimit() / 1000 + ' 秒内打满' :
    levelId === 'rhythm' ? '精准 100 · 不错 70 · 接住 40｜每 5 连击 +50' : '';
}

const defenseMilestoneSeconds = 18;
const defenseMilestoneCoins = 10;

function defenseCoinBreakdown() {
  return {
    battle: Math.min(50, Math.floor(defense.score / 10)),
    milestone: defense.time >= defenseMilestoneSeconds ? defenseMilestoneCoins : 0,
  };
}

function awardCoins(won) {
  let earned = won ? 20 : 0;
  if (levelId === 'endless' || levelId === 'rhythm') earned = Math.min(30, count * 2);
  if (levelId === 'defense') {
    const {battle, milestone} = defenseCoinBreakdown();
    const total = battle + milestone;
    earned = Math.max(0, total - defense.rewardPaid);
    defense.rewardPaid = Math.max(defense.rewardPaid, total);
  }
  if (earned === 0) return 0;
  wallet.coins += earned;
  saveWallet();
  updateWalletLabels();
  return earned;
}

function updateWalletLabels() {
  byId('wallet').textContent = '余额 ' + wallet.coins + ' 金币';
  byId('home-shop').textContent = byId('shop-button').textContent = '金币商店 · ' + wallet.coins;
}

function renderShop() {
  updateWalletLabels();
  boostToggle.checked = wallet.enabled;
  const items = byId('shop-items');
  items.replaceChildren();
  for (const [id, offer] of Object.entries(offers)) {
    const item = document.createElement('button');
    item.type = 'button';
    const title = document.createElement('strong');
    const description = document.createElement('span');
    const owned = wallet.owned.includes(id);
    title.textContent = offer.name + ' · ' + (owned ? '已拥有' : offer.price + ' 金币');
    description.textContent = offer.detail;
    item.append(title, description);
    item.disabled = owned;
    item.addEventListener('click', () => {
      if (wallet.owned.includes(id)) return;
      if (wallet.coins < offer.price) {
        byId('shop-status').textContent = '还差 ' + (offer.price - wallet.coins) + ' 金币';
        return;
      }
      wallet.coins -= offer.price;
      wallet.owned.push(id);
      saveWallet();
      refreshBoostHint();
      renderShop();
      byId('shop-back').focus();
      byId('shop-status').textContent = '已购买' + offer.name + (wallet.enabled ? '，下一局生效' : '，启用道具后生效');
    });
    items.append(item);
  }
}

function openShop() {
  if (state === 'playing') return;
  fromHome = levelHome.open;
  if (fromHome) levelHome.close();
  byId('shop-status').textContent = '';
  renderShop();
  shop.showModal();
}

byId('shop-button').addEventListener('click', openShop);
byId('home-shop').addEventListener('click', openShop);
byId('shop-back').addEventListener('click', () => shop.close());
shop.addEventListener('close', () => {
  if (fromHome) levelHome.showModal();
  fromHome = false;
});
boostToggle.addEventListener('change', () => {
  wallet.enabled = boostToggle.checked;
  saveWallet();
  refreshBoostHint();
});
updateWalletLabels();
