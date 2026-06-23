const $ = id => document.getElementById(id);

const text = {
  loading: '\u6b63\u5728\u52a0\u8f7d\u884c\u60c5...',
  loadFail: '\u884c\u60c5\u52a0\u8f7d\u5931\u8d25',
  noBars: '\u6ca1\u6709\u62ff\u5230 K \u7ebf\u6570\u636e',
  updated: '\u5df2\u66f4\u65b0',
  added: '\u5df2\u6dfb\u52a0',
  cleared: '\u5df2\u6e05\u9664',
  clickChart: '\u70b9\u51fb\u56fe\u8868\u6dfb\u52a0\u753b\u7ebf',
  clickHLine: '\u70b9\u51fb\u56fe\u8868\u653e\u7f6e\u6c34\u5e73\u7ebf',
  clickTrend1: '\u70b9\u51fb\u7b2c\u4e00\u4e2a\u70b9',
  clickTrend2: '\u518d\u70b9\u51fb\u7b2c\u4e8c\u4e2a\u70b9',
  alertHit: '\u4ef7\u683c\u62a5\u8b66\u89e6\u53d1',
};

const dom = {
  statusText: $('statusText'),
  chartTitle: $('chartTitle'),
  chartRange: $('chartRange'),
  ohlcText: $('ohlcText'),
  refreshButton: $('refreshButton'),
  watchlist: $('watchlist'),
  priceContainer: $('priceChart'),
  volumeContainer: $('volumeChart'),
  chartArea: $('chartArea'),
  secondaryContainer: $('secondaryChart'),
  secondaryPanel: $('secondaryPanel'),
  secondaryTitle: $('secondaryTitle'),
  secondaryRange: $('secondaryRange'),
  sellQuote: $('sellQuote'),
  buyQuote: $('buyQuote'),
  drawingLayer: $('drawingLayer'),
  priceLineInput: $('priceLineInput'),
  priceLineList: $('priceLineList'),
  alertInput: $('alertInput'),
  alertList: $('alertList'),
  drawHint: $('drawHint'),
  secondaryIntervalSelect: $('secondaryIntervalSelect'),
  strategyToggleButton: $('strategyToggleButton'),
  strategySettingsButton: $('strategySettingsButton'),
  strategySettingsPanel: $('strategySettingsPanel'),
  closeStrategySettingsButton: $('closeStrategySettingsButton'),
  atrLowerModeInput: $('atrLowerModeInput'),
  atrUpperModeInput: $('atrUpperModeInput'),
  atrEmaLengthInput: $('atrEmaLengthInput'),
  atrLengthInput: $('atrLengthInput'),
  atrMultiplierInput: $('atrMultiplierInput'),
  atrLineWidthInput: $('atrLineWidthInput'),
  volumeSpikeMultiplierInput: $('volumeSpikeMultiplierInput'),
};

const storageKey = 'local-tradingview-watch-v3';
const watchSymbols = ['BTCUSDC', 'ETHUSDC'];
const intervalLabels = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1w': '1W',
};

const intervalMs = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
};

const chartTheme = {
  layout: {
    background: { color: '#ffffff' },
    textColor: '#111827',
    fontFamily: '"Segoe UI", "Microsoft YaHei", Arial, sans-serif',
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: '#edf0f3' },
    horzLines: { color: '#edf0f3' },
  },
  rightPriceScale: {
    borderColor: '#d9dde3',
    scaleMargins: { top: 0.08, bottom: 0.08 },
  },
  crosshair: {
    mode: LightweightCharts.CrosshairMode.Normal,
    vertLine: { color: '#a5adb8', labelBackgroundColor: '#697386' },
    horzLine: { color: '#a5adb8', labelBackgroundColor: '#697386' },
  },
  localization: {
    locale: 'zh-CN',
    priceFormatter: price => fmt(price),
  },
};

const timeScaleOptions = {
  borderColor: '#d9dde3',
  timeVisible: true,
  secondsVisible: false,
  rightOffset: 8,
  barSpacing: 8,
};

const priceChart = LightweightCharts.createChart(dom.priceContainer, {
  ...chartTheme,
  timeScale: { ...timeScaleOptions, visible: false },
});

const volumeChart = LightweightCharts.createChart(dom.volumeContainer, {
  ...chartTheme,
  rightPriceScale: {
    borderColor: '#d9dde3',
    scaleMargins: { top: 0.1, bottom: 0.02 },
  },
  timeScale: timeScaleOptions,
});

const secondaryChart = LightweightCharts.createChart(dom.secondaryContainer, {
  ...chartTheme,
  timeScale: timeScaleOptions,
});

const candleSeries = priceChart.addCandlestickSeries({
  upColor: '#26a69a',
  downColor: '#f23645',
  borderUpColor: '#26a69a',
  borderDownColor: '#f23645',
  wickUpColor: '#26a69a',
  wickDownColor: '#f23645',
  priceLineColor: '#f23645',
});

const volumeSeries = volumeChart.addHistogramSeries({
  priceFormat: { type: 'volume' },
  priceLineVisible: false,
});

const atrLowerSeries = priceChart.addLineSeries({
  color: '#72e6a7',
  lineWidth: 4,
  priceLineVisible: false,
  lastValueVisible: true,
});

const atrUpperSeries = priceChart.addLineSeries({
  color: '#f48b96',
  lineWidth: 4,
  priceLineVisible: false,
  lastValueVisible: true,
});

const atrMidSeries = priceChart.addLineSeries({
  color: '#111111',
  lineWidth: 2,
  priceLineVisible: false,
  lastValueVisible: false,
});

const sslExitSeries = priceChart.addLineSeries({
  color: '#ff9d00',
  lineWidth: 4,
  priceLineVisible: false,
  lastValueVisible: true,
});

const secondarySeries = secondaryChart.addCandlestickSeries({
  upColor: '#26a69a',
  downColor: '#f23645',
  borderUpColor: '#26a69a',
  borderDownColor: '#f23645',
  wickUpColor: '#26a69a',
  wickDownColor: '#f23645',
  priceLineColor: '#f23645',
});

