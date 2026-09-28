// ============================================================
// 3分ねこクリッカー
// ============================================================
// このファイルにはゲームのルールをまとめています。
// 初学者でも「どこを直せば何が変わるか」が追いやすいように、
// データと処理をできるだけ分け、コメントを多めにしています。
//
// 大きな方針:
// - 3分間だけ遊ぶ短時間インクリメンタルゲーム
// - 左の猫を手動クリックしてポイントを稼ぐ
// - 施設を買うと自動でポイントが増える
// - アップグレードは施設とは別タブ
// - 最初の施設「ねこバイト」は15秒に1回、自動クリックする
// - ねこバイトを増やすと、一定数(20 / 40 / 70体)ごとに新しいクリック強化が解禁される
// ============================================================

// ------------------------------------------------------------
// 1. ゲーム全体の設定
// ------------------------------------------------------------

// 3分 = 180秒。
const GAME_TIME_SECONDS = 180;

// 「ねこバイト」が自動クリックする間隔。
const HELPER_INTERVAL_SECONDS = 15;

// 施設の標準的な価格上昇率。
// Cookie Clicker系の「買うほど指数的に高くなる」感触を参考にしています。
// ただし3分ゲームなので、施設ごとに個別調整もしています。
const DEFAULT_COST_GROWTH = 1.15;

// ランキングは「直近10回だけ保存し、その中の上位5件を表示」します。
// localStorage は同じブラウザにデータを残せる仕組みです。
const SCORE_HISTORY_LIMIT = 10;
const RANKING_DISPLAY_LIMIT = 5;
const RANKING_STORAGE_KEY = 'threeMinuteNekoClicker.scoreHistory.v1';

// v13: 施設は最初から全部見せず、累計スコアが「初期価格 × この割合」に届くと正体が分かります。
// 次に見えてくる1つだけは「？？？」のシルエットで予告します。
const FACILITY_REVEAL_RATIO = 0.4;

// v13: 未解禁アップグレードは、解禁条件の進み具合がこの割合を超えるまで一覧に出しません。
// 最初から15個全部の灰色カードが並ぶと、ショップがごちゃつくためです。
const UPGRADE_PREVIEW_RATIO = 0.3;

// ------------------------------------------------------------
// 2. 施設データ
// ------------------------------------------------------------
// 施設を増やす場合は、この配列に1項目足すだけでショップに自動表示されます。
//
// mode:
//   "helper" = 15秒ごとに「クリック」を代行する特殊施設
//   "cps"    = 毎秒一定量を生産する通常施設
// ------------------------------------------------------------
const FACILITIES = [
  {
    id: 'helper',
    news: '【開業】ねこバイト第1号を採用。初仕事は昼寝', // 初めて1個買った時に、ねこNEWSで流す見出し
    name: 'ねこバイト',
    baseCost: 2,
    costGrowth: 1.04,
    mode: 'helper',
    baseCps: 0,
    description: '15秒に1回、1体につき猫を1クリック。クリック強化の効果もそのまま乗る。',
  },
  {
    id: 'bowl',
    news: '【開業】自動ごはん皿の第1号機が稼働。3秒で空に', // 初めて1個買った時に、ねこNEWSで流す見出し
    name: '自動ごはん皿',
    baseCost: 15,
    costGrowth: DEFAULT_COST_GROWTH,
    mode: 'cps',
    baseCps: 1.2,
    description: '誰も触っていなくても、じわじわポイントを作る。',
  },
  {
    id: 'box',
    news: '【開業】ダンボール工場が操業開始。最初の製品は猫が占拠', // 初めて1個買った時に、ねこNEWSで流す見出し
    name: 'ダンボール工場',
    baseCost: 90,
    costGrowth: DEFAULT_COST_GROWTH,
    mode: 'cps',
    baseCps: 9,
    description: '猫が吸い込まれる箱を量産して、なぜかポイントが増える。',
  },
  {
    id: 'cafe',
    news: '【開業】ねこカフェがオープン。初日から行列、猫は全員寝ている', // 初めて1個買った時に、ねこNEWSで流す見出し
    name: 'ねこカフェ',
    baseCost: 500,
    costGrowth: DEFAULT_COST_GROWTH,
    mode: 'cps',
    baseCps: 60,
    description: '客が猫を眺めるたびにポイントが発生する。たぶん合法。',
  },
  {
    id: 'stream',
    news: '【開業】ねこ配信局が開局。初回配信は猫の後頭部を3時間', // 初めて1個買った時に、ねこNEWSで流す見出し
    name: 'ねこ配信局',
    baseCost: 2600,
    costGrowth: DEFAULT_COST_GROWTH,
    mode: 'cps',
    baseCps: 420,
    description: '猫の顔を24時間配信。視聴者数がそのまま力になる。',
  },
  {
    id: 'space',
    news: '【快挙】ねこ宇宙センター完成！ 猫、ついに宇宙へ', // 初めて1個買った時に、ねこNEWSで流す見出し
    name: 'ねこ宇宙センター',
    baseCost: 12000,
    // v12: 宇宙センターだけ価格倍率を 1.15 → 1.23 に。
    // 最初の数個は今まで通り爆発的に元が取れるが、10個を超えたあたりから値段が急に重くなり、
    // 「MAX連打だけが正解」になりすぎないようにしています。
    costGrowth: 1.23,
    mode: 'cps',
    baseCps: 2800,
    description: 'ついに猫を宇宙へ。規模がおかしい終盤施設。',
  },
];

// ------------------------------------------------------------
// 3. アップグレードデータ
// ------------------------------------------------------------
// アップグレードも配列で管理しています。
//
// unlockText:
//   画面に表示する解禁条件。
// progress(state):
//   [いまの値, 目標値] を返す関数。
//   「いまの値 >= 目標値」になったら解禁です。
//   v11からはこの1つの関数で「解禁判定」と「ゲージ表示(12 / 20)」の両方を行います。
//   (以前の unlock(state) を書いた項目も引き続き動きます。)
// apply(state):
//   購入時に実際の効果を適用する関数。
//
// 解禁条件をまとめて書くための小さな補助関数です。
const needHelpers = (target) => (state) => [state.facilityCounts.helper, target];
const needFacility = (id, target) => (state) => [state.facilityCounts[id], target];
const needTotalFacilities = (target) => (state) => [getTotalFacilityCount(state), target];
const needContinuousCps = (target) => (state) => [getContinuousCps(state), target];
// ------------------------------------------------------------
const UPGRADES = [
  // --- ねこバイトの所持数に応じたクリック強化 ---
  {
    id: 'click_20',
    news: '【話題】猫を両手で押す新手法が流行。「効率2倍」と専門家', // 購入時に、ねこNEWSで流す見出し
    name: 'クリック強化 I「両手で押す」',
    cost: 90,
    unlockText: 'ねこバイトを20体所有',
    progress: needHelpers(20),
    description: '手動クリックと「ねこバイト」の1クリック量が2倍。',
    apply: (state) => { state.clickMultiplier *= 2; },
  },
  {
    id: 'click_40',
    news: '【文化】連打道場が「連打の心得」を伝授。門下生の指が倍速に', // 購入時に、ねこNEWSで流す見出し
    name: 'クリック強化 II「連打の心得」',
    cost: 450,
    unlockText: 'ねこバイトを40体所有',
    progress: needHelpers(40),
    description: '手動クリックと「ねこバイト」の1クリック量がさらに2倍。',
    apply: (state) => { state.clickMultiplier *= 2; },
  },
  {
    id: 'click_70',
    news: '【物理】謎のエネルギー「猫圧」を観測。クリックの威力がさらに倍', // 購入時に、ねこNEWSで流す見出し
    name: 'クリック強化 III「猫圧」',
    cost: 2500,
    unlockText: 'ねこバイトを70体所有',
    progress: needHelpers(70),
    description: '手動クリックと「ねこバイト」の1クリック量がさらに2倍。',
    apply: (state) => { state.clickMultiplier *= 2; },
  },

  // --- 自動生産に比例してクリックも強くなる「マウス系」強化 ---
  // Cookie Clickerのマウス系アップグレードを参考に、
  // 通常施設の毎秒生産量(CPS)の一部を1クリックへ上乗せします。
  // ねこバイトはクリック量そのものを使うため、循環計算を避けてCPS基準から除外しています。
  {
    id: 'mouse_cps_1',
    news: '【新製品】肉球マウス発売。施設の力がクリックに宿る', // 購入時に、ねこNEWSで流す見出し
    name: '肉球マウス',
    cost: 250,
    unlockText: '通常施設の自動生産が30/秒以上',
    progress: needContinuousCps(30),
    description: '通常施設の自動生産量の1%を、1クリックごとに追加。ねこバイトのクリックにも乗る！',
    apply: (state) => { state.clickCpsPercent += 0.01; },
  },
  {
    id: 'mouse_cps_2',
    news: '【新製品】毛だらけマウスパッド、なぜか性能向上。掃除は禁止に', // 購入時に、ねこNEWSで流す見出し
    name: '毛だらけマウスパッド',
    cost: 1800,
    unlockText: '通常施設の自動生産が250/秒以上',
    progress: needContinuousCps(250),
    description: '通常施設の自動生産量の2%を、さらに1クリックへ追加(累計3%)。ねこバイトにも乗る。',
    apply: (state) => { state.clickCpsPercent += 0.02; },
  },
  {
    id: 'mouse_cps_3',
    news: '【新製品】ゲーミング肉球、7色に光る。とにかく強い', // 購入時に、ねこNEWSで流す見出し
    name: 'ゲーミング肉球',
    cost: 12000,
    unlockText: '通常施設の自動生産が2,000/秒以上',
    progress: needContinuousCps(2000),
    description: '通常施設の自動生産量の4%を、さらに1クリックへ追加(累計7%)。ねこバイトにも乗る。',
    apply: (state) => { state.clickCpsPercent += 0.04; },
  },
  {
    id: 'mouse_cps_4',
    news: '【技術】猫速クリック回路が完成。ねこバイトの一撃がとんでもない額に', // 購入時に、ねこNEWSで流す見出し
    name: '猫速クリック回路',
    cost: 60000,
    unlockText: '通常施設の自動生産が12,000/秒以上',
    progress: needContinuousCps(12000),
    description: '通常施設の自動生産量の8%を、さらに1クリックへ追加(累計15%)。ねこバイトにも乗る。',
    apply: (state) => { state.clickCpsPercent += 0.08; },
  },

  // --- 施設ごとの強化 ---
  {
    id: 'helper_25', // idは過去の保存データ互換のため据え置き（実際の条件は10体）
    news: '【労働】ねこバイトに研修マニュアル配布。1回で2回分押すコツを習得', // 購入時に、ねこNEWSで流す見出し
    name: 'バイト研修マニュアル',
    cost: 45,
    unlockText: 'ねこバイトを10体所有',
    progress: needHelpers(10),
    description: 'ねこバイトが15秒ごとに行う自動クリック回数を2倍扱いにする。',
    apply: (state) => { state.facilityMultipliers.helper *= 2; },
  },
  {
    id: 'bowl_10',
    news: '【グルメ】自動ごはん皿に高級カリカリ。猫の食べる速さも2倍に', // 購入時に、ねこNEWSで流す見出し
    name: '高級カリカリ投入',
    cost: 180,
    unlockText: '自動ごはん皿を10個所有',
    progress: needFacility('bowl', 10),
    description: '自動ごはん皿の生産量が2倍。',
    apply: (state) => { state.facilityMultipliers.bowl *= 2; },
  },
  {
    id: 'box_10',
    news: '【技術】めちゃくちゃ良いダンボールを開発。入り心地が2倍に', // 購入時に、ねこNEWSで流す見出し
    name: 'めちゃくちゃ良いダンボール',
    cost: 900,
    unlockText: 'ダンボール工場を10個所有',
    progress: needFacility('box', 10),
    description: 'ダンボール工場の生産量が2倍。',
    apply: (state) => { state.facilityMultipliers.box *= 2; },
  },
  {
    id: 'cafe_10',
    news: '【流行】ねこカフェに映える照明。写真を撮る客が2倍に', // 購入時に、ねこNEWSで流す見出し
    name: '映える照明',
    cost: 5000,
    unlockText: 'ねこカフェを10個所有',
    progress: needFacility('cafe', 10),
    description: 'ねこカフェの生産量が2倍。',
    apply: (state) => { state.facilityMultipliers.cafe *= 2; },
  },
  {
    id: 'stream_10',
    news: '【芸能】ねこ配信局、サムネを全部この猫に。再生数が倍増', // 購入時に、ねこNEWSで流す見出し
    name: 'サムネを全部この猫にする',
    cost: 22000,
    unlockText: 'ねこ配信局を10個所有',
    progress: needFacility('stream', 10),
    description: 'ねこ配信局の生産量が2倍。クリック率が異様に高い。',
    apply: (state) => { state.facilityMultipliers.stream *= 2; },
  },

  // --- 全施設に効く強化 ---
  {
    id: 'global_30',
    news: '【政治】ねこ同盟が発足。すべての施設が1.8倍やる気に', // 購入時に、ねこNEWSで流す見出し
    name: 'ねこ同盟',
    cost: 700,
    unlockText: '施設を合計25個所有',
    progress: needTotalFacilities(25),
    description: 'すべての自動生産量を1.8倍。ねこバイトにも効く。',
    apply: (state) => { state.globalFacilityMultiplier *= 1.8; },
  },
  {
    id: 'global_80',
    news: '【社会】だいたい猫で解決する社会、ついに実現', // 購入時に、ねこNEWSで流す見出し
    name: 'だいたい猫で解決する社会',
    cost: 6000,
    unlockText: '施設を合計60個所有',
    progress: needTotalFacilities(60),
    description: 'すべての自動生産量をさらに2倍。',
    apply: (state) => { state.globalFacilityMultiplier *= 2; },
  },
  {
    id: 'global_120',
    news: '【宇宙】猫銀河ネットワーク開通。銀河の果てまで猫だらけ', // 購入時に、ねこNEWSで流す見出し
    name: '猫銀河ネットワーク',
    cost: 32000,
    unlockText: '施設を合計120個所有',
    progress: needTotalFacilities(120),
    description: 'すべての自動生産量をさらに2倍。終盤の押し上げ用。',
    apply: (state) => { state.globalFacilityMultiplier *= 2; },
  },
];

