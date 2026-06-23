const $ = id => document.getElementById(id);

const controls = {
  symbol: $('symbol'),
  interval: $('interval'),
  start: $('start'),
  end: $('end'),
  lower: $('lower'),
  upper: $('upper'),
  gridStep: $('gridStep'),
  capital: $('capital'),
  leverage: $('leverage'),
  orderUsdt: $('orderUsdt'),
  feeRate: $('feeRate'),
  pathMode: $('pathMode')
};

const runButton = $('runButton');
const optimizeButton = $('optimizeButton');
const saveSettingsButton = $('saveSettingsButton');
const highlightOpenButton = $('highlightOpenButton');
const statusText = $('statusText');
const optimizeStatus = $('optimizeStatus');
const ledgerStatus = $('ledgerStatus');
const tradeRows = $('tradeRows');
const openRows = $('openRows');
const optimizeRows = $('optimizeRows');
const statsList = $('statsList');
const bestBox = $('bestBox');
const stepMin = $('stepMin');
const stepMax = $('stepMax');
const settingsStorageKey = 'btc-grid-backtester-settings-v2';

const symbolPresets = {
  BTCUSDT: { lower: '62000', upper: '66000', gridStep: '100', stepMin: '50', stepMax: '300' },
  ETHUSDT: { lower: '1500', upper: '2000', gridStep: '2', stepMin: '1', stepMax: '20' }
};

const intervalMinRanges = {
  '5m': 3 * 24 * 60 * 60 * 1000,
  '15m': 7 * 24 * 60 * 60 * 1000,
  '30m': 14 * 24 * 60 * 60 * 1000,
  '1h': 30 * 24 * 60 * 60 * 1000,
  '4h': 90 * 24 * 60 * 60 * 1000,
  '1d': 365 * 24 * 60 * 60 * 1000,
  '1w': 3 * 365 * 24 * 60 * 60 * 1000,
  '1M': 5 * 365 * 24 * 60 * 60 * 1000
};

const chartOptions = {
  layout: {
    background: { color: '#181d23' },
    textColor: '#c4ccd6'
  },
  grid: {
    vertLines: { color: '#242b34' },
    horzLines: { color: '#242b34' }
  },
  timeScale: {
    borderColor: '#313a45',
    timeVisible: true,
    secondsVisible: false
  },
  rightPriceScale: {
    borderColor: '#313a45'
  },
  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal
  }
};

const priceChart = LightweightCharts.createChart($('priceChart'), chartOptions);
const candleSeries = priceChart.addCandlestickSeries({
  upColor: '#29b676',
  downColor: '#ef5b5b',
  borderUpColor: '#29b676',
  borderDownColor: '#ef5b5b',
  wickUpColor: '#29b676',
  wickDownColor: '#ef5b5b'
});

const equityChart = LightweightCharts.createChart($('equityChart'), {
  ...chartOptions,
  rightPriceScale: {
    borderColor: '#313a45',
    scaleMargins: { top: 0.15, bottom: 0.15 }
  }
});
const equitySeries = equityChart.addAreaSeries({
  topColor: 'rgba(90, 157, 248, 0.34)',
  bottomColor: 'rgba(90, 157, 248, 0.02)',
  lineColor: '#5a9df8',
  lineWidth: 2
});

let priceLines = [];
let openPositionLines = [];
let currentPayload = null;
let highlightOpenPositions = false;

function fitCharts() {
  priceChart.resize($('priceChart').clientWidth, $('priceChart').clientHeight);
  equityChart.resize($('equityChart').clientWidth, $('equityChart').clientHeight);
}

window.addEventListener('resize', fitCharts);

function toLocalInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initDates() {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
  controls.start.value = toLocalInputValue(start);
  controls.end.value = toLocalInputValue(end);
}

function storageFields() {
  return {
    ...Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.value])),
    stepMin: stepMin.value,
    stepMax: stepMax.value
  };
}

function loadSavedSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}');
    Object.entries(saved).forEach(([key, value]) => {
      if (controls[key]) controls[key].value = value;
    });
    if (saved.stepMin) stepMin.value = saved.stepMin;
    if (saved.stepMax) stepMax.value = saved.stepMax;
  } catch {
    localStorage.removeItem(settingsStorageKey);
  }
}

function saveSettings() {
  localStorage.setItem(settingsStorageKey, JSON.stringify(storageFields()));
  statusText.textContent = '设置已保存，下次打开会自动恢复';
}

function isBtcLikeRange() {
  return Number(controls.upper.value) > 10000;
}

function isEthLikeRange() {
  return Number(controls.upper.value) < 10000;
}

function applySymbolPreset(symbol) {
  const preset = symbolPresets[symbol];
  if (!preset) return;

  const shouldApplyRange =
    (symbol === 'BTCUSDT' && isEthLikeRange()) ||
    (symbol === 'ETHUSDT' && isBtcLikeRange());

  if (!shouldApplyRange) return;

  controls.lower.value = preset.lower;
  controls.upper.value = preset.upper;
  controls.gridStep.value = preset.gridStep;
  stepMin.value = preset.stepMin;
  stepMax.value = preset.stepMax;
}

function normalizedInputValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return Number(number.toFixed(8)).toString();
}

function syncNormalizedSettings(summary) {
  if (!summary) return;
  controls.lower.value = normalizedInputValue(summary.lower);
  controls.upper.value = normalizedInputValue(summary.upper);
  controls.gridStep.value = normalizedInputValue(summary.gridStep);
}

function updateQuickButtons() {
  document.querySelectorAll('[data-symbol]').forEach(button => {
    button.classList.toggle('active', button.dataset.symbol === controls.symbol.value.toUpperCase());
  });
  document.querySelectorAll('[data-interval]').forEach(button => {
    button.classList.toggle('active', button.dataset.interval === controls.interval.value);
  });
}

function ensureRangeForInterval(interval) {
  const minRange = intervalMinRanges[interval];
  if (!minRange) return;

  const end = Date.parse(controls.end.value || '');
  const start = Date.parse(controls.start.value || '');
  const endDate = Number.isFinite(end) ? new Date(end) : new Date();
  const currentRange = Number.isFinite(start) ? endDate.getTime() - start : 0;

  if (currentRange >= minRange * 0.9) return;
  controls.end.value = toLocalInputValue(endDate);
  controls.start.value = toLocalInputValue(new Date(endDate.getTime() - minRange));
}

