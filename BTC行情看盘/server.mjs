import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const host = '127.0.0.1';
const port = Number.parseInt(process.argv[2] ?? '4288', 10);
const execFileAsync = promisify(execFile);

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
  '1M': 2_592_000_000,
};

const DEFAULT_RANGES = {
  '1m': 24 * 60 * 60 * 1000,
  '3m': 7 * 24 * 60 * 60 * 1000,
  '5m': 14 * 24 * 60 * 60 * 1000,
  '15m': 30 * 24 * 60 * 60 * 1000,
  '30m': 90 * 24 * 60 * 60 * 1000,
  '1h': 365 * 24 * 60 * 60 * 1000,
  '4h': 2 * 365 * 24 * 60 * 60 * 1000,
  '1d': 5 * 365 * 24 * 60 * 60 * 1000,
  '1w': 3 * 365 * 24 * 60 * 60 * 1000,
  '1M': 5 * 365 * 24 * 60 * 60 * 1000,
};

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function normalizeBinanceKline(row) {
  return {
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

async function fetchJsonWithPowerShell(url) {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -UseBasicParsing -Uri '${String(url).replace(/'/g, "''")}').Content`,
  ], {
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30_000,
  });
  if (!stdout.trim()) throw new Error('Empty response from Binance');
  return JSON.parse(stdout);
}

async function fetchJson(url) {
  if (new URL(url).hostname === 'fapi.binance.com') {
    return fetchJsonWithPowerShell(url);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'local-tradingview-watch/0.3',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    }

    return response.json();
  } catch (error) {
    return fetchJsonWithPowerShell(url).catch(() => {
      throw error;
    });
  }
}

function normalizeSymbol(symbol) {
  return symbol.toUpperCase().replace(/\.P$/, '');
}

async function fetchBinanceKlines({ symbol, interval, startMs, endMs }) {
  const intervalMs = BINANCE_INTERVAL_MS[interval];
  if (!intervalMs) throw new Error(`Unsupported interval: ${interval}`);

  const bars = [];
  let cursor = startMs;
  let requestCount = 0;
  const normalizedSymbol = normalizeSymbol(symbol);

  while (cursor < endMs && requestCount < 20) {
    const url = new URL('https://fapi.binance.com/fapi/v1/klines');
    url.searchParams.set('symbol', normalizedSymbol);
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

function chartSettings(url) {
  const symbol = normalizeSymbol(url.searchParams.get('symbol') || 'BTCUSDC');
  const interval = url.searchParams.get('interval') || '15m';
  if (!BINANCE_INTERVAL_MS[interval]) throw new Error(`Unsupported interval: ${interval}`);

  const now = Date.now();
  const fallbackRange = DEFAULT_RANGES[interval] ?? DEFAULT_RANGES['15m'];
  const startMs = Number(url.searchParams.get('startMs')) || now - fallbackRange;
  const endMs = Number(url.searchParams.get('endMs')) || now;
  return { symbol, interval, startMs, endMs };
}

async function serveStatic(response, url) {
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
      'Cache-Control': 'public, max-age=3600',
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
      'Cache-Control': 'no-store',
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
    if (url.pathname === '/api/klines') {
      const settings = chartSettings(url);
      const bars = await fetchBinanceKlines(settings);
      json(response, 200, { ...settings, bars });
      return;
    }

    await serveStatic(response, url);
  } catch (error) {
    console.error(error);
    json(response, 500, {
      error: error.message,
      hint: 'Binance futures data is temporarily unavailable. Refresh later.',
    });
  }
});

server.listen(port, host, () => {
  console.log(`Local chart running at http://${host}:${port}`);
});