// ショップでは「安い順」に並べたいので、価格順の番号を先に作っておきます。
const UPGRADE_COST_RANK = new Map(
  [...UPGRADES]
    .sort((a, b) => a.cost - b.cost)
    .map((upgrade, index) => [upgrade.id, index]),
);

// ------------------------------------------------------------
// 4. HTML要素を取得
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const timerEl = $('timer');
const timerBoxEl = document.querySelector('.timer-box');
const totalScoreEl = $('totalScore');
const currencyEl = $('currency');
const clickPowerEl = $('clickPower');
const autoCpsEl = $('autoCps');
const helperOwnedEl = $('helperOwned');
const gameStatusEl = $('gameStatus');
const helperPulseBadgeEl = $('helperPulseBadge');
const helperPawEls = Array.from(document.querySelectorAll('.paw-hand'));
const finalCountEl = $('finalCount');

const mainButton = $('mainButton');
const startButton = $('startButton');
const startCountdownEl = $('startCountdown');
const countdownNumberEl = $('countdownNumber');
const countdownCaptionEl = $('countdownCaption');

const facilityTab = $('facilityTab');
const upgradeTab = $('upgradeTab');
const facilityPanel = $('facilityPanel');
const upgradePanel = $('upgradePanel');
const facilityList = $('facilityList');
const upgradeList = $('upgradeList');
const upgradeNotice = $('upgradeNotice');
const upgradeEmptyEl = $('upgradeEmpty');
const bulkControls = $('bulkControls');
const bulkHintEl = $('bulkHint');
const shopScroller = $('shopScroller');
const toastAreaEl = $('toastArea');
const newsTickerEl = $('newsTicker');
const newsTextEl = $('newsText');

const resultModal = $('resultModal');
const resultCardEl = document.querySelector('.result-card');
const finalScoreEl = $('finalScore');
const bestCompareEl = $('bestCompare');
const growthChartEl = $('growthChart');
const growthCaptionEl = $('growthCaption');
const finalClicksEl = $('finalClicks');
const finalFacilitiesEl = $('finalFacilities');
const finalUpgradesEl = $('finalUpgrades');
const retryButton = $('retryButton');
const rankInBannerEl = $('rankInBanner');
const rankInTextEl = $('rankInText');
const rankingListEls = [$('rankingList'), $('resultRankingList'), $('compactRankingList')].filter(Boolean);

// ------------------------------------------------------------
// 5. 数値の表示
// ------------------------------------------------------------

// 大きな数字は省略せず 1,234,567 のように3桁区切りで表示します。
function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Math.floor(value).toLocaleString('ja-JP');
}

// 小数を含む量（毎秒量・1クリック量）の表示用。
// 以前は 6 を「6.00」、0.4 を「0.40」と出していたので、末尾の0を消します。
function formatRate(value) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 100) return formatNumber(value);
  const digits = value >= 10 ? 1 : 2;
  return String(Number(value.toFixed(digits)));
}

// 秒数を「12秒」「1分05秒」の形へ。
function formatSeconds(seconds) {
  const whole = Math.ceil(seconds);
  if (whole < 60) return `${whole}秒`;
  return `${Math.floor(whole / 60)}分${String(whole % 60).padStart(2, '0')}秒`;
}

// ランキング用の日時「9/25 14:03」。
function formatPlayedAt(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
}

// ------------------------------------------------------------
// 大きな数値を「必ず1行」に収める仕組み
// ------------------------------------------------------------
// 数字を省略しない方針なので、桁が増えた時は改行ではなく文字サイズを縮めます。
//
// v10では「50msごとに、全部の数字を、1pxずつ縮めながら測り直す」処理だったため、
// プレイ中ずっと重い計算が続いていました。
// v11では次のように軽くしています。
//   - 文字が変わった要素だけを「測り直し待ち」に入れる
//   - 縮める量は比率で一発計算し、最後に1〜2回だけ微調整
//   - 非表示中(幅0)の要素は、表示された時まで待つ
//
// 要素に data-fit-max(最大px) を付けると対象になります。
// data-fit-max-compact はスマホ幅(900px以下)での最大pxです。
const pendingFitEls = new Set();
const FIT_MIN_PX = 8;

function isCompactLayout() {
  return window.innerWidth <= 900;
}

function markFit(element, maxPx, compactMaxPx = maxPx) {
  element.dataset.fitMax = String(maxPx);
  element.dataset.fitMaxCompact = String(compactMaxPx);
  pendingFitEls.add(element);
}

function fitTextToSingleLine(element) {
  const maxPx = Number(isCompactLayout() ? element.dataset.fitMaxCompact : element.dataset.fitMax);
  element.style.fontSize = `${maxPx}px`;

  const available = element.clientWidth;
  const needed = element.scrollWidth;
  if (needed <= available) return;

  let size = Math.max(FIT_MIN_PX, Math.floor(maxPx * (available / needed)));
  element.style.fontSize = `${size}px`;
  while (element.scrollWidth > element.clientWidth && size > FIT_MIN_PX) {
    size -= 1;
    element.style.fontSize = `${size}px`;
  }
}

function flushPendingFits() {
  for (const element of pendingFitEls) {
    // 非表示の要素は幅が測れないので、次の機会まで待ちます。
    if (element.clientWidth === 0) continue;
    fitTextToSingleLine(element);
    pendingFitEls.delete(element);
  }
}

function refitAll() {
  document.querySelectorAll('[data-fit-max]').forEach((element) => pendingFitEls.add(element));
  flushPendingFits();
}

// 文字が本当に変わった時だけ書き換えます。
// 書き換えた要素が「1行に収める対象」なら測り直し待ちに入れます。
function setText(element, text) {
  if (element.textContent === text) return;
  element.textContent = text;
  if (element.dataset.fitMax) pendingFitEls.add(element);
}

// ------------------------------------------------------------
// 6. ランキング保存
// ------------------------------------------------------------
// localStorage に「直近10回」の結果だけを保存します。
// ページを閉じても同じブラウザならランキングが残ります。
// 破損したデータが入っていてもゲームが止まらないよう、try/catch で守っています。
function loadScoreHistory() {
  try {
    const raw = localStorage.getItem(RANKING_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && Number.isFinite(Number(entry.score)))
      .map((entry, index) => ({
        id: String(entry.id ?? `legacy-${index}`),
        score: Math.max(0, Math.floor(Number(entry.score))),
        playedAt: typeof entry.playedAt === 'string' ? entry.playedAt : '',
      }))
      .slice(-SCORE_HISTORY_LIMIT);
  } catch (error) {
    console.warn('ランキングの読み込みに失敗しました。空のランキングで開始します。', error);
    return [];
  }
}

function saveScoreHistory() {
  try {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(scoreHistory));
  } catch (error) {
    // 保存に失敗してもゲーム本体は続行できるようにします。
    console.warn('ランキングの保存に失敗しました。', error);
  }
}

// スコアの高い順。同点なら新しいプレイを上にします。
function getSortedScoreHistory() {
  return [...scoreHistory].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.playedAt).localeCompare(String(a.playedAt));
  });
}

// ゲーム終了時に1件だけ追加し、10件を超えた古い記録を消します。
// 戻り値: { id: 今回の記録ID, rank: 1〜5位なら順位 / 6位以下なら null }
function registerScore(score) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    score: Math.max(0, Math.floor(score)),
    playedAt: new Date().toISOString(),
  };

  scoreHistory.push(entry);
  scoreHistory = scoreHistory.slice(-SCORE_HISTORY_LIMIT);
  saveScoreHistory();

  const rank = getSortedScoreHistory().findIndex((item) => item.id === entry.id) + 1;
  return {
    id: entry.id,
    rank: rank >= 1 && rank <= RANKING_DISPLAY_LIMIT ? rank : null,
  };
}

// 左側・ショップ側・結果画面の3か所へ同じTOP5を描画します。
// latestId と一致する行は「NEW」付きで強調します。
function renderRanking(latestId = null) {
  const topFive = getSortedScoreHistory().slice(0, RANKING_DISPLAY_LIMIT);

  for (const listElement of rankingListEls) {
    listElement.innerHTML = '';

    for (let i = 0; i < RANKING_DISPLAY_LIMIT; i += 1) {
      const entry = topFive[i];
      const item = document.createElement('li');
      item.className = 'ranking-row';

      const rankEl = document.createElement('span');
      rankEl.className = 'rank-number';
      rankEl.textContent = `${i + 1}位`;

      const dateEl = document.createElement('span');
      dateEl.className = 'rank-date';

      const scoreEl = document.createElement('b');
      scoreEl.className = 'ranking-score';

      if (entry) {
        dateEl.textContent = formatPlayedAt(entry.playedAt);
        scoreEl.textContent = `${formatNumber(entry.score)} pt`;
        if (entry.id === latestId) item.classList.add('is-latest');
      } else {
        item.classList.add('empty');
        scoreEl.textContent = '---';
      }

      item.append(rankEl, dateEl, scoreEl);
      listElement.appendChild(item);
      markFit(scoreEl, 14);
    }
  }

  flushPendingFits();
}