function formatTime(seconds) {
  return new Date(seconds * 1000).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fmt(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function params() {
  const query = new URLSearchParams();
  Object.entries(controls).forEach(([key, input]) => {
    query.set(key, input.value);
  });
  return query;
}

function stat(label, value, className = '') {
  return `<div class="stat-row"><dt>${label}</dt><dd class="${className}">${value}</dd></div>`;
}

function renderStats(summary) {
  const pnlClass = summary.totalPnl >= 0 ? 'buy' : 'sell';
  const profitFactor = summary.profitFactor === null ? '∞' : fmt(summary.profitFactor, 2);
  statsList.innerHTML = [
    stat('K 线数量', summary.bars),
    stat('起始价格', fmt(summary.startPrice)),
    stat('结束价格', fmt(summary.endPrice)),
    stat('成交路径', summary.pathModeLabel),
    stat('网格间距', fmt(summary.gridInterval)),
    stat('网格格数', summary.gridCount),
    stat('成交总数', summary.totalTrades),
    stat('买入次数', summary.buyCount),
    stat('平仓次数', summary.sellCount),
    stat('未平仓', summary.openLots),
    stat('最大持仓', summary.maxOpenLots),
    stat('资金不足跳过', summary.skippedBuys),
    stat('已实现利润', `${fmt(summary.realizedPnl, 4)} USDT`, summary.realizedPnl >= 0 ? 'buy' : 'sell'),
    stat('浮动盈亏', `${fmt(summary.unrealizedPnl, 4)} USDT`, summary.unrealizedPnl >= 0 ? 'buy' : 'sell'),
    stat('总盈亏', `${fmt(summary.totalPnl, 4)} USDT`, pnlClass),
    stat('收益率', `${fmt(summary.returnPct, 4)}%`, pnlClass),
    stat('手续费', `${fmt(summary.fees, 4)} USDT`),
    stat('最终权益', `${fmt(summary.finalEquity, 4)} USDT`),
    stat('最大回撤', `${fmt(summary.maxDrawdown, 4)} USDT`, 'sell'),
    stat('最大回撤率', `${fmt(summary.maxDrawdownPct, 4)}%`, 'sell'),
    stat('利润因子', profitFactor),
    stat('单笔期望', `${fmt(summary.expectancy, 4)} USDT`, summary.expectancy >= 0 ? 'buy' : 'sell'),
    stat('平均盈利', `${fmt(summary.avgWin, 4)} USDT`, 'buy'),
    stat('平均亏损', `${fmt(summary.avgLoss, 4)} USDT`, 'sell'),
    stat('最大连亏', summary.maxConsecutiveLosses),
    stat('平仓胜率', `${fmt(summary.winRate)}%`)
  ].join('');
}

function renderTrades(trades) {
  const recent = [...trades].reverse().slice(0, 500);
  tradeRows.innerHTML = recent.map(trade => {
    const cls = trade.type === 'buy' ? 'buy' : 'sell';
    const side = trade.type === 'buy' ? '开多' : '平多';
    return `
      <tr>
        <td>#${trade.id}</td>
        <td>${formatTime(trade.time)}</td>
        <td class="${cls}">${side}</td>
        <td>${fmt(trade.price)}</td>
        <td>${fmt(trade.qty, 8)}</td>
        <td>${fmt(trade.fee, 4)}</td>
        <td class="${trade.pnl >= 0 ? 'buy' : 'sell'}">${fmt(trade.pnl, 4)}</td>
      </tr>
    `;
  }).join('');
}

function renderOpenRows(openLots) {
  ledgerStatus.textContent = `${openLots.length} 笔未平仓`;
  openRows.innerHTML = openLots.slice().sort((left, right) => right.entryPrice - left.entryPrice).map(lot => `
    <tr>
      <td>#${lot.id}</td>
      <td>${fmt(lot.entryPrice)}</td>
      <td>${fmt(lot.qty, 8)}</td>
    </tr>
  `).join('');
}

function renderGridLines(levels) {
  priceLines.forEach(line => candleSeries.removePriceLine(line));
  priceLines = levels.map((price, index) => candleSeries.createPriceLine({
    price,
    color: index === 0 || index === levels.length - 1 ? '#d7a642' : '#3a4653',
    lineWidth: index === 0 || index === levels.length - 1 ? 2 : 1,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    axisLabelVisible: index === 0 || index === levels.length - 1,
    title: index === 0 ? 'Lower' : index === levels.length - 1 ? 'Upper' : ''
  }));
}

function renderOpenPositionLines(openLots = []) {
  openPositionLines.forEach(line => candleSeries.removePriceLine(line));
  openPositionLines = [];

  if (!highlightOpenPositions) return;

  openPositionLines = openLots.map(lot => candleSeries.createPriceLine({
    price: lot.entryPrice,
    color: '#ffd54a',
    lineWidth: 2,
    lineStyle: LightweightCharts.LineStyle.Solid,
    axisLabelVisible: true,
    title: `未平 #${lot.id}`
  }));
}

function renderMarkers(trades) {
  const markers = trades.slice(-1200).map(trade => ({
    time: trade.time,
    position: trade.type === 'buy' ? 'belowBar' : 'aboveBar',
    color: trade.type === 'buy' ? '#29b676' : '#ef5b5b',
    shape: trade.type === 'buy' ? 'arrowUp' : 'arrowDown',
    text: trade.type === 'buy' ? `多${trade.id}` : `平${trade.id}`
  }));
  candleSeries.setMarkers(markers);
}

function renderOptimization(payload) {
  if (!payload.best) {
    bestBox.textContent = '没有找到可用结果';
    optimizeRows.innerHTML = '';
    return;
  }

  const best = payload.best;
  bestBox.innerHTML = `
    <strong>最佳间距 ${fmt(best.gridStep)}</strong>
    <span>格数 ${best.gridCount} / 收益 ${fmt(best.totalPnl, 4)} USDT / 回撤 ${fmt(best.maxDrawdown, 4)} USDT</span>
  `;

  optimizeRows.innerHTML = payload.candidates.map((candidate, index) => `
    <tr>
      <td>#${index + 1}</td>
      <td>${fmt(candidate.gridStep)}</td>
      <td>${candidate.gridCount}</td>
      <td class="${candidate.totalPnl >= 0 ? 'buy' : 'sell'}">${fmt(candidate.totalPnl, 4)}</td>
      <td class="sell">${fmt(candidate.maxDrawdown, 4)}</td>
      <td>${fmt(candidate.winRate)}%</td>
    </tr>
  `).join('');
}

async function runBacktest() {
  runButton.disabled = true;
  optimizeButton.disabled = true;
  updateQuickButtons();
  statusText.textContent = `正在拉取 ${controls.symbol.value.toUpperCase()} 数据并回测...`;

  try {
    const response = await fetch(`/api/backtest?${params().toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || '回测失败');
    }

    currentPayload = payload;
    syncNormalizedSettings(payload.summary);
    candleSeries.setData(payload.bars);
    equitySeries.setData(payload.equity.map(point => ({
      time: point.time,
      value: point.value
    })));
    renderGridLines(payload.levels);
    renderOpenPositionLines(payload.openLots);
    renderMarkers(payload.trades);
    renderStats(payload.summary);
    renderTrades(payload.trades);
    renderOpenRows(payload.openLots);
    priceChart.timeScale().fitContent();
    equityChart.timeScale().fitContent();

    statusText.textContent = `${payload.summary.symbol} ${payload.summary.interval}，${formatTime(payload.summary.startTime)} 到 ${formatTime(payload.summary.endTime)}`;
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    runButton.disabled = false;
    optimizeButton.disabled = false;
  }
}

async function runOptimize() {
  runButton.disabled = true;
  optimizeButton.disabled = true;
  optimizeStatus.textContent = '正在优化...';

  try {
    const query = params();
    query.set('stepMin', stepMin.value);
    query.set('stepMax', stepMax.value);
    const response = await fetch(`/api/optimize?${query.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || '优化失败');
    }

    renderOptimization(payload);
    optimizeStatus.textContent = `测试 ${payload.tested} 组，最佳间距 ${payload.best?.gridStep ?? '-'}`;

    if (payload.best) {
      controls.gridStep.value = payload.best.gridStep;
      await runBacktest();
    }
  } catch (error) {
    optimizeStatus.textContent = error.message;
  } finally {
    runButton.disabled = false;
    optimizeButton.disabled = false;
  }
}

initDates();
loadSavedSettings();
updateQuickButtons();
fitCharts();
runButton.addEventListener('click', runBacktest);
optimizeButton.addEventListener('click', runOptimize);
saveSettingsButton.addEventListener('click', saveSettings);
controls.symbol.addEventListener('input', updateQuickButtons);
controls.interval.addEventListener('change', updateQuickButtons);
document.querySelectorAll('[data-symbol]').forEach(button => {
  button.addEventListener('click', () => {
    controls.symbol.value = button.dataset.symbol;
    applySymbolPreset(button.dataset.symbol);
    updateQuickButtons();
    runBacktest();
  });
});
document.querySelectorAll('[data-interval]').forEach(button => {
  button.addEventListener('click', () => {
    controls.interval.value = button.dataset.interval;
    ensureRangeForInterval(button.dataset.interval);
    updateQuickButtons();
    runBacktest();
  });
});
highlightOpenButton.addEventListener('click', () => {
  highlightOpenPositions = !highlightOpenPositions;
  highlightOpenButton.classList.toggle('active', highlightOpenPositions);
  highlightOpenButton.setAttribute('aria-pressed', String(highlightOpenPositions));
  renderOpenPositionLines(currentPayload?.openLots ?? []);
});
runBacktest();
