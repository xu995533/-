import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const host = '127.0.0.1';
const port = Number.parseInt(process.argv[2] ?? '4177', 10);

const BINANCE_INTERVAL_MS = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000
};

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseDateMs(value, fallback) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBinanceKline(row) {
  return {
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'btc-grid-backtester/0.1'
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 180)}`);
  }

  return response.json();
}

async function fetchBinanceVisionKlines({ symbol, interval, startMs, endMs }) {
  const intervalMs = BINANCE_INTERVAL_MS[interval];
  if (!intervalMs) throw new Error(`Unsupported interval: ${interval}`);

  const bars = [];
  let cursor = startMs;
  let requestCount = 0;

  while (cursor < endMs && requestCount < 20) {
    const url = new URL('https://data-api.binance.vision/api/v3/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endMs));
    url.searchParams.set('limit', '1000');

    const batch = await fetchJson(url);
    if (!Array.isArray(batch) || batch.length === 0) break;

    bars.push(...batch.map(normalizeBinanceKline));

    const lastOpenTime = Number(batch[batch.length - 1][0]);
    const nextCursor = lastOpenTime + intervalMs;
    if (nextCursor <= cursor || batch.length < 1000) break;
    cursor = nextCursor;
    requestCount += 1;
  }

  return Array.from(new Map(bars.map(bar => [bar.time, bar])).values())
    .sort((left, right) => left.time - right.time)
    .filter(bar => bar.time * 1000 >= startMs && bar.time * 1000 <= endMs);
}

function defaultRange() {
  const endMs = Date.now();
  const startMs = endMs - 3 * 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

function gridLevels(lower, upper, gridStep) {
  const levels = [];
  const range = upper - lower;
  const interval = Math.max(Number(gridStep), range / 1000, 0.00000001);

  for (let price = lower; price < upper; price += interval) {
    levels.push(Number(price.toFixed(8)));
  }

  if (levels.length === 0 || levels[levels.length - 1] !== upper) {
    levels.push(Number(upper.toFixed(8)));
  }

  return { levels, interval, gridCount: levels.length - 1 };
}

function levelIndexForPrice(price, levels) {
  let index = 0;
  for (let i = 0; i < levels.length; i += 1) {
    if (price >= levels[i]) index = i;
  }
  return Math.min(Math.max(index, 0), levels.length - 1);
}

function intrabarPath(bar, pathMode) {
  if (pathMode === 'downFirst') return [bar.open, bar.low, bar.high, bar.close];
  if (pathMode === 'upFirst') return [bar.open, bar.high, bar.low, bar.close];

  return Math.abs(bar.open - bar.high) <= Math.abs(bar.open - bar.low)
    ? [bar.open, bar.high, bar.low, bar.close]
    : [bar.open, bar.low, bar.high, bar.close];
}

function compactPath(points) {
  return points.filter((point, index) => index === 0 || point !== points[index - 1]);
}

function pathModeLabel(pathMode) {
  if (pathMode === 'downFirst') return '先跌后涨';
  if (pathMode === 'upFirst') return '先涨后跌';
  return '按开盘距离推断';
}

function simulateLongGrid(bars, settings) {
  if (bars.length < 2) {
    return {
      settings,
      summary: {},
      trades: [],
      equity: [],
      levels: []
    };
  }

  const lower = Number(settings.lower);
  const upper = Number(settings.upper);
  const gridStep = Number(settings.gridStep);
  const capital = Number(settings.capital);
  const leverage = Number(settings.leverage);
  const feeRate = Number(settings.feeRate);
  const orderUsdt = Number(settings.orderUsdt);
  const pathMode = settings.pathMode || 'smart';
  const { levels, interval, gridCount } = gridLevels(lower, upper, gridStep);

  let cash = capital;
  let realizedPnl = 0;
  let fees = 0;
  let orderId = 1;
  let maxEquity = capital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let maxOpenLots = 0;
  let skippedBuys = 0;
  const openLots = [];
  const trades = [];
  const equity = [];

  function markToMarket(price) {
    const positionQty = openLots.reduce((sum, lot) => sum + lot.qty, 0);
    const grossUnrealized = openLots.reduce(
      (sum, lot) => sum + (price - lot.entryPrice) * lot.qty,
      0
    );
    const usedNotional = openLots.reduce(
      (sum, lot) => sum + lot.entryPrice * lot.qty,
      0
    );
    const usedMargin = openLots.reduce((sum, lot) => sum + lot.margin, 0);
    const openFees = openLots.reduce((sum, lot) => sum + lot.feeIn, 0);
    const estimatedExitFees = openLots.reduce((sum, lot) => sum + price * lot.qty * feeRate, 0);
    const unrealized = grossUnrealized - openFees - estimatedExitFees;
    const equityValue = cash + usedMargin + grossUnrealized - estimatedExitFees;

    if (equityValue > maxEquity) maxEquity = equityValue;
    const drawdown = maxEquity - equityValue;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPct = maxEquity > 0 ? (drawdown / maxEquity) * 100 : 0;
    }

    return {
      equity: Number(equityValue.toFixed(4)),
      cash: Number(cash.toFixed(4)),
      unrealized: Number(unrealized.toFixed(4)),
      positionQty: Number(positionQty.toFixed(8)),
      usedMargin: Number(usedMargin.toFixed(4)),
      usedNotional: Number(usedNotional.toFixed(4))
    };
  }

  function buyAt(bar, levelIndex, note) {
    if (levelIndex < 0 || levelIndex >= levels.length - 1) return false;
    if (openLots.some(lot => lot.levelIndex === levelIndex)) return false;

    const price = levels[levelIndex];
    const qty = orderUsdt / price;
    const fee = orderUsdt * feeRate;
    const margin = orderUsdt / leverage;
    if (cash < margin + fee) {
      skippedBuys += 1;
      return false;
    }

    cash -= margin + fee;
    fees += fee;
    const lot = {
      id: orderId++,
      levelIndex,
      entryTime: bar.time,
      entryPrice: price,
      qty,
      margin,
      feeIn: fee
    };
    openLots.push(lot);
    maxOpenLots = Math.max(maxOpenLots, openLots.length);
    trades.push({
      id: lot.id,
      type: 'buy',
      time: bar.time,
      price: Number(price.toFixed(2)),
      qty: Number(qty.toFixed(8)),
      fee: Number(fee.toFixed(4)),
      pnl: 0,
      note
    });
    return true;
  }

  function sellAt(bar, lot, exitLevelIndex, note) {
    const exitPrice = levels[exitLevelIndex];
    const notional = exitPrice * lot.qty;
    const fee = notional * feeRate;
    const grossPnl = (exitPrice - lot.entryPrice) * lot.qty;
    const pnl = grossPnl - lot.feeIn - fee;
    cash += lot.margin + grossPnl - fee;
    realizedPnl += pnl;
    fees += fee;
    trades.push({
      id: lot.id,
      type: 'sell',
      time: bar.time,
      price: Number(exitPrice.toFixed(2)),
      qty: Number(lot.qty.toFixed(8)),
      fee: Number(fee.toFixed(4)),
      pnl: Number(pnl.toFixed(4)),
      note
    });
  }

  function processDownSegment(bar, from, to) {
    for (let levelIndex = levels.length - 2; levelIndex >= 0; levelIndex -= 1) {
      const price = levels[levelIndex];
      if (from >= price && to <= price) {
        buyAt(bar, levelIndex, pathMode === 'smart' ? 'path cross down' : `${pathModeLabel(pathMode)} cross down`);
      }
    }
  }

  function processUpSegment(bar, from, to) {
    const closeCandidates = [...openLots].filter(lot => {
      const target = levels[lot.levelIndex + 1];
      return from <= target && to >= target;
    }).sort((left, right) => left.levelIndex - right.levelIndex);

    for (const lot of closeCandidates) {
      const index = openLots.findIndex(item => item.id === lot.id);
      if (index === -1) continue;
      openLots.splice(index, 1);
      sellAt(bar, lot, lot.levelIndex + 1, pathMode === 'smart' ? 'path take profit' : `${pathModeLabel(pathMode)} take profit`);
    }
  }

  function processSegment(bar, from, to) {
    if (to < from) processDownSegment(bar, from, to);
    if (to > from) processUpSegment(bar, from, to);
  }

  for (const bar of bars) {
    const path = compactPath(intrabarPath(bar, pathMode));
    for (let i = 0; i < path.length - 1; i += 1) {
      processSegment(bar, path[i], path[i + 1]);
    }

    const mtm = markToMarket(bar.close);
    equity.push({
      time: bar.time,
      value: mtm.equity,
      unrealized: mtm.unrealized,
      positionQty: mtm.positionQty
    });
  }

  const last = bars[bars.length - 1];
  const mtm = markToMarket(last.close);
  const winningSells = trades.filter(trade => trade.type === 'sell' && trade.pnl > 0).length;
  const sells = trades.filter(trade => trade.type === 'sell');
  const buys = trades.filter(trade => trade.type === 'buy');
  const sellPnls = sells.map(trade => trade.pnl);
  const grossProfit = sellPnls.filter(pnl => pnl > 0).reduce((sum, pnl) => sum + pnl, 0);
  const grossLoss = Math.abs(sellPnls.filter(pnl => pnl < 0).reduce((sum, pnl) => sum + pnl, 0));
  const avgWin = winningSells ? grossProfit / winningSells : 0;
  const losingSells = sells.length - winningSells;
  const avgLoss = losingSells ? -grossLoss / losingSells : 0;
  const expectancy = sells.length ? sellPnls.reduce((sum, pnl) => sum + pnl, 0) / sells.length : 0;
  let currentLossStreak = 0;
  let maxConsecutiveLosses = 0;
  for (const trade of sells) {
    if (trade.pnl <= 0) {
      currentLossStreak += 1;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
    } else {
      currentLossStreak = 0;
    }
  }
  const totalPnl = mtm.equity - capital;

  return {
    settings: {
      ...settings,
      gridStep: Number(interval.toFixed(4)),
      intervalSize: Number(interval.toFixed(4))
    },
    levels,
    trades,
    equity,
    summary: {
      symbol: settings.symbol,
      interval: settings.interval,
      bars: bars.length,
      startTime: bars[0].time,
      endTime: last.time,
      startPrice: Number(bars[0].close.toFixed(2)),
      endPrice: Number(last.close.toFixed(2)),
      lower,
      upper,
      gridCount,
      gridInterval: Number(interval.toFixed(4)),
      gridStep: Number(interval.toFixed(4)),
      pathMode,
      pathModeLabel: pathModeLabel(pathMode),
      orderUsdt,
      leverage,
      feeRate,
      totalTrades: trades.length,
      buyCount: buys.length,
      sellCount: sells.length,
      openLots: openLots.length,
      maxOpenLots,
      skippedBuys,
      realizedPnl: Number(realizedPnl.toFixed(4)),
      unrealizedPnl: mtm.unrealized,
      totalPnl: Number(totalPnl.toFixed(4)),
      returnPct: Number(((totalPnl / capital) * 100).toFixed(4)),
      fees: Number(fees.toFixed(4)),
      finalEquity: mtm.equity,
      maxDrawdown: Number(maxDrawdown.toFixed(4)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(4)),
      profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(4)) : (grossProfit > 0 ? null : 0),
      expectancy: Number(expectancy.toFixed(4)),
      avgWin: Number(avgWin.toFixed(4)),
      avgLoss: Number(avgLoss.toFixed(4)),
      maxConsecutiveLosses,
      winRate: sells.length ? Number(((winningSells / sells.length) * 100).toFixed(2)) : 0
    },
    openLots: openLots.map(lot => ({
      id: lot.id,
      levelIndex: lot.levelIndex,
      entryTime: lot.entryTime,
      entryPrice: Number(lot.entryPrice.toFixed(2)),
      qty: Number(lot.qty.toFixed(8))
    }))
  };
}

function makeSettings(url) {
  const range = defaultRange();
  const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const interval = url.searchParams.get('interval') || '1m';
  const startMs = parseDateMs(url.searchParams.get('start'), range.startMs);
  const endMs = parseDateMs(url.searchParams.get('end'), range.endMs);
  const firstBound = clampNumber(url.searchParams.get('lower'), 62000, 1, 1_500_000);
  const secondBound = clampNumber(url.searchParams.get('upper'), 66000, 1, 1_500_000);
  const lower = Math.min(firstBound, secondBound);
  const upper = Math.max(firstBound, secondBound, lower + 1);
  const legacyGrids = Number(url.searchParams.get('grids'));
  const gridStepFallback = Number.isFinite(legacyGrids) && legacyGrids > 0
    ? (upper - lower) / legacyGrids
    : 100;
  const requestedPathMode = url.searchParams.get('pathMode') || 'smart';
  const pathMode = ['smart', 'downFirst', 'upFirst'].includes(requestedPathMode)
    ? requestedPathMode
    : 'smart';

  return {
    symbol,
    interval,
    startMs,
    endMs,
    lower,
    upper,
    gridStep: clampNumber(url.searchParams.get('gridStep'), gridStepFallback, 1, upper - lower),
    capital: clampNumber(url.searchParams.get('capital'), 1000, 10, 10_000_000),
    leverage: clampNumber(url.searchParams.get('leverage'), 10, 1, 125),
    orderUsdt: clampNumber(url.searchParams.get('orderUsdt'), 25, 1, 1_000_000),
    feeRate: clampNumber(url.searchParams.get('feeRate'), 0, 0, 0.01),
    pathMode
  };
}

function makeOptimizeRange(url, currentGridStep, maxStep) {
  const fallbackMin = Math.max(1, Math.round(currentGridStep * 0.5));
  const fallbackMax = Math.max(fallbackMin, Math.round(currentGridStep * 2.5));
  const rawMin = Math.round(clampNumber(url.searchParams.get('stepMin') ?? url.searchParams.get('gridMin'), fallbackMin, 1, maxStep));
  const rawMax = Math.round(clampNumber(url.searchParams.get('stepMax') ?? url.searchParams.get('gridMax'), fallbackMax, 1, maxStep));
  return {
    stepMin: Math.min(rawMin, rawMax),
    stepMax: Math.max(rawMin, rawMax)
  };
}

function optimizeGridSteps(bars, settings, stepMin, stepMax) {
  const candidates = [];
  const stride = Math.max(1, Math.ceil((stepMax - stepMin + 1) / 120));

  for (let gridStep = stepMin; gridStep <= stepMax; gridStep += stride) {
    const result = simulateLongGrid(bars, { ...settings, gridStep });
    const summary = result.summary;
    const score = summary.totalPnl - summary.maxDrawdown * 0.25;
    candidates.push({
      gridStep: summary.gridStep,
      gridCount: summary.gridCount,
      gridInterval: summary.gridInterval,
      totalPnl: summary.totalPnl,
      returnPct: summary.returnPct,
      maxDrawdown: summary.maxDrawdown,
      maxDrawdownPct: summary.maxDrawdownPct,
      winRate: summary.winRate,
      sellCount: summary.sellCount,
      openLots: summary.openLots,
      profitFactor: summary.profitFactor,
      score: Number(score.toFixed(4))
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates;
}

async function serveStatic(request, response, url) {
  if (url.pathname === '/vendor/lightweight-charts.standalone.production.js') {
    const vendorPath = path.join(
      __dirname,
      'node_modules',
      'lightweight-charts',
      'dist',
      'lightweight-charts.standalone.production.js'
    );
    const content = await fs.readFile(vendorPath);
    response.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    });
    response.end(content);
    return;
  }

  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const targetPath = path.normalize(path.join(publicDir, pathname));

  if (!targetPath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(targetPath);
    const ext = path.extname(targetPath);
    response.writeHead(200, {
      'Content-Type': mimeTypes.get(ext) ?? 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

  try {
    if (url.pathname === '/api/backtest') {
      const settings = makeSettings(url);
      const bars = await fetchBinanceVisionKlines(settings);
      const result = simulateLongGrid(bars, settings);
      json(response, 200, { bars, ...result });
      return;
    }

    if (url.pathname === '/api/optimize') {
      const settings = makeSettings(url);
      const { stepMin, stepMax } = makeOptimizeRange(url, settings.gridStep, settings.upper - settings.lower);
      const bars = await fetchBinanceVisionKlines(settings);
      const candidates = optimizeGridSteps(bars, settings, stepMin, stepMax);
      json(response, 200, {
        settings,
        stepMin,
        stepMax,
        tested: candidates.length,
        best: candidates[0] ?? null,
        candidates: candidates.slice(0, 12)
      });
      return;
    }

    await serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    json(response, 500, {
      error: error.message,
      hint: 'If Binance blocks one data endpoint, swap the data source in server.mjs.'
    });
  }
});

server.listen(port, host, () => {
  console.log(`BTC grid backtester running at http://${host}:${port}`);
});