// ------------------------------------------------------------
// 7. ゲーム状態
// ------------------------------------------------------------
// 変化する値を state という1つのオブジェクトへまとめています。
// 「今ゲームがどういう状態か」を確認したい時はここを見ればOKです。
function createInitialState() {
  const facilityCounts = {};
  const facilityMultipliers = {};

  for (const facility of FACILITIES) {
    facilityCounts[facility.id] = 0;
    facilityMultipliers[facility.id] = 1;
  }

  return {
    currency: 0,                    // 買い物に使える現在ポイント
    totalProduced: 0,               // 累計獲得量。最終スコアになる
    baseClickPower: 1,              // 強化前の基本クリック量
    clickMultiplier: 1,             // クリック倍率
    clickCpsPercent: 0,             // 通常施設CPSの何%を1クリックへ上乗せするか
    globalFacilityMultiplier: 1,    // 全施設共通倍率
    facilityCounts,
    facilityMultipliers,
    purchasedUpgrades: new Set(),
    // 赤い ! 用: 解禁済みで「アップグレードタブで確認した」もの
    seenUnlockedUpgrades: new Set(),
    // お知らせ用: 解禁を一度お知らせしたもの（同じお知らせを何度も出さない）
    announcedUpgrades: new Set(),
    // v13: 正体が判明した施設。一度判明したら、そのプレイ中はずっと見えたまま。
    revealedFacilities: new Set([FACILITIES[0].id]),
    // v13: 結果画面のグラフ用。1秒ごとの累計スコアを記録します。
    scoreSamples: [0],
    nextSampleAt: 1,
    // v13: 結果画面用。宇宙センター(最後の施設)を初めて買った時刻(経過秒)。
    finalFacilityAt: null,
    manualClicks: 0,
    startedAt: 0,                   // 180秒タイマーを開始した時刻(performance.now)
    helperPulsesDone: 0,            // ねこバイトがここまでに発動した回数
    timeLeft: GAME_TIME_SECONDS,
    isPlaying: false,
    endAt: 0,
    lastTickAt: 0,
  };
}

let scoreHistory = loadScoreHistory();
let state = createInitialState();

// 施設を 1 / 10 / MAX のどれで買うか。
let bulkMode = '1';

// 現在見ているショップタブ。
let activeTab = 'facilities';

// requestAnimationFrame のID。
let animationFrameId = null;

// 開始前の3カウント中かどうか（二重スタート防止）。
let isStartCountingDown = false;
let countdownTimeoutIds = [];

// 画面描画はだいたい1秒に20回までに制限します。
let lastUiUpdateAt = 0;
const UI_UPDATE_INTERVAL_MS = 50;

// 画面に同時に出す「+数字」の上限。連打しすぎても重くならないように。
const MAX_FLOATING_NUMBERS = 36;
let floatingNumberCount = 0;

// ------------------------------------------------------------
// 8. 数値計算の補助関数
// ------------------------------------------------------------

// 現在の1クリック量 =「基本クリック力 × 倍率」+「通常施設CPSの一定割合」。
// ねこバイトはこのクリック力を利用する特殊施設なので、循環計算を避けるため
// ここで参照するCPSは getContinuousCps()（通常施設のみ）です。
function getClickPower(currentState = state) {
  const basePower = currentState.baseClickPower * currentState.clickMultiplier;
  const cpsBonus = getContinuousCps(currentState) * currentState.clickCpsPercent;
  return basePower + cpsBonus;
}

// 全施設の所持数合計。
function getTotalFacilityCount(currentState = state) {
  return FACILITIES.reduce((sum, facility) => sum + currentState.facilityCounts[facility.id], 0);
}

// 施設1個分の「次の価格」。所持数が増えるほど指数的に高くなります。
function getFacilityUnitCost(facility, ownedCount) {
  return Math.ceil(facility.baseCost * (facility.costGrowth ** ownedCount));
}

// 「最大limit個まで」の範囲で、今の所持ポイントで買えるだけ買う時の個数と合計価格。
// 例: 10個モードで8個分しか買えなければ { count: 8 }。
// MAXモードは limit を大きな数(10000)にして同じ関数を使います。
function getAffordableUpTo(facility, limit) {
  const owned = state.facilityCounts[facility.id];
  let remaining = state.currency;
  let count = 0;
  let totalCost = 0;

  while (count < limit) {
    const nextCost = getFacilityUnitCost(facility, owned + count);
    if (nextCost > remaining) break;

    remaining -= nextCost;
    totalCost += nextCost;
    count += 1;
  }

  return { count, totalCost };
}

// 現在のまとめ買いモードで「何個」「いくらで」買うことになるか。
// 表示と購入処理の両方でこの関数を使うので、表示と実際の購入がズレません。
function getPurchasePlan(facility) {
  if (bulkMode === '10') return getAffordableUpTo(facility, 10);
  if (bulkMode === 'max') return getAffordableUpTo(facility, 10000);

  const cost = getFacilityUnitCost(facility, state.facilityCounts[facility.id]);
  return { count: state.currency >= cost ? 1 : 0, totalCost: cost };
}

// 通常の毎秒生産施設だけを合計したCPS。
function getContinuousCps(currentState = state) {
  let cps = 0;

  for (const facility of FACILITIES) {
    if (facility.mode !== 'cps') continue;
    cps += facility.baseCps
      * currentState.facilityCounts[facility.id]
      * currentState.facilityMultipliers[facility.id];
  }

  return cps * currentState.globalFacilityMultiplier;
}

// ねこバイトが15秒ごとに稼ぐ量。
function getHelperPulseAmount(currentState = state) {
  return currentState.facilityCounts.helper
    * getClickPower(currentState)
    * currentState.facilityMultipliers.helper
    * currentState.globalFacilityMultiplier;
}

// 表示用の総自動生産量（ねこバイトは15秒分を1秒あたりに換算）。
function getDisplayedTotalCps(currentState = state) {
  return getContinuousCps(currentState) + getHelperPulseAmount(currentState) / HELPER_INTERVAL_SECONDS;
}

// アップグレードの解禁進み具合 [いまの値, 目標値]。
function getUpgradeProgress(upgrade) {
  if (upgrade.progress) return upgrade.progress(state);
  // progress が無い古い書き方(unlockのみ)にも対応。
  return upgrade.unlock(state) ? [1, 1] : [0, 1];
}

function isUpgradeUnlocked(upgrade) {
  const [current, target] = getUpgradeProgress(upgrade);
  return current >= target;
}

// 施設を次に1個買った時、「元が取れるまで何秒か」。
// 元が取れる秒数 = 次の1個の値段 ÷ その1個が増やす毎秒生産量
// ねこバイトは15秒ごとの発動量を1秒あたりに直して比べます。
// マウス系強化でクリック力が上がると、ねこバイトのこの秒数がぐんぐん短くなる(=後半に化ける)のが見えます。
function getFacilityPaybackSeconds(facility, currentState = state) {
  const cost = getFacilityUnitCost(facility, currentState.facilityCounts[facility.id]);
  const gain = facility.mode === 'helper'
    ? getClickPower(currentState) * currentState.facilityMultipliers.helper
      * currentState.globalFacilityMultiplier / HELPER_INTERVAL_SECONDS
    : facility.baseCps * currentState.facilityMultipliers[facility.id] * currentState.globalFacilityMultiplier;
  return gain > 0 ? cost / gain : Infinity;
}

// 正体判明済みの施設のうち、元が取れるのが一番早いもの。ショップの「いまおトク！」札とニュースで使います。
function getBestPaybackFacility() {
  let best = null;
  for (const facility of FACILITIES) {
    if (!state.revealedFacilities.has(facility.id)) continue;
    const seconds = getFacilityPaybackSeconds(facility);
    if (!Number.isFinite(seconds)) continue;
    if (!best || seconds < best.seconds) best = { facility, seconds };
  }
  return best;
}

// 「あと何秒放置すれば買えるか」の目安。
// 自動生産だけで計算するので、クリックすればもっと早く買えます。
function getWaitText(cost) {
  if (!state.isPlaying) return '';
  const shortage = cost - state.currency;
  if (shortage <= 0) return '';

  const rate = getDisplayedTotalCps();
  if (rate <= 0) return '猫を連打！';

  const seconds = shortage / rate;
  if (seconds > state.timeLeft) return '時間内はきびしい';
  return `放置で あと${formatSeconds(seconds)}`;
}

// ポイントを獲得する共通関数。currency と totalProduced の両方を増やします。
function addPoints(amount) {
  if (amount <= 0) return;
  state.currency += amount;
  state.totalProduced += amount;
}

// ------------------------------------------------------------
// 9. ショップのHTMLを最初に作る
// ------------------------------------------------------------
// カード本体はページ読み込み時に1回だけ作り、
// 書き換える要素は refs に覚えておきます（毎回 querySelector しないので軽い）。
const facilityRefs = new Map();
const upgradeRefs = new Map();

function createBuyButtonHtml(dataAttribute, id, label) {
  return `
    <button class="buy-button" type="button" ${dataAttribute}="${id}" disabled>
      <span class="buy-label" data-role="label">${label}</span>
      <span class="buy-price" data-role="price">0 pt</span>
      <span class="buy-eta" data-role="eta"></span>
    </button>
  `;
}

function buildFacilityCards() {
  facilityList.innerHTML = '';
  facilityRefs.clear();

  for (const facility of FACILITIES) {
    const article = document.createElement('article');
    article.className = 'shop-card facility-card';
    article.id = `facility-${facility.id}`;

    article.innerHTML = `
      <img class="shop-image" src="assets/cat.png" alt="" />
      <span class="best-badge" aria-hidden="true">いまおトク！</span>
      <div class="card-main">
        <div class="card-title-row">
          <h4 class="card-title" data-role="title">${facility.name}</h4>
          <span class="card-count" data-role="count" aria-label="所持数">0</span>
        </div>
        <p class="card-description" data-role="description">${facility.description}</p>
        <div class="card-meta">
          <span data-role="production">生産量: -</span>
          <span data-role="multiplier">個別倍率 x1</span>
          <span data-role="payback" class="payback-text"></span>
        </div>
      </div>
      <div class="card-action">
        ${createBuyButtonHtml('data-buy-facility', facility.id, '×1 買う')}
      </div>
    `;

    facilityList.appendChild(article);

    const refs = {
      card: article,
      title: article.querySelector('[data-role="title"]'),
      description: article.querySelector('[data-role="description"]'),
      count: article.querySelector('[data-role="count"]'),
      production: article.querySelector('[data-role="production"]'),
      multiplier: article.querySelector('[data-role="multiplier"]'),
      payback: article.querySelector('[data-role="payback"]'),
      button: article.querySelector('[data-buy-facility]'),
      label: article.querySelector('[data-role="label"]'),
      price: article.querySelector('[data-role="price"]'),
      eta: article.querySelector('[data-role="eta"]'),
    };
    markFit(refs.count, 18);
    markFit(refs.price, 14);
    facilityRefs.set(facility.id, refs);
  }
}