let state;
let currentBars = [];
let secondaryBars = [];
let liveSocket = null;
let autoRefreshTimer = null;
let syncInProgress = false;
let priceLineHandles = new Map();
let drawingMode = null;
let pendingTrendPoint = null;
let selectedDrawingId = null;
let clipboardDrawing = null;
let pendingMarkKind = null;
let undoStack = [];
let redoStack = [];
let strategyMarkers = [];
let volumeSpikeTimes = new Map();
let lowerVolumeData = { key: null, interval: null, bars: [] };

const railTools = {
  cursor: 'cursorButton',
  trend: 'drawTrendButton',
  hline: 'drawHLineButton',
  rect: 'drawRectButton',
  arrow: 'drawArrowButton',
  text: 'drawTextButton',
  buy: 'markBuyButton',
  sell: 'markSellButton',
  event: 'markEventButton',
};

const defaultStrategySettings = {
  lowerMode: 'support',
  upperMode: 'resistance',
  emaLength: 20,
  atrLength: 14,
  atrMultiplier: 2,
  lineWidth: 4,
  volumeSpikeMultiplier: 2,
};

function defaultState() {
  return {
    symbol: 'BTCUSDC',
    interval: '15m',
    secondaryInterval: '1h',
    secondaryVisible: false,
    strategyIndicator: true,
    strategySettings: { ...defaultStrategySettings },
    live: true,
    uiVersion: 6,
    marks: [],
    priceLines: [],
    drawings: [],
    alerts: [],
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const next = { ...defaultState(), ...saved };
    next.strategySettings = { ...defaultStrategySettings, ...(saved.strategySettings || {}) };
    if (saved.uiVersion !== 6) {
      next.symbol = 'BTCUSDC';
      next.secondaryVisible = false;
    }
    next.uiVersion = 6;
    return next;
  } catch {
    return defaultState();
  }
}

state = loadState();

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function snapshotState() {
  return JSON.stringify({
    marks: state.marks,
    priceLines: state.priceLines,
    drawings: state.drawings,
    alerts: state.alerts,
  });
}

function restoreSnapshot(snapshot) {
  const restored = JSON.parse(snapshot);
  state.marks = restored.marks || [];
  state.priceLines = restored.priceLines || [];
  state.drawings = restored.drawings || [];
  state.alerts = restored.alerts || [];
  saveState();
  applyMarks();
  renderPriceLines();
  renderDrawings();
  renderAlerts();
}

function rememberHistory() {
  undoStack.push(snapshotState());
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState());
  restoreSnapshot(undoStack.pop());
  setStatus('\u5df2\u64a4\u56de');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState());
  restoreSnapshot(redoStack.pop());
  setStatus('\u5df2\u91cd\u505a');
}

function updateRailTools(activeTool = 'cursor') {
  Object.entries(railTools).forEach(([tool, id]) => {
    $(id)?.classList.toggle('active', tool === activeTool);
  });
}

function clearToolMode() {
  drawingMode = null;
  pendingTrendPoint = null;
  pendingMarkKind = null;
  dom.drawHint.textContent = text.clickChart;
  updateRailTools('cursor');
}

function setDrawingMode(mode, hint) {
  drawingMode = mode;
  pendingTrendPoint = null;
  pendingMarkKind = null;
  dom.drawHint.textContent = hint;
  updateRailTools(mode);
}

function syncStrategySettingsInputs() {
  const settings = normalizedStrategySettings();
  dom.atrLowerModeInput.value = settings.lowerMode;
  dom.atrUpperModeInput.value = settings.upperMode;
  dom.atrEmaLengthInput.value = settings.emaLength;
  dom.atrLengthInput.value = settings.atrLength;
  dom.atrMultiplierInput.value = settings.atrMultiplier;
  dom.atrLineWidthInput.value = settings.lineWidth;
  dom.volumeSpikeMultiplierInput.value = settings.volumeSpikeMultiplier;
}

function refreshStrategyVisuals() {
  state.strategySettings = normalizedStrategySettings();
  applyStrategySeriesOptions();
  renderStrategyIndicator();
  candleSeries.setData(decoratedBars());
  renderDrawings();
  saveState();
}

function updateStrategySetting(key, value) {
  state.strategySettings = { ...normalizedStrategySettings(), [key]: value };
  refreshStrategyVisuals();
}

function fmt(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  if (number >= 1_000_000) return `${fmt(number / 1_000_000, 2)}M`;
  if (number >= 1_000) return `${fmt(number / 1_000, 2)}K`;
  return fmt(number, 2);
}

function formatTime(seconds) {
  const date = new Date(seconds * 1000);
  if (['1d', '1w', '1M'].includes(state.interval)) {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setStatus(message, isError = false) {
  dom.statusText.textContent = message;
  dom.statusText.classList.toggle('error', isError);
}

function currentKey() {
  return `${state.symbol}:${state.interval}`;
}

function displaySymbol(symbol = state.symbol) {
  return `${symbol.replace(/\.P$/, '')}.P`;
}

function latestBar() {
  return currentBars[currentBars.length - 1];
}

function seriesPoint(bar, value) {
  return Number.isFinite(value) ? { time: bar.time, value } : null;
}

function ema(values, length) {
  const result = new Array(values.length).fill(null);
  const alpha = 2 / (length + 1);
  let sum = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    sum += value;
    if (index === length - 1) {
      result[index] = sum / length;
    } else if (index > length - 1) {
      result[index] = alpha * value + (1 - alpha) * result[index - 1];
    }
  });
  return result;
}

function sma(values, length) {
  const result = new Array(values.length).fill(null);
  let sum = 0;
  values.forEach((value, index) => {
    sum += Number.isFinite(value) ? value : 0;
    if (index >= length) sum -= Number.isFinite(values[index - length]) ? values[index - length] : 0;
    if (index >= length - 1) result[index] = sum / length;
  });
  return result;
}

function rma(values, length) {
  const result = new Array(values.length).fill(null);
  let seedSum = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    if (index < length) {
      seedSum += value;
      if (index === length - 1) result[index] = seedSum / length;
    } else {
      result[index] = (result[index - 1] * (length - 1) + value) / length;
    }
  });
  return result;
}

function wma(values, length) {
  const result = new Array(values.length).fill(null);
  const denominator = (length * (length + 1)) / 2;
  values.forEach((_, index) => {
    if (index < length - 1) return;
    let sum = 0;
    let valid = true;
    for (let offset = 0; offset < length; offset += 1) {
      const value = values[index - offset];
      if (!Number.isFinite(value)) {
        valid = false;
        break;
      }
      sum += value * (length - offset);
    }
    if (valid) result[index] = sum / denominator;
  });
  return result;
}

