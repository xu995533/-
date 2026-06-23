const $ = (id) => document.getElementById(id);

let timeframe = "15m";
let historyTimer = null;

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function fmtInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Math.round(Number(value)).toLocaleString();
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function setText(id, text) {
  $(id).textContent = text;
}

function setClassActive() {
  $("tf15").classList.toggle("active", timeframe === "15m");
  $("tf1h").classList.toggle("active", timeframe === "1h");
}

async function setTimeframe(next) {
  timeframe = next;
  setClassActive();
  await fetch(`/api/set?timeframe=${encodeURIComponent(next)}`);
  await refresh();
}

function renderRows(id, rows, side) {
  const body = $(id);
  body.innerHTML = "";
  if (!rows || rows.length === 0) {
    body.innerHTML = `<tr><td colspan="2">暂无数据</td></tr>`;
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="price ${side}">${fmt(row.price, 2)}</td>
      <td>${fmtInt(row.size)}</td>
    `;
    body.appendChild(tr);
  }
}

function renderArb(rows) {
  const body = $("arbRows");
  body.innerHTML = "";
  if (!rows || rows.length === 0) {
    body.innerHTML = `<tr><td colspan="3">暂无数据</td></tr>`;
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    const edgeClass = row.edge > 0 ? "ok" : row.edge < 0 ? "bad" : "";
    tr.innerHTML = `
      <td>L${row.level}</td>
      <td>${fmt(row.sum, 3)}</td>
      <td class="${edgeClass}">${row.edge >= 0 ? "+" : ""}${fmt(row.edge, 3)}</td>
    `;
    body.appendChild(tr);
  }
}

function render(data) {
  timeframe = data.timeframe || timeframe;
  setClassActive();

  setText("marketSlug", data.slug || "正在连接 Polymarket...");
  setText("timeLeft", data.timeLeft || "--");
  setText("upAsk", fmt(data.upBestAsk, 2));
  setText("downAsk", fmt(data.downBestAsk, 2));
  setText("age", data.ageSeconds === null ? "--" : `${data.ageSeconds}s`);

  renderRows("upBids", data.up?.bids, "bid");
  renderRows("upAsks", data.up?.asks, "ask");
  renderRows("downBids", data.down?.bids, "bid");
  renderRows("downAsks", data.down?.asks, "ask");

  setText("upMeta", `bid ${fmt(data.upBestBid, 2)} / ask ${fmt(data.upBestAsk, 2)} / spread ${fmt(data.up?.spread, 3)}`);
  setText("downMeta", `bid ${fmt(data.downBestBid, 2)} / ask ${fmt(data.downBestAsk, 2)} / spread ${fmt(data.down?.spread, 3)}`);

  setText("upDepth", `${fmtInt(data.up?.bidDepth5)} / ${fmtInt(data.up?.askDepth5)}`);
  setText("downDepth", `${fmtInt(data.down?.bidDepth5)} / ${fmtInt(data.down?.askDepth5)}`);
  setText("upImb", fmt(data.up?.imbalance, 3));
  setText("downImb", fmt(data.down?.imbalance, 3));
  setText("upMicro", fmt(data.up?.microprice, 3));
  setText("downMicro", fmt(data.down?.microprice, 3));

  renderArb(data.arbRows);

  setText("csvState", data.logExists ? "CSV 已记录" : "等待写入 CSV");
  $("csvState").className = data.logExists ? "ok" : "warn";
  setText("logFile", data.logFile || "--");
  setText("tokens", data.tokens ? `UP: ${data.tokens.up}   DOWN: ${data.tokens.down}` : "--");

  if (data.error) {
    setText("status", data.error);
    $("status").className = "bad";
  } else {
    setText("status", "运行中");
    $("status").className = "ok";
  }
}

function renderHistoryRows(rows, threshold) {
  const body = $("historyRows");
  body.innerHTML = "";
  $("historyTriggerHead").textContent = `${Math.round(threshold * 100)}美分触发`;
  if (!rows || rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5">暂无数据</td></tr>`;
    return;
  }

  for (const row of rows.slice().reverse()) {
    const tr = document.createElement("tr");
    const upTouch = row.upTouched ? (row.upTouchWon ? "UP赢" : "UP输") : "";
    const downTouch = row.downTouched ? (row.downTouchWon ? "DOWN赢" : "DOWN输") : "";
    const trigger = [upTouch, downTouch].filter(Boolean).join(" / ") || "未触发";
    tr.innerHTML = `
      <td><a href="${row.url}" target="_blank" rel="noreferrer">${row.slug}</a></td>
      <td class="${row.winner === "Up" ? "ok" : row.winner === "Down" ? "bad" : ""}">${row.winner || row.error || "--"}</td>
      <td>${fmt(row.upMin, 3)} / ${fmt(row.upMax, 3)}</td>
      <td>${fmt(row.downMin, 3)} / ${fmt(row.downMax, 3)}</td>
      <td>${trigger}</td>
    `;
    body.appendChild(tr);
  }
}