function buildUpgradeCards() {
  upgradeList.innerHTML = '';
  upgradeRefs.clear();

  for (const upgrade of UPGRADES) {
    const article = document.createElement('article');
    article.className = 'shop-card upgrade-card locked';
    article.id = `upgrade-${upgrade.id}`;

    article.innerHTML = `
      <img class="shop-image" src="assets/cat.png" alt="" />
      <div class="card-main">
        <div class="card-title-row">
          <h4 class="card-title">${upgrade.name}</h4>
        </div>
        <p class="card-description">${upgrade.description}</p>
        <span class="unlock-text" data-role="unlock">解禁条件: ${upgrade.unlockText}</span>
        <span class="unlock-progress" aria-hidden="true"><i data-role="bar"></i></span>
      </div>
      <div class="card-action">
        ${createBuyButtonHtml('data-buy-upgrade', upgrade.id, '未解禁')}
      </div>
    `;

    upgradeList.appendChild(article);

    const refs = {
      card: article,
      unlock: article.querySelector('[data-role="unlock"]'),
      bar: article.querySelector('[data-role="bar"]'),
      button: article.querySelector('[data-buy-upgrade]'),
      label: article.querySelector('[data-role="label"]'),
      price: article.querySelector('[data-role="price"]'),
      eta: article.querySelector('[data-role="eta"]'),
    };
    refs.price.textContent = `${formatNumber(upgrade.cost)} pt`;
    markFit(refs.price, 14);
    upgradeRefs.set(upgrade.id, refs);
  }
}

// ------------------------------------------------------------
// 10. ショップ表示を更新
// ------------------------------------------------------------
// 施設の正体が分かる条件。一度判明したら state.revealedFacilities に入れて保持します。
function updateFacilityReveals() {
  for (const facility of FACILITIES) {
    if (state.revealedFacilities.has(facility.id)) continue;
    if (state.totalProduced >= facility.baseCost * FACILITY_REVEAL_RATIO) {
      state.revealedFacilities.add(facility.id);
      // 判明した瞬間だけ「NEW!」の札を付けて目立たせます。
      if (state.isPlaying) flashNewFacility(facilityRefs.get(facility.id).card);
    }
  }
}

function flashNewFacility(card) {
  card.classList.remove('just-revealed');
  void card.offsetWidth;
  card.classList.add('just-revealed');
  window.setTimeout(() => card.classList.remove('just-revealed'), 3000);
}

function updateFacilityCards() {
  updateFacilityReveals();

  // 「まだ正体不明」の施設のうち、最初の1つだけをシルエットで予告します。
  let mysteryShown = false;

  // v18: 元が取れるのが一番早い施設に「いまおトク！」札。2種類以上見えている時だけ。
  // 後半、マウス系強化でねこバイトが化けると、札がねこバイトへ移ることで気づけるようにしています。
  const best = state.isPlaying && state.revealedFacilities.size >= 2 ? getBestPaybackFacility() : null;

  for (const facility of FACILITIES) {
    const refs = facilityRefs.get(facility.id);

    if (!state.revealedFacilities.has(facility.id)) {
      const isMystery = !mysteryShown;
      mysteryShown = true;
      refs.card.classList.toggle('mystery', isMystery);
      refs.card.classList.toggle('facility-hidden', !isMystery);
      refs.card.classList.remove('affordable', 'is-best');
      refs.button.disabled = true;
      if (isMystery) {
        const needed = Math.ceil(facility.baseCost * FACILITY_REVEAL_RATIO);
        setText(refs.title, '？？？');
        setText(refs.description, `累計スコアが ${formatNumber(needed)} pt になると正体がわかる。`);
        setText(refs.label, '？？？');
        setText(refs.price, `${formatNumber(state.totalProduced)} / ${formatNumber(needed)}`);
        setText(refs.eta, '');
      }
      continue;
    }

    if (refs.card.classList.contains('mystery') || refs.card.classList.contains('facility-hidden')) {
      refs.card.classList.remove('mystery', 'facility-hidden');
      setText(refs.title, facility.name);
      setText(refs.description, facility.description);
    }

    const owned = state.facilityCounts[facility.id];
    const multiplier = state.facilityMultipliers[facility.id];

    setText(refs.count, owned.toLocaleString('ja-JP'));

    if (facility.mode === 'helper') {
      setText(refs.production, `15秒ごとに ${formatRate(getHelperPulseAmount())} pt`);
    } else {
      const facilityCps = facility.baseCps * owned * multiplier * state.globalFacilityMultiplier;
      setText(refs.production, `生産: ${formatRate(facilityCps)} /秒`);
    }

    setText(refs.multiplier, `個別倍率 x${formatRate(multiplier)}`);

    const payback = getFacilityPaybackSeconds(facility);
    // 「買った1個が、自分の値段ぶんを稼ぎ終えるまで何秒か」。短いほどおトク。
    // 3分のゲームなので、3分を超える秒数は「3分以上」とだけ出します。
    let paybackText = '';
    if (Number.isFinite(payback)) {
      paybackText = payback > GAME_TIME_SECONDS
        ? '元が取れるまで 3分以上'
        : `元が取れるまで 約${formatSeconds(payback)}`;
    }
    setText(refs.payback, paybackText);
    const isBest = best !== null && best.facility.id === facility.id;
    refs.card.classList.toggle('is-best', isBest);

    const plan = getPurchasePlan(facility);
    const canBuy = state.isPlaying && plan.count > 0;

    refs.card.classList.toggle('affordable', canBuy);
    refs.button.disabled = !canBuy;

    // 買えない時は「MAX ×0」のような変な表示にせず、モード名だけを出します。
    if (plan.count > 0) {
      setText(refs.label, bulkMode === 'max' ? `MAX ×${plan.count}` : `×${plan.count} 買う`);
    } else {
      setText(refs.label, { 1: '×1 買う', 10: '最大×10', max: 'MAX' }[bulkMode]);
    }

    // 1個も買えない時も「次の1個の値段」と「あと何秒か」を見せて、目標を立てやすくします。
    const nextUnitCost = getFacilityUnitCost(facility, owned);
    const shownCost = plan.count > 0 ? plan.totalCost : nextUnitCost;
    setText(refs.price, `${formatNumber(shownCost)} pt`);
    setText(refs.eta, plan.count > 0 ? '' : getWaitText(nextUnitCost));
  }
}

function updateUpgradeCards() {
  let hasUnseenUnlockedUpgrade = false;
  let unseenCount = 0;    // 解禁済みで、まだアップグレードタブで確認していない数
  let visibleCount = 0;   // 一覧に出ている未購入アップグレード
  let sleepingCount = 0;  // まだ姿を見せていない未購入アップグレード

  for (const upgrade of UPGRADES) {
    const refs = upgradeRefs.get(upgrade.id);
    const purchased = state.purchasedUpgrades.has(upgrade.id);

    // 購入済みはショップから完全に隠します（効果・集計は state に残る）。
    refs.card.classList.toggle('purchased-hidden', purchased);
    if (purchased) {
      refs.button.disabled = true;
      continue;
    }

    const [current, target] = getUpgradeProgress(upgrade);
    const unlocked = current >= target;
    const affordable = state.currency >= upgrade.cost;
    const canBuy = state.isPlaying && unlocked && affordable;

    refs.card.classList.toggle('locked', !unlocked);
    refs.card.classList.toggle('affordable', canBuy);

    // 未解禁で、まだ条件の3割にも届いていないものは一覧に出しません。
    const previewing = unlocked || current / target >= UPGRADE_PREVIEW_RATIO;
    refs.card.classList.toggle('upgrade-hidden', !previewing);
    if (previewing) visibleCount += 1; else sleepingCount += 1;
    refs.button.disabled = !canBuy;

    // 並び順: 今買える → 解禁済み → 未解禁。同じグループ内は安い順。
    const group = canBuy ? 0 : (unlocked ? 1 : 2);
    refs.card.style.order = String(group * 100 + UPGRADE_COST_RANK.get(upgrade.id));

    if (!unlocked) {
      const ratio = Math.max(0, Math.min(1, current / target));
      setText(refs.unlock, `解禁まで: ${upgrade.unlockText}（${formatNumber(current)} / ${formatNumber(target)}）`);
      refs.bar.style.width = `${Math.round(ratio * 100)}%`;
      setText(refs.label, '未解禁');
      setText(refs.eta, '');
      continue;
    }

    setText(refs.unlock, `解禁済み: ${upgrade.unlockText}`);
    setText(refs.label, '購入する');
    setText(refs.eta, affordable ? '' : getWaitText(upgrade.cost));

    // 赤い ! は「新しく解禁されたのに、まだアップグレードタブで確認していない」時だけ。
    if (!state.seenUnlockedUpgrades.has(upgrade.id)) {
      hasUnseenUnlockedUpgrade = true;
      unseenCount += 1;
    }

    // プレイ中に新しく解禁されたら、1回だけお知らせを出します。
    if (state.isPlaying && !state.announcedUpgrades.has(upgrade.id)) {
      state.announcedUpgrades.add(upgrade.id);
      if (activeTab !== 'upgrades') showUnlockToast(upgrade);
    }
  }

  const showNotice = activeTab !== 'upgrades' && hasUnseenUnlockedUpgrade;
  upgradeNotice.hidden = !showNotice;
  // v19: ! だけでは気づかない人がいたので、タブ全体を黄色いしましまで点滅させ、
  // ! の中に未確認の件数を出します。
  upgradeTab.classList.toggle('has-new', showNotice);
  setText(upgradeNotice, String(unseenCount));
  // さらに、未確認のまま20秒たつごとに、タブの上の吹き出しで念押しします。
  if (showNotice && state.isPlaying) remindUnseenUpgrades(unseenCount);

  // 一覧の下に「まだ眠っている数」を出して、先があることを予告します。
  if (sleepingCount > 0) {
    setText(upgradeEmptyEl, visibleCount === 0
      ? `まだ何も見えない……。ねこバイトや施設を増やすと姿を現す（${sleepingCount}件）`
      : `ほかに ${sleepingCount}件のアップグレードが、まだ眠っている……`);
  } else {
    setText(upgradeEmptyEl, visibleCount === 0 ? 'アップグレードは全部買った！' : '');
  }
  upgradeEmptyEl.hidden = upgradeEmptyEl.textContent === '';
}