function hma(values, length) {
  const half = Math.max(1, Math.round(length / 2));
  const root = Math.max(1, Math.round(Math.sqrt(length)));
  const fast = wma(values, half);
  const slow = wma(values, length);
  const diff = values.map((_, index) => (
    Number.isFinite(fast[index]) && Number.isFinite(slow[index]) ? fast[index] * 2 - slow[index] : null
  ));
  return wma(diff, root);
}

function movingAverage(type, values, length) {
  if (type === 'HMA') return hma(values, length);
  if (type === 'EMA') return ema(values, length);
  if (type === 'SMA') return sma(values, length);
  if (type === 'RMA') return rma(values, length);
  return wma(values, length);
}

function clampNumber(value, fallback, min, max = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizedStrategySettings() {
  const current = { ...defaultStrategySettings, ...(state.strategySettings || {}) };
  return {
    lowerMode: current.lowerMode === 'resistance' ? 'resistance' : 'support',
    upperMode: current.upperMode === 'support' ? 'support' : 'resistance',
    emaLength: Math.round(clampNumber(current.emaLength, defaultStrategySettings.emaLength, 1, 500)),
    atrLength: Math.round(clampNumber(current.atrLength, defaultStrategySettings.atrLength, 1, 500)),
    atrMultiplier: clampNumber(current.atrMultiplier, defaultStrategySettings.atrMultiplier, 0.1, 50),
    lineWidth: Math.round(clampNumber(current.lineWidth, defaultStrategySettings.lineWidth, 1, 10)),
    volumeSpikeMultiplier: clampNumber(current.volumeSpikeMultiplier, defaultStrategySettings.volumeSpikeMultiplier, 0.1, 50),
  };
}

function applyStrategySeriesOptions() {
  const settings = normalizedStrategySettings();
  const width = settings.lineWidth;
  atrLowerSeries.applyOptions({ lineWidth: width });
  atrUpperSeries.applyOptions({ lineWidth: width });
  sslExitSeries.applyOptions({ lineWidth: width });
  atrMidSeries.applyOptions({ lineWidth: Math.max(1, width - 1) });
}

function lowerVolumeInterval(interval) {
  if (['1m', '5m', '15m', '30m'].includes(interval)) return '1m';
  if (interval === '1h') return '5m';
  if (interval === '4h') return '15m';
  if (interval === '1d') return '1h';
  if (interval === '1w') return '4h';
  return null;
}

function splitLowerVolumeByParent(parentBars, lowerBars) {
  const splits = new Map();
  if (!parentBars.length || !lowerBars.length) return splits;

  const sortedLowerBars = [...lowerBars].sort((left, right) => left.time - right.time);
  const parentStep = intervalMs[state.interval] ? intervalMs[state.interval] / 1000 : 0;
  let lowerIndex = 0;
  let previousClose = null;

  parentBars.forEach((bar, index) => {
    const start = bar.time;
    const end = parentBars[index + 1]?.time ?? (parentStep ? bar.time + parentStep : bar.time + 1);

    while (lowerIndex < sortedLowerBars.length && sortedLowerBars[lowerIndex].time < start) {
      previousClose = sortedLowerBars[lowerIndex].close;
      lowerIndex += 1;
    }

    let buyVolume = 0;
    let sellVolume = 0;
    let totalVolume = 0;
    let scanIndex = lowerIndex;

    while (scanIndex < sortedLowerBars.length && sortedLowerBars[scanIndex].time < end) {
      const lowerBar = sortedLowerBars[scanIndex];
      if (previousClose == null || lowerBar.close >= previousClose) {
        buyVolume += lowerBar.volume;
      } else {
        sellVolume += lowerBar.volume;
      }
      totalVolume += lowerBar.volume;
      previousClose = lowerBar.close;
      scanIndex += 1;
    }

    lowerIndex = scanIndex;
    if (totalVolume > 0) splits.set(bar.time, { buyVolume, sellVolume, totalVolume });
  });

  return splits;
}

function currentLowerVolumeSplits(bars) {
  if (lowerVolumeData.key !== currentKey()) return new Map();
  return splitLowerVolumeByParent(bars, lowerVolumeData.bars);
}

function normalizeMark(mark) {
  const isBuy = mark.kind === 'buy';
  const isSell = mark.kind === 'sell';
  return {
    time: mark.time,
    position: isSell ? 'aboveBar' : 'belowBar',
    color: isBuy ? '#26a69a' : isSell ? '#ef5350' : '#f2c94c',
    shape: isBuy ? 'arrowUp' : isSell ? 'arrowDown' : 'circle',
    text: mark.label,
  };
}

function calculateStrategyIndicator(bars) {
  const settings = normalizedStrategySettings();
  const emaLength = settings.emaLength;
  const atrLength = settings.atrLength;
  const atrMultiplier = settings.atrMultiplier;
  const sslLength = 15;
  const volumeLength = 20;
  const volumeMultiplier = settings.volumeSpikeMultiplier;
  const closes = bars.map(bar => bar.close);
  const highs = bars.map(bar => bar.high);
  const lows = bars.map(bar => bar.low);
  const volumes = bars.map(bar => bar.volume);
  const volumeSplits = currentLowerVolumeSplits(bars);
  const trueRanges = bars.map((bar, index) => {
    const previousClose = index > 0 ? bars[index - 1].close : bar.close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose)
    );
  });

  const emaMid = ema(closes, emaLength);
  const atr = rma(trueRanges, atrLength);
  const sslHigh = movingAverage('WMA', highs, sslLength);
  const sslLow = movingAverage('WMA', lows, sslLength);
  const volumeAverage = sma(volumes, volumeLength);
  const lower = [];
  const upper = [];
  const sslExit = [];
  const markers = [];
  const spikes = new Map();
  let sslTrend = null;

  bars.forEach((bar, index) => {
    const mid = emaMid[index];
    const atrValue = atr[index];
    const lowerSign = settings.lowerMode === 'support' ? -1 : 1;
    const upperSign = settings.upperMode === 'support' ? -1 : 1;
    lower.push(Number.isFinite(mid) && Number.isFinite(atrValue) ? mid + atrValue * atrMultiplier * lowerSign : null);
    upper.push(Number.isFinite(mid) && Number.isFinite(atrValue) ? mid + atrValue * atrMultiplier * upperSign : null);

    if (Number.isFinite(sslHigh[index]) && bar.close > sslHigh[index]) {
      sslTrend = 1;
    } else if (Number.isFinite(sslLow[index]) && bar.close < sslLow[index]) {
      sslTrend = -1;
    }
    sslExit.push(sslTrend < 0 ? sslHigh[index] : sslLow[index]);

    if (index > 0 && Number.isFinite(sslExit[index]) && Number.isFinite(sslExit[index - 1])) {
      const previousClose = bars[index - 1].close;
      const previousExit = sslExit[index - 1];
      const crossLong = previousClose <= previousExit && bar.close > sslExit[index];
      const crossShort = previousClose >= previousExit && bar.close < sslExit[index];
      if (crossLong) {
        markers.push({
          time: bar.time,
          position: 'belowBar',
          color: '#00aeea',
          shape: 'arrowUp',
        });
      } else if (crossShort) {
        markers.push({
          time: bar.time,
          position: 'aboveBar',
          color: '#ff0062',
          shape: 'arrowDown',
        });
      }
    }

    const isHighVolume = Number.isFinite(volumeAverage[index]) && bar.volume >= volumeAverage[index] * volumeMultiplier;
    if (isHighVolume) {
      const split = volumeSplits.get(bar.time);
      if (!split) return;
      const isBuyVolume = split.buyVolume >= split.sellVolume;
      const multiplier = bar.volume / volumeAverage[index];
      spikes.set(bar.time, { side: isBuyVolume ? 'buy' : 'sell', multiplier });
      if (multiplier >= settings.volumeSpikeMultiplier) {
        markers.push({
          time: bar.time,
          position: 'aboveBar',
          color: isBuyVolume ? '#089981' : '#f23645',
          shape: 'circle',
          text: `${fmt(multiplier, 1)}x`,
        });
      }
    }
  });

  return { emaMid, lower, upper, sslExit, markers, spikes };
}