function renderHistory(job) {
  const summary = job.summary;
  const progress = `${job.progress || 0}/${job.total || 0}`;
  if (job.running) {
    setText("historyStatus", `正在下载 ${progress}`);
    $("historyStatus").className = "warn";
    $("historyStart").disabled = true;
  } else if (job.error) {
    setText("historyStatus", job.error);
    $("historyStatus").className = "bad";
    $("historyStart").disabled = false;
  } else if (summary) {
    setText("historyStatus", `完成 ${progress}`);
    $("historyStatus").className = "ok";
    $("historyStart").disabled = false;
  } else {
    setText("historyStatus", "未开始");
    $("historyStatus").className = "";
    $("historyStart").disabled = false;
  }

  setText("histValid", summary ? `${summary.validMarkets}/${summary.markets}` : "--");
  setText("histTouches", summary ? summary.touches : "--");
  setText("histWins", summary ? summary.wins : "--");
  setText("histWinRate", summary ? `${pct(summary.winRate)} / 优势 ${pct(summary.edgeVsBreakEven)}` : "--");
  setText("histUp", summary ? `${summary.upTouches}/${summary.upWins}` : "--");
  setText("histDown", summary ? `${summary.downTouches}/${summary.downWins}` : "--");
  setText("historyCsv", job.csvFile || "--");
  renderHistoryRows(job.rows, job.threshold || Number($("historyThreshold").value || 0.3));
}

async function refreshHistory() {
  try {
    const response = await fetch("/api/history", { cache: "no-store" });
    const job = await response.json();
    renderHistory(job);
    if (!job.running && historyTimer) {
      clearInterval(historyTimer);
      historyTimer = null;
    }
  } catch (error) {
    setText("historyStatus", `历史数据连接失败：${error.message}`);
    $("historyStatus").className = "bad";
  }
}

async function startHistory() {
  const hours = $("historyHours").value || "100";
  const threshold = $("historyThreshold").value || "0.30";
  $("historyStart").disabled = true;
  setText("historyStatus", "正在启动...");
  $("historyStatus").className = "warn";
  try {
    const response = await fetch(`/api/history/start?hours=${encodeURIComponent(hours)}&threshold=${encodeURIComponent(threshold)}&timeframe=${encodeURIComponent(timeframe)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "启动失败");
    }
    await refreshHistory();
    if (!historyTimer) {
      historyTimer = setInterval(refreshHistory, 1000);
    }
  } catch (error) {
    setText("historyStatus", error.message);
    $("historyStatus").className = "bad";
    $("historyStart").disabled = false;
  }
}

async function refresh() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    render(await response.json());
  } catch (error) {
    setText("status", `连接失败：${error.message}`);
    $("status").className = "bad";
  }
}

$("tf15").addEventListener("click", () => setTimeframe("15m"));
$("tf1h").addEventListener("click", () => setTimeframe("1h"));
$("historyStart").addEventListener("click", startHistory);

refresh();
refreshHistory();
setInterval(refresh, 2000);