// ------------------------------------------------------------
// 11. 画面全体を更新
// ------------------------------------------------------------
function formatTimer(secondsLeft) {
  const clamped = Math.max(0, secondsLeft);
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

// v17: 残り10秒になったら、猫の上に大きな 10 → 9 → … → 1 を1秒ずつ出します。
// クリックの邪魔をしないよう pointer-events: none の半透明表示です。
let shownFinalCount = null;

function updateFinalCount() {
  const secondsLeft = Math.ceil(state.timeLeft);
  const show = state.isPlaying && secondsLeft <= 10 && secondsLeft >= 1;
  const next = show ? secondsLeft : null;
  if (next === shownFinalCount) return;

  shownFinalCount = next;
  finalCountEl.hidden = !show;
  if (!show) return;

  finalCountEl.textContent = String(secondsLeft);
  finalCountEl.classList.remove('pop');
  void finalCountEl.offsetWidth;
  finalCountEl.classList.add('pop');
}

function updateDisplay() {
  setText(totalScoreEl, formatNumber(state.totalProduced));
  setText(currencyEl, formatNumber(state.currency));
  setText(clickPowerEl, `+${formatRate(getClickPower())}`);
  setText(autoCpsEl, `${formatRate(getDisplayedTotalCps())}/秒`);
  setText(helperOwnedEl, `${state.facilityCounts.helper.toLocaleString('ja-JP')} 匹`);
  setText(timerEl, formatTimer(state.timeLeft));

  timerBoxEl.classList.toggle('hurry', state.isPlaying && state.timeLeft <= 10);
  updateFinalCount();
  document.body.classList.toggle('playing-session', state.isPlaying);
  mainButton.disabled = !state.isPlaying;

  startButton.disabled = state.isPlaying || isStartCountingDown;
  if (isStartCountingDown) {
    setText(startButton, 'まもなく開始！');
  } else {
    setText(startButton, state.isPlaying ? '挑戦中……' : '3分チャレンジ開始！');
  }

  setText(gameStatusEl, isStartCountingDown ? '準備中' : (state.isPlaying ? 'プレイ中' : '開始前'));
  gameStatusEl.classList.toggle('playing', state.isPlaying);

  updateFacilityCards();
  updateUpgradeCards();
  flushPendingFits();
}

// ------------------------------------------------------------
// 12. ゲーム開始 / 終了
// ------------------------------------------------------------
function clearStartCountdown() {
  for (const timeoutId of countdownTimeoutIds) {
    window.clearTimeout(timeoutId);
  }
  countdownTimeoutIds = [];
  isStartCountingDown = false;
  startCountdownEl.hidden = true;
}

function stopLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function hideResult() {
  resultModal.hidden = true;
  rankInBannerEl.hidden = true;
  resultCardEl.classList.remove('ranked-result');
}

// 毎回「施設タブ + まとめ買い1個 + ショップ先頭」から始めます。
// 前回プレイで10個/MAXを選んでいても持ち越しません。
function resetShopView() {
  setBulkMode('1');
  switchShopTab('facilities');
  if (shopScroller) shopScroller.scrollTop = 0;
  // スマホではページ全体がスクロールするので、そちらも先頭へ。
  window.scrollTo(0, 0);
}

function startGame() {
  // プレイ中・カウント中の二重スタートを防止。
  if (state.isPlaying || isStartCountingDown) return;

  // カウント中はまだゲームを始めません。3 → 2 → 1 → GO! の後に180秒を開始します。
  state = createInitialState();
  isStartCountingDown = true;
  clearToast();

  // 展示会では毎回ちがう人が遊ぶので、まとめ買い案内も毎回リセットします。
  hasUsedBulk = false;
  usedKeyboardThisGame = false;
  lastUnseenReminderAt = 0;
  singleBuyTimes = [];
  lastBulkNudgeAt = -Infinity;

  // 待機画面(猫・開始ボタン・ランキングだけ)を解除し、ゲーム画面を出します。
  // カウントダウンの後ろでゲーム画面が組み上がるので、GO! の瞬間にすぐ遊べます。
  document.body.classList.remove('is-idle');

  resetShopView();
  hideResult();
  renderRanking();

  startCountdownEl.hidden = false;
  updateDisplay();
  startNews();

  const steps = [
    { text: '3', caption: 'READY?', delay: 0 },
    { text: '2', caption: isKeyboardDevice() ? 'スペースキーでも連打OK！' : 'ねこを狙え！', delay: 700 },
    { text: '1', caption: '連打の準備！', delay: 1400 },
    { text: 'GO!', caption: 'スタート！', delay: 2100 },
  ];

  for (const step of steps) {
    countdownTimeoutIds.push(window.setTimeout(() => {
      countdownNumberEl.textContent = step.text;
      countdownCaptionEl.textContent = step.caption;

      // 同じアニメーションを毎回頭から再生。
      countdownNumberEl.classList.remove('pop');
      countdownCaptionEl.classList.remove('pop');
      void countdownNumberEl.offsetWidth;
      countdownNumberEl.classList.add('pop');
      countdownCaptionEl.classList.add('pop');
    }, step.delay));
  }

  countdownTimeoutIds.push(window.setTimeout(beginTimedGame, 2550));
}

function beginTimedGame() {
  clearStartCountdown();

  state.isPlaying = true;
  const now = performance.now();
  state.lastTickAt = now;
  state.startedAt = now;
  state.endAt = now + GAME_TIME_SECONDS * 1000;

  updateDisplay();

  // すぐ連打できるよう、猫ボタンにフォーカスを移します（キーボード操作の人向け）。
  mainButton.focus({ preventScroll: true });

  animationFrameId = requestAnimationFrame(gameLoop);
}

function finishGame() {
  clearStartCountdown();
  stopLoop();
  clearToast();
  stopNews('【速報】3分終了。おつかれさまでした');
  state.isPlaying = false;
  state.timeLeft = 0;

  // 表示している最終スコアとランキング判定を同じ整数値に揃えます。
  const completedScore = Math.floor(state.totalProduced);

  // 登録前に「直近ベスト」を覚えておき、今回と比べます。
  const previousBest = scoreHistory.reduce((best, entry) => Math.max(best, entry.score), -1);
  const { id: latestId, rank } = registerScore(completedScore);

  setText(finalScoreEl, formatNumber(completedScore));
  setText(finalClicksEl, state.manualClicks.toLocaleString('ja-JP'));
  setText(finalFacilitiesEl, getTotalFacilityCount().toLocaleString('ja-JP'));
  setText(finalUpgradesEl, state.purchasedUpgrades.size.toLocaleString('ja-JP'));

  if (previousBest < 0) {
    bestCompareEl.textContent = 'はじめての記録！ ここからが勝負。';
    bestCompareEl.classList.remove('is-best');
  } else if (completedScore > previousBest) {
    bestCompareEl.textContent = `直近ベスト更新！ 前のベストより +${formatNumber(completedScore - previousBest)} pt`;
    bestCompareEl.classList.add('is-best');
  } else {
    bestCompareEl.textContent = `直近ベストまで あと ${formatNumber(previousBest - completedScore)} pt`;
    bestCompareEl.classList.remove('is-best');
  }

  // 最後の1秒ぶんも記録してからグラフを描きます。
  while (state.scoreSamples.length <= GAME_TIME_SECONDS) state.scoreSamples.push(state.totalProduced);
  renderGrowthChart();

  renderRanking(latestId);

  // 5位以内へ入った時だけ、結果カードにランクイン演出を付けます。
  if (rank !== null) {
    rankInTextEl.textContent = `第${rank}位にランクイン!!`;
    rankInBannerEl.hidden = false;
    resultCardEl.classList.remove('ranked-result');
    void resultCardEl.offsetWidth; // アニメーションを最初から再生するため
    resultCardEl.classList.add('ranked-result');
  } else {
    rankInBannerEl.hidden = true;
    resultCardEl.classList.remove('ranked-result');
  }

  resultModal.hidden = false;
  resultCardEl.scrollTop = 0;

  // 終了直前まで猫を連打していると、結果画面の「もう1回」を誤って押しがち。
  // 少しの間だけ押せないようにします。
  // v19: スペース連打のまま「もう1回」が押されて撮影前に消えないよう、フォーカスも移しません。
  retryButton.disabled = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  window.setTimeout(() => {
    retryButton.disabled = false;
  }, 900);

  startAutoReturn();

  updateDisplay();
  refitAll();
}

// ------------------------------------------------------------
// 13. 結果画面の「スコアの伸び」グラフ
// ------------------------------------------------------------
// 1秒ごとに記録した累計スコアを、SVGの折れ線で描きます。
// インクリメンタルゲームは後半ほど一気に伸びるので、その「ぶち上がり」が一目で分かります。
function renderGrowthChart() {
  const samples = state.scoreSamples;
  const maxScore = Math.max(1, samples[samples.length - 1]);
  const width = 300;
  const height = 90;
  const toX = (second) => (second / GAME_TIME_SECONDS) * width;
  const toY = (score) => height - (score / maxScore) * (height - 6);

  const points = samples.map((score, second) => `${toX(second).toFixed(1)},${toY(score).toFixed(1)}`);
  const area = `0,${height} ${points.join(' ')} ${width},${height}`;

  // 1分ごとの目盛り線
  let grid = '';
  for (let minute = 1; minute < GAME_TIME_SECONDS / 60; minute += 1) {
    const x = toX(minute * 60);
    grid += `<line class="chart-grid" x1="${x}" y1="0" x2="${x}" y2="${height}" />`;
  }

  // 宇宙センター到達の印
  let marker = '';
  if (state.finalFacilityAt !== null) {
    const second = Math.min(GAME_TIME_SECONDS, Math.floor(state.finalFacilityAt));
    const x = toX(second);
    const y = toY(samples[second] ?? maxScore);
    marker = `<line class="chart-marker-line" x1="${x}" y1="${y}" x2="${x}" y2="${height}" />
      <text class="chart-marker" x="${x}" y="${Math.max(12, y - 4)}" text-anchor="middle">★</text>`;
  }

  growthChartEl.innerHTML = `
    ${grid}
    <polygon class="chart-area" points="${area}" />
    <polyline class="chart-line" points="${points.join(' ')}" />
    ${marker}
  `;

  // 「最後の30秒で何%稼いだか」は、後半の爆発ぶりが数字で分かるひとこと。
  const before = samples[GAME_TIME_SECONDS - 30] ?? 0;
  const lastShare = Math.round(((maxScore - before) / maxScore) * 100);
  const lastFacility = FACILITIES[FACILITIES.length - 1];
  const reachText = state.finalFacilityAt === null
    ? `${lastFacility.name}には届かず`
    : `★${lastFacility.name}到達 ${formatTimer(state.finalFacilityAt).slice(0, 5)}`;
  growthCaptionEl.textContent = `最後の30秒で全体の${lastShare}%を稼いだ ／ ${reachText}`;
}

// ------------------------------------------------------------
// 14. メインゲームループ
// ------------------------------------------------------------
// requestAnimationFrame + performance.now() で終了時刻から逆算するため、
// setInterval で1秒ずつ数えるよりタイマーがズレにくくなります。
function gameLoop(now) {
  if (!state.isPlaying) return;

  // 終了時刻より先の時間を生産計算に入れないようにします。
  const activeNow = Math.min(now, state.endAt);
  const deltaSeconds = Math.max(0, (activeNow - state.lastTickAt) / 1000);
  state.lastTickAt = activeNow;

  // 通常施設は「毎秒生産量 × 経過秒数」で連続的に加算。
  addPoints(getContinuousCps() * deltaSeconds);

  // ねこバイトは「15秒に1回クリック」なので、15秒ごとにまとめて発動します。
  //
  // 発動タイミングは「ねこバイトを買った時刻」ではなく「ゲーム開始から 0:15, 0:30 … 3:00」の共通の時計です。
  // 2:59 に雇ったねこバイトも、3:00 ちょうどの最後の発動にちゃんと参加します。
  //
  // v16: 以前は毎フレームの経過秒数(小数)を足し算して15秒を数えていましたが、
  // 小数の誤差で合計が 179.99999… になり、3:00 の最後の発動が約半分のプレイで消えていました。
  // 今は「開始からの経過時間 ÷ 15秒」で発動すべき回数を毎回計算し直すので、誤差が積み重なりません。
  const helperIntervalMs = HELPER_INTERVAL_SECONDS * 1000;
  const pulsesDue = Math.floor((activeNow - state.startedAt) / helperIntervalMs + 1e-6);
  while (state.helperPulsesDone < pulsesDue) {
    state.helperPulsesDone += 1;

    if (state.facilityCounts.helper > 0) {
      const helperPoints = getHelperPulseAmount();
      addPoints(helperPoints);
      playHelperPulse(helperPoints);
    }
  }

  state.timeLeft = Math.max(0, (state.endAt - now) / 1000);

  // 結果画面のグラフ用に、1秒ごとの累計スコアを記録します。
  const elapsed = GAME_TIME_SECONDS - state.timeLeft;
  while (elapsed >= state.nextSampleAt && state.nextSampleAt <= GAME_TIME_SECONDS) {
    state.scoreSamples.push(state.totalProduced);
    state.nextSampleAt += 1;
  }

  if (now >= state.endAt) {
    finishGame();
    return;
  }

  if (now - lastUiUpdateAt >= UI_UPDATE_INTERVAL_MS) {
    lastUiUpdateAt = now;
    updateDisplay();
  }

  animationFrameId = requestAnimationFrame(gameLoop);
}

// ------------------------------------------------------------
// 15. 猫を手動クリック
// ------------------------------------------------------------
// v11: マウス/タッチは「押した瞬間(pointerdown)」に反応させます。
// click は指を離した時なので、連打すると取りこぼしや遅れを感じやすいためです。
// 複数の指で同時にタップしても、それぞれ1クリックとして数えます。
function hitCat(x, y) {
  if (!state.isPlaying) return;

  const amount = getClickPower();
  addPoints(amount);
  state.manualClicks += 1;

  triggerMainButtonHit();
  createFloatingNumber(x, y, amount);
  updateDisplay();
}

mainButton.addEventListener('pointerdown', (event) => {
  // 右クリック・中クリックは数えません。
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  hitCat(event.clientX, event.clientY);
});

// v19: キーボード(スペース / Enter)は、どこにフォーカスがあっても「猫を押す」として扱います。
// 以前は猫ボタンにフォーカスがある時だけ効いたので、ショップのボタンを押した後に
// スペースを押すと、猫ではなく「買う」ボタンが反応していました。
// プレイ中はスペース / Enter のブラウザ標準動作(ボタンを押す・画面スクロール)を止めて、猫に回します。
let usedKeyboardThisGame = false;

function isHitKey(event) {
  return event.key === ' ' || event.key === 'Enter' || event.code === 'Space';
}

document.addEventListener('keydown', (event) => {
  if (!state.isPlaying || !isHitKey(event)) return;
  event.preventDefault();
  // 押しっぱなしのキーリピートは数えません(自動連打の防止)。
  if (event.repeat) return;
  usedKeyboardThisGame = true;
  const center = getMainButtonCenter();
  hitCat(center.x, center.y);
}, true);

// スペースは「離した時」にボタンが反応するので、そちらも止めます。
document.addEventListener('keyup', (event) => {
  if (state.isPlaying && isHitKey(event)) event.preventDefault();
}, true);

// マウスとキーボードがある端末(PC)かどうか。キー操作の案内を出すかどうかに使います。
function isKeyboardDevice() {
  return window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : true;
}

// 長押しメニューや右クリックメニューが出て連打の邪魔をしないように。
// v20: 猫以外(ショップ等)でも、プレイ中は右クリックメニューを出しません。
document.addEventListener('contextmenu', (event) => {
  if (state.isPlaying || event.target.closest('#mainButton')) event.preventDefault();
});

function createFloatingNumber(x, y, amount) {
  if (floatingNumberCount >= MAX_FLOATING_NUMBERS) return;
  floatingNumberCount += 1;

  const element = document.createElement('span');
  element.className = 'float-number';
  element.textContent = `+${formatRate(amount)}`;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  document.body.appendChild(element);

  window.setTimeout(() => {
    element.remove();
    floatingNumberCount -= 1;
  }, 700);
}

// 数字ではなく文字を浮かび上がらせる版(アップグレード購入の「導入！」など)。
function createFloatingLabel(x, y, text) {
  const element = document.createElement('span');
  element.className = 'float-number float-label';
  element.textContent = text;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  document.body.appendChild(element);
  window.setTimeout(() => element.remove(), 700);
}

function triggerMainButtonHit() {
  mainButton.classList.add('hit');
  window.setTimeout(() => mainButton.classList.remove('hit'), 80);
}

function getMainButtonCenter() {
  const rect = mainButton.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// ねこバイト発動: 4つの肉球おててが順番にタップし、獲得量を4つに分けて表示します。
function playHelperPulse(totalAmount) {
  if (!state.isPlaying || helperPawEls.length === 0) return;

  const center = getMainButtonCenter();
  const pieceAmount = totalAmount / helperPawEls.length;

  // v18: 発動量を大きく出し、自動生産の何秒分かも添えて「ねこバイトすごい」に気づけるように。
  const cps = getContinuousCps();
  const equivalentSeconds = cps > 0 ? totalAmount / cps : 0;
  helperPulseBadgeEl.innerHTML = '';
  const title = document.createElement('span');
  title.textContent = `バイト${state.facilityCounts.helper.toLocaleString('ja-JP')}匹 一斉クリック！`;
  const amount = document.createElement('b');
  amount.textContent = `+${formatNumber(totalAmount)}`;
  helperPulseBadgeEl.append(title, amount);
  if (equivalentSeconds >= 3) {
    const note = document.createElement('small');
    note.textContent = `自動生産の${formatSeconds(equivalentSeconds)}分！`;
    helperPulseBadgeEl.append(note);
  }
  // 自動生産の20秒分を超えたら「すごい」演出に切り替え
  helperPulseBadgeEl.classList.toggle('mega', equivalentSeconds >= 20);

  helperPulseBadgeEl.hidden = false;
  helperPulseBadgeEl.classList.remove('show');
  void helperPulseBadgeEl.offsetWidth;
  helperPulseBadgeEl.classList.add('show');

  helperPawEls.forEach((paw, index) => {
    window.setTimeout(() => {
      paw.classList.remove('active');
      void paw.offsetWidth;
      paw.classList.add('active');
      triggerMainButtonHit();

      const angle = (Math.PI * 2 * index) / helperPawEls.length;
      const radius = Math.min(mainButton.offsetWidth, mainButton.offsetHeight) * 0.14;
      createFloatingNumber(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, pieceAmount);
    }, index * 140);
  });

  window.setTimeout(() => {
    helperPulseBadgeEl.hidden = true;
  }, 1900);
}

// ------------------------------------------------------------
// 16. 購入
// ------------------------------------------------------------
// 買ったカードを一瞬ピョコッと跳ねさせます。
function flashCard(card) {
  card.classList.remove('bought');
  void card.offsetWidth;
  card.classList.add('bought');
}

facilityList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-buy-facility]');
  if (!button || !state.isPlaying) return;

  const facility = FACILITIES.find((item) => item.id === button.dataset.buyFacility);
  if (!facility) return;

  const plan = getPurchasePlan(facility);
  if (plan.count <= 0 || state.currency < plan.totalCost) return;

  const wasFirstPurchase = state.facilityCounts[facility.id] === 0;
  state.currency -= plan.totalCost;
  state.facilityCounts[facility.id] += plan.count;
  trackSingleBuy();

  // 初めて買った施設は、次のねこNEWSで「開業」ニュースにします(割り込みはしない)。
  if (wasFirstPurchase && facility.news) queueNewsEvent(facility.news);

  // 最後の施設(宇宙センター)に初めて手が届いた時刻を、結果画面用に記録。
  const lastFacility = FACILITIES[FACILITIES.length - 1];
  if (facility.id === lastFacility.id && state.finalFacilityAt === null) {
    state.finalFacilityAt = GAME_TIME_SECONDS - state.timeLeft;
  }

  flashCard(facilityRefs.get(facility.id).card);
  updateDisplay();
});