function strategyLineData(bars, values) {
  return bars.map((bar, index) => seriesPoint(bar, values[index])).filter(Boolean);
}

function clearStrategyIndicator() {
  atrLowerSeries.setData([]);
  atrUpperSeries.setData([]);
  atrMidSeries.setData([]);
  sslExitSeries.setData([]);
  strategyMarkers = [];
  volumeSpikeTimes = new Map();
}

function renderStrategyIndicator() {
  if (!state.strategyIndicator || !currentBars.length) {
    clearStrategyIndicator();
    applyMarks();
    return;
  }

  const indicator = calculateStrategyIndicator(currentBars);
  atrLowerSeries.setData(strategyLineData(currentBars, indicator.lower));
  atrUpperSeries.setData(strategyLineData(currentBars, indicator.upper));
  atrMidSeries.setData(strategyLineData(currentBars, indicator.emaMid));
  sslExitSeries.setData(strategyLineData(currentBars, indicator.sslExit));
  strategyMarkers = indicator.markers;
  volumeSpikeTimes = indicator.spikes;
  applyMarks();
}

function candleColor(bar) {
  const spike = volumeSpikeTimes.get(bar.time);
  if (state.strategyIndicator && spike?.side === 'buy') {
    return { color: '#00b050', borderColor: '#00b050', wickColor: '#00b050' };
  }
  if (state.strategyIndicator && spike?.side === 'sell') {
    return { color: '#d62828', borderColor: '#d62828', wickColor: '#d62828' };
  }
  const up = bar.close >= bar.open;
  return {
    color: up ? '#26a69a' : '#f23645',
    borderColor: up ? '#26a69a' : '#f23645',
    wickColor: up ? '#26a69a' : '#f23645',
  };
}

function decoratedBars() {
  return currentBars.map(bar => ({ ...bar, ...candleColor(bar) }));
}

function marksForCurrentChart() {
  const manualMarkers = state.marks
    .filter(mark => mark.key === currentKey())
    .sort((left, right) => left.time - right.time)
    .map(normalizeMark);
  return [...manualMarkers, ...strategyMarkers].sort((left, right) => left.time - right.time);
}

function applyMarks() {
  candleSeries.setMarkers(marksForCurrentChart());
}

function updateHeader(payload) {
  dom.chartTitle.textContent = `${displaySymbol(payload.symbol)} ${intervalLabels[payload.interval] || payload.interval}`;

  if (!payload.bars.length) {
    dom.chartRange.textContent = text.noBars;
    return;
  }

  const first = payload.bars[0];
  const last = payload.bars[payload.bars.length - 1];
  dom.chartRange.textContent = `${formatTime(first.time)} - ${formatTime(last.time)}, ${payload.bars.length} bars`;
}

function setOhlc(bar) {
  if (!bar) {
    dom.ohlcText.textContent = 'O --  H --  L --  C --  Vol --';
    return;
  }

  const change = bar.close - bar.open;
  const changePercent = bar.open ? (change / bar.open) * 100 : 0;
  const sign = change >= 0 ? '+' : '';
  dom.ohlcText.textContent = `O ${fmt(bar.open)}  H ${fmt(bar.high)}  L ${fmt(bar.low)}  C ${fmt(bar.close)}  ${sign}${fmt(changePercent, 2)}%  Vol ${fmtVolume(bar.volume)}`;
  dom.ohlcText.classList.toggle('up', change >= 0);
  dom.ohlcText.classList.toggle('down', change < 0);
  dom.sellQuote.textContent = fmt(bar.close);
  dom.buyQuote.textContent = fmt(bar.close);
}

function applyBars(bars) {
  currentBars = bars;
  lowerVolumeData = { key: currentKey(), interval: lowerVolumeInterval(state.interval), bars: [] };
  renderStrategyIndicator();
  candleSeries.setData(decoratedBars());
  applyMarks();
  volumeSeries.setData(currentBars.map(bar => ({
    time: bar.time,
    value: bar.volume,
    color: bar.close >= bar.open ? 'rgba(38, 166, 154, 0.55)' : 'rgba(239, 83, 80, 0.55)',
  })));
  renderPriceLines();
  renderDrawings();
  setOhlc(latestBar());
  checkAlerts(latestBar()?.close);
}