upgradeList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-buy-upgrade]');
  if (!button || !state.isPlaying) return;

  const upgrade = UPGRADES.find((item) => item.id === button.dataset.buyUpgrade);
  if (!upgrade) return;

  if (state.purchasedUpgrades.has(upgrade.id) || !isUpgradeUnlocked(upgrade) || state.currency < upgrade.cost) return;

  state.currency -= upgrade.cost;
  state.purchasedUpgrades.add(upgrade.id);
  upgrade.apply(state);

  // v20: 買ったボタンの位置から「導入！」が浮かび上がる。カードはすぐ一覧から消えるので、その代わりの手ごたえ。
  const rect = button.getBoundingClientRect();
  createFloatingLabel(rect.left + rect.width / 2, rect.top + rect.height / 2, '導入！');

  // v20: 以前はニュースを強制的に切り替えていたが、くどいので「次に流す1本」として予約するだけに。
  if (upgrade.news) queueNewsEvent(upgrade.news);

  updateDisplay();
});

// ------------------------------------------------------------
// 17. お知らせ（新アップグレード解禁）
// ------------------------------------------------------------
// 施設タブを見ている間に解禁されたら、「アップグレード」タブのすぐ上に
// 吹き出しを出して、タブの ! に気づけるようにします。
//
// 吹き出しはクリックを邪魔しない(pointer-events: none)ので、
// 下にある「買う」ボタンを連打中でも誤爆しません。
// 同時に複数解禁された時は1つの吹き出しにまとめます。
let toastTimerId = null;
let toastNames = [];

function showUnlockToast(upgrade) {
  toastNames.push(upgrade.name);
  lastUnseenReminderAt = performance.now();
  const extra = toastNames.length > 1 ? ` ほか${toastNames.length - 1}件` : '';
  showTabBubble('新アップグレード解禁！', `${toastNames[toastNames.length - 1]}${extra}`);
}

// v19: 未確認のアップグレードがあるまま20秒たつごとに、吹き出しで念押し。
const UNSEEN_REMINDER_MS = 20000;
let lastUnseenReminderAt = 0;

function remindUnseenUpgrades(count) {
  const now = performance.now();
  if (lastUnseenReminderAt === 0) {
    // 最初の解禁お知らせから数え始めます。
    lastUnseenReminderAt = now;
    return;
  }
  if (now - lastUnseenReminderAt < UNSEEN_REMINDER_MS || toastAreaEl.children.length > 0) return;
  lastUnseenReminderAt = now;
  showTabBubble(`まだ見てない強化が ${count}件！`, 'このタブを押してチェック ↓');
}

// 「アップグレード」タブの真上に吹き出しを出す共通処理。
function showTabBubble(mainText, subText) {
  toastAreaEl.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = mainText;
  const small = document.createElement('small');
  small.textContent = subText;
  toast.appendChild(small);
  toastAreaEl.appendChild(toast);

  // 吹き出しの位置を、アップグレードタブの真上に合わせます。
  // (真下だと「まとめ買い」ボタンに重なるため上にしています)
  // 細い画面ではタブより吹き出しを少し広くし、画面の外へははみ出させません。
  const tabRect = upgradeTab.getBoundingClientRect();
  const width = Math.min(Math.max(tabRect.width, 210), window.innerWidth - 12);
  const centerX = tabRect.left + tabRect.width / 2;
  const left = Math.min(Math.max(centerX - width / 2, 6), window.innerWidth - width - 6);
  toastAreaEl.style.left = `${Math.round(left)}px`;
  toastAreaEl.style.width = `${Math.round(width)}px`;
  toastAreaEl.style.top = `${Math.max(4, Math.round(tabRect.top - toastAreaEl.offsetHeight - 10))}px`;

  window.clearTimeout(toastTimerId);
  toastTimerId = window.setTimeout(clearToast, 2800);
}

function clearToast() {
  window.clearTimeout(toastTimerId);
  toastNames = [];
  toastAreaEl.innerHTML = '';
}

// ------------------------------------------------------------
// 17-2. まとめ買いの案内（v18）
// ------------------------------------------------------------
// 「×1 買う」を4秒以内に5回以上押している人には、まとめ買いボタンを揺らして
// 横に「← まとめて買えるよ！」を出し、ねこNEWSでも使い方を流します。
// 一度でも 10 / MAX を使った人には二度と出しません。出した後は15秒は再表示しません。
const BULK_NUDGE_CLICKS = 5;
const BULK_NUDGE_WINDOW_MS = 4000;
const BULK_NUDGE_COOLDOWN_MS = 15000;
let singleBuyTimes = [];
let lastBulkNudgeAt = -Infinity;
let bulkNudgeTimerId = null;
let hasUsedBulk = false;

function trackSingleBuy() {
  if (bulkMode !== '1' || hasUsedBulk) return;

  const now = performance.now();
  singleBuyTimes = [...singleBuyTimes, now].filter((time) => now - time <= BULK_NUDGE_WINDOW_MS);
  if (singleBuyTimes.length >= BULK_NUDGE_CLICKS && now - lastBulkNudgeAt >= BULK_NUDGE_COOLDOWN_MS) {
    lastBulkNudgeAt = now;
    singleBuyTimes = [];
    showBulkNudge();
  }
}

function showBulkNudge() {
  bulkControls.classList.remove('nudge');
  void bulkControls.offsetWidth;
  bulkControls.classList.add('nudge');
  bulkHintEl.hidden = false;

  queueNewsEvent('【生活】ショップ上の「まとめ買い」、指にやさしいと話題。「10」なら最大10個、「MAX」なら買えるだけ一気に買える', 'hint');

  window.clearTimeout(bulkNudgeTimerId);
  bulkNudgeTimerId = window.setTimeout(hideBulkNudge, 5000);
}

function hideBulkNudge() {
  window.clearTimeout(bulkNudgeTimerId);
  bulkControls.classList.remove('nudge');
  bulkHintEl.hidden = true;
}

// ------------------------------------------------------------
// 18. ねこニュース（流れるTIPS）
// ------------------------------------------------------------
// Cookie Clicker のニュース欄のように、ショップ上部をニュースが右から左へ流れます。
// 目的は「連打より施設に投資した方が伸びる」ことに自然に気づいてもらうこと。
//
// ニュースは3種類あります。
//   1. 状況ニュース … 今のプレイ状況(連打しすぎ・貯め込みすぎ等)に反応するヒント。一番出やすい
//   2. 豆知識       … いつ出ても正しい基本のヒント
//   3. ネタ         … ただの猫ニュース。ヒントばかりだと説教くさいので混ぜる
//
// 1本流れ終わるたびに、その瞬間の状況を見て次の1本を選び直します。
// 新しいニュースを足したい時は、下の配列に1行足すだけでOKです。
// ------------------------------------------------------------

// 経過秒数
function getElapsedSeconds() {
  return GAME_TIME_SECONDS - state.timeLeft;
}

// 手動クリックで稼いでいる量(1秒あたり)の目安。
// 実際にここまで押した回数から「1秒に何回押しているか」を出し、今のクリック力を掛けます。
function getManualRateGuess() {
  const clicksPerSecond = state.manualClicks / Math.max(1, getElapsedSeconds());
  return getClickPower() * clicksPerSecond;
}

// 「かなり連打している」判定。1秒に3回以上。
function isMashing() {
  return state.manualClicks / Math.max(1, getElapsedSeconds()) >= 3;
}

// 解禁済みで、まだ買っていないアップグレードの数
function getUnboughtUnlockedUpgradeCount() {
  return UPGRADES.filter((upgrade) => !state.purchasedUpgrades.has(upgrade.id) && isUpgradeUnlocked(upgrade)).length;
}

// 18-1. 状況ニュース: when() が true の時だけ候補に入ります。text() は流す直前に作るので数字は常に最新。
const SITUATION_NEWS = [
  {
    id: 'too-many-clicks',
    when: () => getElapsedSeconds() > 20 && isMashing() && getManualRateGuess() > getDisplayedTotalCps(),
    text: () => '【健康】猫を連打しすぎた飼い主、手首を痛めて通院。整形外科医「施設を買えば、猫たちが代わりに稼ぎます」',
  },
  {
    id: 'too-many-clicks-2',
    when: () => getElapsedSeconds() > 40 && isMashing() && getManualRateGuess() > getDisplayedTotalCps(),
    text: () => `【調査】いまの稼ぎの大半は手動クリック。自動生産は毎秒${formatRate(getDisplayedTotalCps())}ptにとどまり、専門家は「指より施設に働かせて」と警鐘`,
  },
  {
    id: 'hoarding',
    when: () => {
      const cheapest = Math.min(...FACILITIES
        .filter((facility) => state.revealedFacilities.has(facility.id))
        .map((facility) => getFacilityUnitCost(facility, state.facilityCounts[facility.id])));
      return getElapsedSeconds() > 10 && state.currency >= cheapest * 4;
    },
    text: () => '【経済】ねこポイントを貯め込む人が急増。経済学者「使っても累計スコアは1点も減りません。貯金は増えない、施設は増やす」',
  },
  {
    id: 'best-payback',
    when: () => getBestPaybackFacility() !== null && getElapsedSeconds() > 5,
    text: () => {
      const { facility, seconds } = getBestPaybackFacility();
      const price = getFacilityUnitCost(facility, state.facilityCounts[facility.id]);
      return `【分析】いま一番おトクな施設は「${facility.name}」(${formatNumber(price)}pt)。1個買えば約${formatSeconds(seconds)}で元が取れる計算。高い施設ほど元が早く取れる傾向に`;
    },
  },
  {
    id: 'helper-power',
    when: () => {
      const cps = getContinuousCps();
      return state.facilityCounts.helper >= 10 && cps > 0 && getHelperPulseAmount() / cps >= 15;
    },
    text: () => {
      const pulse = getHelperPulseAmount();
      const seconds = pulse / getContinuousCps();
      return `【特集】ねこバイト${state.facilityCounts.helper}匹の一斉クリック、1回で${formatNumber(pulse)}pt。自動生産の約${formatSeconds(seconds)}分に相当。バイトを増やすほど化ける`;
    },
  },
  {
    id: 'mouse-helper',
    when: () => state.clickCpsPercent > 0,
    text: () => '【解説】マウス系アップグレードは、ねこバイトのクリックにも効く。施設が育った後半ほど、ねこバイトが大化けする',
  },
  {
    id: 'helper-best',
    when: () => {
      const best = getBestPaybackFacility();
      return getElapsedSeconds() > 60 && best !== null && best.facility.id === 'helper';
    },
    text: () => `【異変】いま一番元が取れる施設は、まさかの「ねこバイト」。約${formatSeconds(getBestPaybackFacility().seconds)}で元が取れる`,
  },
  {
    id: 'upgrade-waiting',
    when: () => getUnboughtUnlockedUpgradeCount() > 0,
    text: () => `【号外】アップグレードに未購入のものが${getUnboughtUnlockedUpgradeCount()}件。倍率系は早く買うほど長く効く`,
  },
  {
    id: 'helper-milestone',
    when: () => [20, 40, 70].some((target) => state.facilityCounts.helper < target && state.facilityCounts.helper >= target - 8),
    text: () => {
      const target = [20, 40, 70].find((value) => state.facilityCounts.helper < value);
      return `【求人】ねこバイト、あと${target - state.facilityCounts.helper}匹で「クリック強化」解禁へ。ねこバイトのクリックも強くなる`;
    },
  },
  {
    id: 'use-keyboard',
    when: () => isKeyboardDevice() && !usedKeyboardThisGame && state.manualClicks >= 40,
    text: () => '【発見】猫はスペースキーやEnterキーでも押せると判明。マウスと両手で連打する猛者も',
  },
  {
    id: 'use-max',
    when: () => bulkMode === '1' && getElapsedSeconds() > 30,
    text: () => '【生活】ショップ上の「まとめ買い」、指にやさしいと話題。「10」なら最大10個、「MAX」なら買えるだけ一気に買える',
  },
  {
    id: 'last-spurt',
    when: () => state.isPlaying && state.timeLeft < 25,
    text: () => '【速報】残りわずか。ポイントは残しても1点にもならない。全部使い切っても累計スコアは減らない',
  },
];

// 18-2. 豆知識: いつでも候補に入る基本のヒント
const TIP_NEWS = [
  '【解説】スコアは「3分間に稼いだ累計」。買い物で使っても減らないので、使える時にどんどん使おう',
  '【研究】ねこバイトは15秒ごとに1回クリックしてくれる。クリック強化の効果もそのまま乗る',
  '【比較】クリックは指が疲れる。施設は疲れない。どちらが3分間で多く稼ぐかは明らか',
  '【解説】施設は買うほど値上がりする。安い施設を買い続けるより、上の施設へ乗り換えた方が伸びることも',
  '【豆知識】「放置で あと○秒」はクリックしなくても買えるまでの目安。短いものから狙うのが近道',
  '【豆知識】施設カードの「元が取れるまで 約○秒」が短いほどおトク。「いまおトク！」札の施設から買うのが近道',
  '【豆知識】PCならスペースキー・Enterキーでも猫を押せる。マウスを持つ手を休ませよう',
  '【研究】ねこバイトは序盤は地味。でもクリック強化とマウス系強化が揃う後半、1回の発動がとんでもない額になる',
];

// 18-3. ネタ: ただの猫ニュース
// v20: 種類を増やし、施設に関するネタは needs(その施設を1個以上持っている時だけ)で絞ります。
//   needs: 'box'        … ダンボール工場を1個以上持っている時だけ
//   when: () => 条件    … 条件が true の時だけ
//   text は文字列でも、流す直前に作る関数でもOK(数字入りのネタ用)
const FLAVOR_NEWS = [
  // いつでも流れる
  { text: '【地域】近所の猫、今日も何もしていないのに可愛いと評判' },
  { text: '【天気】全国的に肉球日和。ところにより毛玉' },
  { text: '【天気】午後から窓辺で日なたぼっこ注意報' },
  { text: '【スポーツ】猫じゃらし100m走、優勝は開始0.2秒で飽きた猫' },
  { text: '【生活】キーボードの上で寝る猫、今年も増加傾向' },
  { text: '【調査】猫が見ている前では仕事がはかどらないと判明' },
  { text: '【科学】猫は液体説、また一歩前進' },
  { text: '【地域】何もない所でつまずいた猫、何事もなかったように毛づくろい' },
  { text: '【生活】「猫の手も借りたい」、実際に借りると余計に忙しくなると判明' },
  { text: '【動物】猫、ドアの前で鳴き、開けると入らない' },
  { text: '【ことわざ】「猫に小判」、最近は「猫にねこポイント」とも' },
  { text: '【経済】ねこポイント、本日も謎の上昇。専門家「猫がかわいいから」' },
  { text: '【健康】猫の喉のゴロゴロ、聞くだけで癒やされると話題' },
  {
    when: () => state.manualClicks >= 100,
    text: () => `【労働】この猫、本日すでに${state.manualClicks.toLocaleString('ja-JP')}回押される。猫「そろそろ時給を」`,
  },

  // 施設を持っている時だけ流れる
  { needs: 'helper', text: '【求人】ねこバイトの時給、カリカリ3粒で合意' },
  {
    needs: 'helper',
    when: () => state.facilityCounts.helper >= 20,
    text: () => `【統計】町のねこバイト、ついに${state.facilityCounts.helper.toLocaleString('ja-JP')}匹を突破`,
  },
  {
    needs: 'helper',
    when: () => state.facilityCounts.helper >= 50,
    text: '【労働】ねこバイト組合「15秒に1回は多すぎる」と主張。直後に全員寝る',
  },
  { needs: 'bowl', text: '【グルメ】自動ごはん皿、また空に。猫「早い」' },
  { needs: 'bowl', text: '【技術】自動ごはん皿、猫の前足で開けられる弱点が見つかる' },
  { needs: 'box', text: '【社会】ダンボール工場、完成品に猫が入ってしまい出荷できず' },
  { needs: 'box', text: '【調査】猫の好きな家具、今年も「箱」が高級ベッドに圧勝' },
  { needs: 'cafe', text: '【グルメ】ねこカフェの新メニュー「なにもしない猫を眺めるセット」が大人気' },
  { needs: 'cafe', text: '【地域】ねこカフェの猫、座る膝を選り好み。選ばれた客は泣いて喜ぶ' },
  { needs: 'stream', text: '【芸能】ねこ配信局の猫、生配信中に寝落ち。同接は過去最高を記録' },
  { needs: 'stream', text: '【芸能】猫があくびするだけの動画、再生1億回を突破' },
  { needs: 'space', text: '【科学】宇宙センターの猫、無重力で丸くなれず困惑' },
  { needs: 'space', text: '【宇宙】月面に謎の肉球の跡。宇宙センターは関与を否定' },
  { needs: 'space', text: '【宇宙】宇宙ねこ、地球を見下ろして「ちいさい」とだけコメント' },
];