function applyLiveBar(bar) {
  const existing = currentBars[currentBars.length - 1];
  if (!existing || existing.time < bar.time) {
    currentBars.push(bar);
  } else if (existing.time === bar.time) {
    currentBars[currentBars.length - 1] = bar;
  }

  renderStrategyIndicator();
  candleSeries.setData(decoratedBars());
  applyMarks();
  volumeSeries.setData(currentBars.map(item => ({
    time: item.time,
    value: item.volume,
    color: item.close >= item.open ? 'rgba(38, 166, 154, 0.55)' : 'rgba(239, 83, 80, 0.55)',
  })));
  renderDrawings();
  setOhlc(bar);
  checkAlerts(bar.close);
}

function focusLatestBars() {
  if (!currentBars.length) return;
  const visibleBars = Math.min(180, currentBars.length);
  const lastIndex = currentBars.length - 1;
  const range = {
    from: Math.max(0, lastIndex - visibleBars),
    to: lastIndex + 8,
  };
  priceChart.timeScale().setVisibleLogicalRange(range);
  volumeChart.timeScale().setVisibleLogicalRange(range);
}

async function fetchBars(symbol, interval, range = {}) {
  const query = new URLSearchParams({ symbol, interval });
  if (Number.isFinite(range.startMs)) query.set('startMs', String(Math.floor(range.startMs)));
  if (Number.isFinite(range.endMs)) query.set('endMs', String(Math.floor(range.endMs)));
  const response = await fetch(`/api/klines?${query.toString()}`, { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || text.loadFail);
  return payload;
}

async function loadLowerVolumeData() {
  const lowerInterval = lowerVolumeInterval(state.interval);
  if (!lowerInterval || !currentBars.length) return;

  const key = currentKey();
  const visibleParentBars = currentBars.slice(-260);
  const first = visibleParentBars[0];
  const last = visibleParentBars[visibleParentBars.length - 1];
  if (!first || !last) return;

  const lowerStep = intervalMs[lowerInterval] || 60_000;
  const parentStep = intervalMs[state.interval] || 900_000;
  const startMs = first.time * 1000 - lowerStep;
  const endMs = last.time * 1000 + parentStep;

  try {
    const payload = await fetchBars(state.symbol, lowerInterval, { startMs, endMs });
    if (key !== currentKey()) return;
    lowerVolumeData = { key, interval: lowerInterval, bars: payload.bars };
    renderStrategyIndicator();
    candleSeries.setData(decoratedBars());
    renderDrawings();
  } catch {
    lowerVolumeData = { key, interval: lowerInterval, bars: [] };
  }
}

async function loadChart({ fit = true, silent = false } = {}) {
  dom.refreshButton.disabled = true;
  updateButtons();
  saveState();

  if (!silent) {
    setStatus(`${text.loading} ${state.symbol} ${intervalLabels[state.interval] || state.interval}`);
  }

  try {
    const payload = await fetchBars(state.symbol, state.interval);
    applyBars(payload.bars);
    updateHeader(payload);

    if (fit) focusLatestBars();

    setStatus(`${text.updated}: ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`);
    connectLiveSocket();
    loadLowerVolumeData();
  } catch (error) {
    setStatus(error.message || text.loadFail, true);
  } finally {
    dom.refreshButton.disabled = false;
  }
}

async function loadSecondary({ fit = true } = {}) {
  if (!state.secondaryVisible) return;

  try {
    const payload = await fetchBars(state.symbol, state.secondaryInterval);
    secondaryBars = payload.bars;
    secondarySeries.setData(secondaryBars);
    dom.secondaryTitle.textContent = `${displaySymbol(payload.symbol)} ${intervalLabels[payload.interval] || payload.interval}`;
    dom.secondaryRange.textContent = `${payload.bars.length} bars`;
    if (fit) secondaryChart.timeScale().fitContent();
  } catch {
    dom.secondaryRange.textContent = text.loadFail;
  }
}

function resizeCharts() {
  const priceRect = dom.priceContainer.getBoundingClientRect();
  const volumeRect = dom.volumeContainer.getBoundingClientRect();
  const secondaryRect = dom.secondaryContainer.getBoundingClientRect();

  if (priceRect.width && priceRect.height) priceChart.resize(priceRect.width, priceRect.height);
  if (volumeRect.width && volumeRect.height) volumeChart.resize(volumeRect.width, volumeRect.height);
  if (secondaryRect.width && secondaryRect.height) secondaryChart.resize(secondaryRect.width, secondaryRect.height);
  renderDrawings();
}

function updateButtons() {
  document.querySelectorAll('[data-symbol]').forEach(button => {
    button.classList.toggle('active', button.dataset.symbol === state.symbol);
  });
  document.querySelectorAll('[data-interval]').forEach(button => {
    button.classList.toggle('active', button.dataset.interval === state.interval);
  });
  $('liveToggleButton').classList.toggle('active', state.live);
  dom.strategyToggleButton.classList.toggle('active', state.strategyIndicator);
  $('secondaryToggleButton').classList.toggle('active', state.secondaryVisible);
  dom.chartArea.classList.toggle('secondary-hidden', !state.secondaryVisible);
  dom.secondaryPanel.classList.toggle('hidden', !state.secondaryVisible);
  dom.secondaryIntervalSelect.value = state.secondaryInterval;
}

function renderWatchlist() {
  dom.watchlist.innerHTML = '';
  watchSymbols.forEach(symbol => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool-button';
    button.dataset.symbol = symbol;
    button.textContent = displaySymbol(symbol);
    button.addEventListener('click', () => {
      state.symbol = symbol;
      clearToolMode();
      saveState();
      loadChart();
      loadSecondary();
    });
    dom.watchlist.appendChild(button);
  });
}

function addMark(kind) {
  const label = kind === 'buy' ? 'B' : kind === 'sell' ? 'S' : 'E';
  pendingMarkKind = kind;
  drawingMode = null;
  pendingTrendPoint = null;
  dom.drawHint.textContent = `\u70b9\u51fb K \u7ebf\u653e\u7f6e ${label} \u6807\u8bb0`;
  updateRailTools(kind);
}