// ニュースが流れる速さ(ピクセル/秒)
const NEWS_SPEED_PX_PER_SECOND = 110;

let newsRunning = false;
let newsAnimation = null;
let newsTimerId = null;
let recentNewsKeys = [];

// ------------------------------------------------------------
// 予約ニュース(v20)
// ------------------------------------------------------------
// 施設を初めて買った・アップグレードを買った・まとめ買いの案内、などの「出来事」は、
// 流れているニュースを止めずに「次に流す1本」として予約します。
// たくさん買っても出来事ばかりにならないよう、予約は最新2件まで、
// 出来事を流した次の1本は必ず普通のニュースにします。古い予約(25秒以上前)は捨てます。
const NEWS_EVENT_LIMIT = 2;
const NEWS_EVENT_MAX_AGE_MS = 25000;
let newsEventQueue = [];
let lastNewsKind = null;
let tipStreak = 0; // ヒント系が何本続いたか

function queueNewsEvent(text, kind = 'event') {
  if (!newsRunning) return;
  newsEventQueue = [...newsEventQueue, { key: text, text, kind, at: performance.now() }].slice(-NEWS_EVENT_LIMIT);
}

// 次に流すニュースを選びます。
// 1. 予約された出来事があれば、それを優先(ただし2本続けない)
// 2. ヒント系が2本続いたら、次は必ずネタ
// 3. それ以外は おおよそ ネタ45% / 状況ヒント40% / 豆知識15%
// 直近5本と同じものは避けます。
function pickNews() {
  const now = performance.now();
  newsEventQueue = newsEventQueue.filter((item) => now - item.at <= NEWS_EVENT_MAX_AGE_MS);
  if (newsEventQueue.length > 0 && lastNewsKind !== 'event' && lastNewsKind !== 'hint-event') {
    const event = newsEventQueue.shift();
    return rememberNews(event, event.kind === 'hint' ? 'hint-event' : 'event');
  }

  const notRecent = (key) => !recentNewsKeys.includes(key);

  const situation = SITUATION_NEWS
    .filter((news) => notRecent(news.id) && safeWhen(news))
    .map((news) => ({ key: news.id, text: news.text(), kind: 'hint' }));
  const tips = TIP_NEWS
    .filter((text) => notRecent(text))
    .map((text) => ({ key: text, text, kind: 'tip' }));
  const flavors = FLAVOR_NEWS
    .filter((news) => notRecent(news.text) && isFlavorAvailable(news))
    .map((news) => ({
      key: news.text,
      text: typeof news.text === 'function' ? news.text() : news.text,
      kind: 'flavor',
    }));

  let pool;
  const roll = Math.random();
  if (tipStreak >= 2 && flavors.length > 0) pool = flavors;
  else if (roll < 0.45 && flavors.length > 0) pool = flavors;
  else if (roll < 0.85 && situation.length > 0) pool = situation;
  else pool = tips.length > 0 ? tips : flavors;

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return rememberNews(chosen, chosen.kind);
}

function rememberNews(news, kindForHistory) {
  recentNewsKeys = [...recentNewsKeys, news.key].slice(-5);
  lastNewsKind = kindForHistory;
  tipStreak = news.kind === 'flavor' || news.kind === 'event' ? 0 : tipStreak + 1;
  return news;
}

// ネタニュースを今流してよいか。まだ持っていない施設のネタは流しません。
function isFlavorAvailable(news) {
  if (news.needs && !(state.facilityCounts[news.needs] > 0)) return false;
  if (news.when && !safeWhen(news)) return false;
  return true;
}

// 条件判定でエラーが出てもニュース全体が止まらないように守ります。
function safeWhen(news) {
  try {
    return Boolean(news.when());
  } catch (error) {
    return false;
  }
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 1本のニュースを右端から左端の外まで流し、流れ終わったら次を選びます。
// kind が 'hint'(状況ニュース) の時は文字を黄色にして、少しだけ目立たせます。
function playNews({ text, kind = 'tip' }) {
  if (newsAnimation) newsAnimation.cancel();
  window.clearTimeout(newsTimerId);

  newsTextEl.textContent = text;
  newsTextEl.dataset.kind = kind;

  // 動きを減らす設定の人には、流さずに7秒ごとに切り替えるだけにします。
  if (prefersReducedMotion() || !newsTextEl.animate) {
    newsTextEl.style.transform = 'translateX(0)';
    newsTimerId = window.setTimeout(() => {
      if (newsRunning) playNews(pickNews());
    }, 7000);
    return;
  }

  const trackWidth = newsTextEl.parentElement.clientWidth;
  const textWidth = newsTextEl.scrollWidth;
  const distance = trackWidth + textWidth;

  newsAnimation = newsTextEl.animate(
    [
      { transform: `translateX(${trackWidth}px)` },
      { transform: `translateX(${-textWidth}px)` },
    ],
    { duration: (distance / NEWS_SPEED_PX_PER_SECOND) * 1000, easing: 'linear', fill: 'forwards' },
  );
  newsAnimation.onfinish = () => {
    if (newsRunning) playNews(pickNews());
  };
}

function startNews() {
  newsRunning = true;
  recentNewsKeys = [];
  newsEventQueue = [];
  lastNewsKind = null;
  tipStreak = 0;
  newsTickerEl.classList.add('running');
  // 1本目はカウントダウン中に流れるので、最初にやることを案内します。
  playNews({ text: '【速報】まもなく3分チャレンジ開始。まずは猫を押して、ねこバイトを雇うところから', kind: 'hint' });
}

function stopNews(finalText) {
  newsRunning = false;
  newsTickerEl.classList.remove('running');
  if (newsAnimation) newsAnimation.cancel();
  newsAnimation = null;
  window.clearTimeout(newsTimerId);
  if (finalText) {
    newsTextEl.textContent = finalText;
    newsTextEl.dataset.kind = 'flavor';
    newsTextEl.style.transform = 'translateX(0)';
  }
}

// ------------------------------------------------------------
// 19. ショップタブ / まとめ買い
// ------------------------------------------------------------
facilityTab.addEventListener('click', () => switchShopTab('facilities'));
upgradeTab.addEventListener('click', () => switchShopTab('upgrades'));

function switchShopTab(tabName) {
  activeTab = tabName;
  const showingFacilities = tabName === 'facilities';

  facilityPanel.hidden = !showingFacilities;
  upgradePanel.hidden = showingFacilities;

  facilityTab.classList.toggle('active', showingFacilities);
  upgradeTab.classList.toggle('active', !showingFacilities);
  facilityTab.setAttribute('aria-selected', String(showingFacilities));
  upgradeTab.setAttribute('aria-selected', String(!showingFacilities));

  // まとめ買いは施設タブだけで意味があるので隠します。
  bulkControls.hidden = !showingFacilities;
  if (!showingFacilities) hideBulkNudge();

  // アップグレードタブを開いたら、解禁のお知らせは役目を終えたので消します。
  if (!showingFacilities) {
    clearToast();
    lastUnseenReminderAt = 0;
  }

  // アップグレードタブを開いた時点で、解禁済みの項目を「確認済み」にします。
  if (!showingFacilities) {
    for (const upgrade of UPGRADES) {
      if (!state.purchasedUpgrades.has(upgrade.id) && isUpgradeUnlocked(upgrade)) {
        state.seenUnlockedUpgrades.add(upgrade.id);
      }
    }
  }

  updateUpgradeCards();
  // 今まで非表示だったパネルの数字を、見えるようになった今測り直します。
  flushPendingFits();
}

function setBulkMode(mode) {
  bulkMode = mode;
  // プレイ中に 10 / MAX を選んだら「まとめ買いを知っている人」として案内を止めます。
  if (mode !== '1' && state.isPlaying) hasUsedBulk = true;
  hideBulkNudge();
  document.querySelectorAll('[data-bulk]').forEach((button) => {
    const active = button.dataset.bulk === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  updateFacilityCards();
  flushPendingFits();
}

document.querySelectorAll('[data-bulk]').forEach((button) => {
  button.addEventListener('click', () => setBulkMode(button.dataset.bulk));
});

// ------------------------------------------------------------
// 20. 開始 / 再挑戦
// ------------------------------------------------------------
startButton.addEventListener('click', startGame);

retryButton.addEventListener('click', () => {
  stopAutoReturn();
  hideResult();
  startGame();
});

// ------------------------------------------------------------
// 20-2. 結果画面から自動でタイトルへ戻る（v19, 展示会向け）
// ------------------------------------------------------------
// 結果画面のまま AUTO_RETURN_SECONDS 秒だれも触らなければ、開始前の待機画面へ戻ります。
// 次に来た人が、大きな開始ボタンと猫の画面から始められるようにするためです。
// 画面をタップ・クリック・キー操作・スクロールすると、カウントは最初からやり直し。
// (スマホで撮影している間は画面を触らないので、60秒あれば十分に撮れます)
const AUTO_RETURN_SECONDS = 60;
let autoReturnDeadline = null;
let autoReturnTimerId = null;
const autoReturnTextEl = $('autoReturnText');

function startAutoReturn() {
  autoReturnDeadline = performance.now() + AUTO_RETURN_SECONDS * 1000;
  window.clearInterval(autoReturnTimerId);
  autoReturnTimerId = window.setInterval(tickAutoReturn, 250);
  tickAutoReturn();
}

function stopAutoReturn() {
  window.clearInterval(autoReturnTimerId);
  autoReturnTimerId = null;
  autoReturnDeadline = null;
  autoReturnTextEl.textContent = '';
}

function tickAutoReturn() {
  if (autoReturnDeadline === null) return;
  const secondsLeft = Math.ceil((autoReturnDeadline - performance.now()) / 1000);
  if (secondsLeft <= 0) {
    returnToTitle();
    return;
  }
  autoReturnTextEl.textContent = `操作がないと ${secondsLeft}秒後に タイトルへ戻ります`;
  autoReturnTextEl.classList.toggle('soon', secondsLeft <= 10);
}

// 結果画面を見ている間に何か操作があったら、カウントをやり直します。
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((type) => {
  document.addEventListener(type, () => {
    if (autoReturnDeadline !== null) {
      autoReturnDeadline = performance.now() + AUTO_RETURN_SECONDS * 1000;
      tickAutoReturn();
    }
  }, { passive: true, capture: true });
});

// 開始前の待機画面(ページを開いた直後と同じ状態)へ戻します。
function returnToTitle() {
  stopAutoReturn();
  hideResult();
  state = createInitialState();
  document.body.classList.add('is-idle');
  renderRanking();
  resetShopView();
  updateDisplay();
  refitAll();
}

// 画面サイズが変わったら、数字の大きさを全部測り直します。
// リサイズ中は何十回も呼ばれるので、少し待ってから1回だけ実行します。
let resizeTimerId = null;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimerId);
  resizeTimerId = window.setTimeout(refitAll, 80);
});

// ------------------------------------------------------------
// 21. ページ読み込み時の初期化
// ------------------------------------------------------------
markFit(currencyEl, 66, 40);
markFit(totalScoreEl, 31, 21);
markFit(finalScoreEl, 58, 42);
markFit(clickPowerEl, 15, 13);
markFit(autoCpsEl, 15, 13);
markFit(helperOwnedEl, 15, 13);
[finalClicksEl, finalFacilitiesEl, finalUpgradesEl].forEach((element) => markFit(element, 16));

buildFacilityCards();
buildUpgradeCards();
renderRanking();
setBulkMode('1');
switchShopTab('facilities');
updateDisplay();

// Webフォントの読み込みで文字幅が変わることがあるので、読み込み完了後にも測り直します。
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(refitAll);
}