function placeMark(kind, point) {
  const bar = currentBars.reduce((closest, item) => {
    if (!closest) return item;
    return Math.abs(item.time - point.time) < Math.abs(closest.time - point.time) ? item : closest;
  }, null);
  if (!bar) return;

  const label = kind === 'buy' ? 'B' : kind === 'sell' ? 'S' : 'E';
  rememberHistory();
  state.marks.push({
    id: crypto.randomUUID(),
    key: currentKey(),
    kind,
    time: bar.time,
    price: point.price || bar.close,
    label,
  });
  clearToolMode();
  saveState();
  applyMarks();
  setStatus(`${text.added}: ${label} ${fmt(point.price || bar.close)}`);
}

function clearMarks() {
  rememberHistory();
  state.marks = state.marks.filter(mark => mark.key !== currentKey());
  saveState();
  applyMarks();
  setStatus(text.cleared);
}

function renderPriceLines() {
  priceLineHandles.forEach(handle => candleSeries.removePriceLine(handle));
  priceLineHandles = new Map();

  state.priceLines
    .filter(line => line.symbol === state.symbol)
    .forEach(line => {
      const handle = candleSeries.createPriceLine({
        price: line.price,
        color: line.color || '#d6b25e',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: line.label || 'line',
      });
      priceLineHandles.set(line.id, handle);
    });

  renderPriceLineList();
}

function addPriceLine(price, label = 'line') {
  const value = Number(price);
  if (!Number.isFinite(value)) return;

  rememberHistory();
  state.priceLines.push({
    id: crypto.randomUUID(),
    symbol: state.symbol,
    price: value,
    label,
    color: '#d6b25e',
  });
  saveState();
  renderPriceLines();
  setStatus(`${text.added}: ${fmt(value)}`);
}

function removePriceLine(id) {
  rememberHistory();
  state.priceLines = state.priceLines.filter(line => line.id !== id);
  saveState();
  renderPriceLines();
}

function renderPriceLineList() {
  dom.priceLineList.innerHTML = '';
  state.priceLines
    .filter(line => line.symbol === state.symbol)
    .forEach(line => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'list-item';
      item.textContent = `${line.label} ${fmt(line.price)}`;
      item.addEventListener('click', () => removePriceLine(line.id));
      dom.priceLineList.appendChild(item);
    });
}

function addAlert(direction) {
  const value = Number(dom.alertInput.value || latestBar()?.close);
  if (!Number.isFinite(value)) return;

  rememberHistory();
  state.alerts.push({
    id: crypto.randomUUID(),
    symbol: state.symbol,
    direction,
    price: value,
    active: true,
  });
  dom.alertInput.value = '';
  saveState();
  renderAlerts();
  setStatus(`${text.added}: ${direction} ${fmt(value)}`);
}

function removeAlert(id) {
  rememberHistory();
  state.alerts = state.alerts.filter(alert => alert.id !== id);
  saveState();
  renderAlerts();
}

function renderAlerts() {
  dom.alertList.innerHTML = '';
  state.alerts
    .filter(alert => alert.symbol === state.symbol)
    .forEach(alert => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `list-item ${alert.active ? '' : 'muted'}`;
      item.textContent = `${alert.direction === 'above' ? '>' : '<'} ${fmt(alert.price)}`;
      item.addEventListener('click', () => removeAlert(alert.id));
      dom.alertList.appendChild(item);
    });
}

function checkAlerts(price) {
  if (!Number.isFinite(price)) return;

  let changed = false;
  state.alerts.forEach(alert => {
    if (!alert.active || alert.symbol !== state.symbol) return;
    const hit = alert.direction === 'above' ? price >= alert.price : price <= alert.price;
    if (!hit) return;

    alert.active = false;
    changed = true;
    setStatus(`${text.alertHit}: ${state.symbol} ${fmt(price)}`);
    beep();
  });

  if (changed) {
    saveState();
    renderAlerts();
  }
}

function beep() {
  try {
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.18);
  } catch {
    // Browsers may block audio until the user interacts with the page.
  }
}

function chartPointToData(param) {
  if (!param.point || param.time === undefined) return null;
  const price = candleSeries.coordinateToPrice(param.point.y);
  if (!Number.isFinite(price)) return null;
  return { time: param.time, price };
}

function addTwoPointDrawing(type, start, end) {
  rememberHistory();
  state.drawings.push({
    id: crypto.randomUUID(),
    key: currentKey(),
    type,
    start,
    end,
    color: type === 'rect' ? '#2962ff' : '#159980',
    text: type === 'text' ? 'Text' : '',
  });
  selectedDrawingId = state.drawings[state.drawings.length - 1].id;
  clearToolMode();
  saveState();
  renderDrawings();
}

function addOnePointDrawing(type, point) {
  const nextTime = currentBars.find(bar => bar.time > point.time)?.time ?? point.time;
  const endPrice = type === 'text' ? point.price : point.price * 1.003;
  rememberHistory();
  state.drawings.push({
    id: crypto.randomUUID(),
    key: currentKey(),
    type,
    start: point,
    end: { time: nextTime, price: endPrice },
    color: type === 'arrow' ? '#2962ff' : '#111827',
    text: type === 'text' ? window.prompt('\u8f93\u5165\u6587\u5b57', '\u5907\u6ce8') || '\u5907\u6ce8' : '',
  });
  selectedDrawingId = state.drawings[state.drawings.length - 1].id;
  clearToolMode();
  saveState();
  renderDrawings();
}

function handleChartClick(param) {
  const point = chartPointToData(param);
  if (!point) return;

  if (pendingMarkKind) {
    placeMark(pendingMarkKind, point);
    return;
  }

  if (!drawingMode) return;

  if (drawingMode === 'hline') {
    addPriceLine(point.price, 'H');
    clearToolMode();
    return;
  }

  if (drawingMode === 'arrow' || drawingMode === 'text') {
    addOnePointDrawing(drawingMode, point);
    return;
  }

  if (drawingMode === 'trend' || drawingMode === 'rect') {
    if (!pendingTrendPoint) {
      pendingTrendPoint = point;
      dom.drawHint.textContent = text.clickTrend2;
      return;
    }

    addTwoPointDrawing(drawingMode, pendingTrendPoint, point);
  }
}

function clearDrawings() {
  rememberHistory();
  state.drawings = state.drawings.filter(drawing => drawing.key !== currentKey());
  clearToolMode();
  selectedDrawingId = null;
  saveState();
  renderDrawings();
}

function selectDrawing(id) {
  selectedDrawingId = id;
  renderDrawings();
}

function deleteSelectedDrawing() {
  if (!selectedDrawingId) return;
  rememberHistory();
  state.drawings = state.drawings.filter(drawing => drawing.id !== selectedDrawingId);
  selectedDrawingId = null;
  saveState();
  renderDrawings();
}

function copySelectedDrawing() {
  const drawing = state.drawings.find(item => item.id === selectedDrawingId);
  if (!drawing) return;
  clipboardDrawing = JSON.parse(JSON.stringify(drawing));
  setStatus('\u5df2\u590d\u5236\u753b\u56fe\u5bf9\u8c61');
}

function pasteDrawing() {
  if (!clipboardDrawing) return;
  rememberHistory();
  const copy = JSON.parse(JSON.stringify(clipboardDrawing));
  copy.id = crypto.randomUUID();
  copy.key = currentKey();
  copy.start.price *= 1.001;
  copy.end.price *= 1.001;
  state.drawings.push(copy);
  selectedDrawingId = copy.id;
  saveState();
  renderDrawings();
}

function dataToPoint(data) {
  const x = priceChart.timeScale().timeToCoordinate(data.time);
  const y = candleSeries.priceToCoordinate(data.price);
  if (x == null || y == null) return null;
  return { x, y };
}

function svgElement(name, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function decorateShape(node, drawing) {
  node.classList.add('shape-hit');
  if (drawing.id === selectedDrawingId) node.classList.add('shape-selected');
  node.addEventListener('click', event => {
    event.stopPropagation();
    selectDrawing(drawing.id);
  });
  return node;
}

function renderArrow(drawing, start, end) {
  const group = decorateShape(svgElement('g'), drawing);
  const line = svgElement('line', {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stroke: drawing.color || '#2962ff',
    'stroke-width': 2,
  });
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = 10;
  const left = {
    x: end.x - headLength * Math.cos(angle - Math.PI / 6),
    y: end.y - headLength * Math.sin(angle - Math.PI / 6),
  };
  const right = {
    x: end.x - headLength * Math.cos(angle + Math.PI / 6),
    y: end.y - headLength * Math.sin(angle + Math.PI / 6),
  };
  const head = svgElement('path', {
    d: `M ${end.x} ${end.y} L ${left.x} ${left.y} M ${end.x} ${end.y} L ${right.x} ${right.y}`,
    stroke: drawing.color || '#2962ff',
    'stroke-width': 2,
    fill: 'none',
  });
  group.append(line, head);
  dom.drawingLayer.appendChild(group);
}

function renderStrategyOverlays(rect) {
  if (!state.strategyIndicator || !volumeSpikeTimes.size) return;

  const settings = normalizedStrategySettings();
  volumeSpikeTimes.forEach((spike, time) => {
    if (!spike || spike.multiplier < settings.volumeSpikeMultiplier) return;
    const x = priceChart.timeScale().timeToCoordinate(time);
    const width = Math.max(8, Math.min(18, 6 + spike.multiplier * 2));
    if (x == null || x < -width || x > rect.width + width) return;
    const opacity = spike.multiplier >= 9 ? 0.9 : Math.max(0.08, Math.min(0.9, Math.round(spike.multiplier) / 10));
    dom.drawingLayer.appendChild(svgElement('rect', {
      x: x - width / 2,
      y: 0,
      width,
      height: rect.height,
      fill: spike.side === 'buy' ? `rgba(0, 176, 80, ${opacity})` : `rgba(242, 54, 69, ${opacity})`,
    }));
  });
}

function renderDrawings() {
  dom.drawingLayer.innerHTML = '';
  const rect = dom.priceContainer.getBoundingClientRect();
  dom.drawingLayer.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  renderStrategyOverlays(rect);

  state.drawings
    .filter(drawing => drawing.key === currentKey())
    .forEach(drawing => {
      const start = dataToPoint(drawing.start);
      const end = dataToPoint(drawing.end);
      if (!start || !end) return;

      if (drawing.type === 'trend') {
        dom.drawingLayer.appendChild(decorateShape(svgElement('line', {
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          stroke: drawing.color || '#159980',
          'stroke-width': 2,
          'stroke-dasharray': '6 4',
        }), drawing));
        return;
      }

      if (drawing.type === 'rect') {
        dom.drawingLayer.appendChild(decorateShape(svgElement('rect', {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x),
          height: Math.abs(end.y - start.y),
          stroke: drawing.color || '#2962ff',
          'stroke-width': 2,
          fill: 'rgba(41, 98, 255, 0.12)',
        }), drawing));
        return;
      }

      if (drawing.type === 'arrow') {
        renderArrow(drawing, start, end);
        return;
      }

      if (drawing.type === 'text') {
        dom.drawingLayer.appendChild(decorateShape(svgElement('text', {
          x: start.x,
          y: start.y,
          fill: drawing.color || '#111827',
          'font-size': 16,
          'font-weight': 700,
        }), drawing)).textContent = drawing.text || 'Text';
      }
    });
}

function connectLiveSocket() {
  if (liveSocket) {
    liveSocket.close();
    liveSocket = null;
  }

  if (!state.live) return;

  const stream = `${state.symbol.toLowerCase()}@kline_${state.interval}`;
  liveSocket = new WebSocket(`wss://fstream.binance.com/ws/${stream}`);

  liveSocket.onmessage = event => {
    const data = JSON.parse(event.data);
    const k = data.k;
    if (!k) return;
    applyLiveBar({
      time: Math.floor(Number(k.t) / 1000),
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
      volume: Number(k.v),
    });
  };

  liveSocket.onerror = () => setStatus('\u5b9e\u65f6\u8fde\u63a5\u65ad\u5f00\uff0c\u6b63\u5728\u4f7f\u7528\u5b9a\u65f6\u5237\u65b0', true);
}

function resetAutoRefresh() {
  window.clearInterval(autoRefreshTimer);
  autoRefreshTimer = window.setInterval(() => {
    loadChart({ fit: false, silent: true });
    loadSecondary({ fit: false });
  }, 30_000);
}

function syncVisibleRange(source, target) {
  source.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (syncInProgress || !range) return;
    syncInProgress = true;
    target.timeScale().setVisibleLogicalRange(range);
    syncInProgress = false;
    renderDrawings();
  });
}

function downloadScreenshot() {
  const panel = document.querySelector('.chart-panel');
  const rect = panel.getBoundingClientRect();
  const output = document.createElement('canvas');
  output.width = Math.floor(rect.width * devicePixelRatio);
  output.height = Math.floor(rect.height * devicePixelRatio);
  const ctx = output.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);

  panel.querySelectorAll('canvas').forEach(canvas => {
    const box = canvas.getBoundingClientRect();
    ctx.drawImage(canvas, box.left - rect.left, box.top - rect.top, box.width, box.height);
  });

  const link = document.createElement('a');
  link.download = `${state.symbol}-${state.interval}.png`;
  link.href = output.toDataURL('image/png');
  link.click();
}

function wireEvents() {
  document.querySelectorAll('[data-interval]').forEach(button => {
    button.addEventListener('click', () => {
      state.interval = button.dataset.interval;
      clearToolMode();
      saveState();
      loadChart();
      resetAutoRefresh();
    });
  });

  dom.refreshButton.addEventListener('click', () => {
    loadChart({ fit: false });
    loadSecondary({ fit: false });
    resetAutoRefresh();
  });

  $('undoButton').addEventListener('click', undo);
  $('redoButton').addEventListener('click', redo);
  $('markBuyButton').addEventListener('click', () => addMark('buy'));
  $('markSellButton').addEventListener('click', () => addMark('sell'));
  $('markEventButton').addEventListener('click', () => addMark('event'));
  $('clearMarksButton').addEventListener('click', clearMarks);
  $('cursorButton').addEventListener('click', clearToolMode);

  $('addPriceLineButton').addEventListener('click', () => {
    addPriceLine(dom.priceLineInput.value || latestBar()?.close);
    dom.priceLineInput.value = '';
  });

  $('drawHLineButton').addEventListener('click', () => {
    setDrawingMode('hline', text.clickHLine);
  });

  $('drawTrendButton').addEventListener('click', () => {
    setDrawingMode('trend', text.clickTrend1);
  });

  $('drawRectButton').addEventListener('click', () => {
    setDrawingMode('rect', '\u70b9\u51fb\u77e9\u5f62\u7b2c\u4e00\u4e2a\u89d2');
  });

  $('drawArrowButton').addEventListener('click', () => {
    setDrawingMode('arrow', '\u70b9\u51fb\u653e\u7f6e\u7bad\u5934');
  });

  $('drawTextButton').addEventListener('click', () => {
    setDrawingMode('text', '\u70b9\u51fb\u653e\u7f6e\u6587\u5b57');
  });

  $('clearDrawingsButton').addEventListener('click', clearDrawings);
  $('deleteSelectedButton').addEventListener('click', deleteSelectedDrawing);
  $('alertAboveButton').addEventListener('click', () => addAlert('above'));
  $('alertBelowButton').addEventListener('click', () => addAlert('below'));

  $('liveToggleButton').addEventListener('click', () => {
    state.live = !state.live;
    saveState();
    updateButtons();
    connectLiveSocket();
  });

  dom.strategyToggleButton.addEventListener('click', () => {
    state.strategyIndicator = !state.strategyIndicator;
    saveState();
    updateButtons();
    refreshStrategyVisuals();
    setStatus(state.strategyIndicator ? 'ATR策略指标已显示' : 'ATR策略指标已隐藏');
  });

  dom.strategySettingsButton.addEventListener('click', () => {
    syncStrategySettingsInputs();
    dom.strategySettingsPanel.classList.toggle('hidden');
  });

  dom.closeStrategySettingsButton.addEventListener('click', () => {
    dom.strategySettingsPanel.classList.add('hidden');
  });

  dom.atrLowerModeInput.addEventListener('change', () => updateStrategySetting('lowerMode', dom.atrLowerModeInput.value));
  dom.atrUpperModeInput.addEventListener('change', () => updateStrategySetting('upperMode', dom.atrUpperModeInput.value));
  dom.atrEmaLengthInput.addEventListener('change', () => updateStrategySetting('emaLength', dom.atrEmaLengthInput.value));
  dom.atrLengthInput.addEventListener('change', () => updateStrategySetting('atrLength', dom.atrLengthInput.value));
  dom.atrMultiplierInput.addEventListener('change', () => updateStrategySetting('atrMultiplier', dom.atrMultiplierInput.value));
  dom.atrLineWidthInput.addEventListener('change', () => updateStrategySetting('lineWidth', dom.atrLineWidthInput.value));
  dom.volumeSpikeMultiplierInput.addEventListener('change', () => updateStrategySetting('volumeSpikeMultiplier', dom.volumeSpikeMultiplierInput.value));

  $('secondaryToggleButton').addEventListener('click', () => {
    state.secondaryVisible = !state.secondaryVisible;
    saveState();
    updateButtons();
    resizeCharts();
    loadSecondary();
  });

  dom.secondaryIntervalSelect.addEventListener('change', () => {
    state.secondaryInterval = dom.secondaryIntervalSelect.value;
    saveState();
    loadSecondary();
  });

  $('screenshotButton').addEventListener('click', downloadScreenshot);

  priceChart.subscribeClick(handleChartClick);
  priceChart.subscribeCrosshairMove(param => {
    const bar = param.seriesData?.get(candleSeries);
    setOhlc(bar || latestBar());
  });
  volumeChart.subscribeCrosshairMove(param => {
    const point = param.time ? currentBars.find(bar => bar.time === param.time) : latestBar();
    setOhlc(point);
  });

  window.addEventListener('resize', resizeCharts);
  window.addEventListener('keydown', event => {
    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'SELECT') return;

    if (event.altKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      $('drawTrendButton').click();
    } else if (event.altKey && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      $('drawHLineButton').click();
    } else if (event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      downloadScreenshot();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelectedDrawing();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySelectedDrawing();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteDrawing();
    } else if (event.key === 'Escape') {
      clearToolMode();
      selectedDrawingId = null;
      renderDrawings();
    }
  });
}

renderWatchlist();
wireEvents();
syncVisibleRange(priceChart, volumeChart);
syncVisibleRange(volumeChart, priceChart);
updateButtons();
renderAlerts();
renderPriceLineList();
syncStrategySettingsInputs();
applyStrategySeriesOptions();
resizeCharts();
loadChart();
loadSecondary();
resetAutoRefresh();
