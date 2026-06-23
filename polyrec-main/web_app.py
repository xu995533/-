from __future__ import annotations

import json
import csv
import os
import threading
import time
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import dash


HOST = "127.0.0.1"
PORT = 8791
ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
HISTORY_DIR = ROOT / "history_data"
POLL_SECONDS = max(0.2, float(os.environ.get("POLYREC_POLL_SECONDS", "0.8")))

state_lock = threading.Lock()
state = {
    "timeframe": "15m",
    "slug": "",
    "tokens": None,
    "up": None,
    "down": None,
    "updated_at": 0.0,
    "error": "",
}
stop_event = threading.Event()
history_lock = threading.Lock()
history_job = {
    "running": False,
    "progress": 0,
    "total": 0,
    "timeframe": "1h",
    "threshold": 0.30,
    "rows": [],
    "summary": None,
    "csvFile": "",
    "error": "",
    "startedAt": 0.0,
    "finishedAt": 0.0,
}


def _json_value(value, fallback=None):
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value


def _hourly_slug_from_et(dt_et) -> str:
    dt_et = dt_et.replace(minute=0, second=0, microsecond=0)
    month = dt_et.strftime("%B").lower()
    hour_12 = dt_et.strftime("%I").lstrip("0") or "12"
    ampm = dt_et.strftime("%p").lower()
    return f"bitcoin-up-or-down-{month}-{dt_et.day}-{dt_et.year}-{hour_12}{ampm}-et"


def _history_slugs(timeframe: str, count: int) -> list[str]:
    if timeframe == "15m":
        now_ts = int(time.time())
        current_slot = (now_ts // 900) * 900
        return [f"btc-updown-15m-{current_slot - (offset * 900)}" for offset in range(1, count + 1)]

    now_et = datetime.now(tz=dash.ET_TZ).replace(minute=0, second=0, microsecond=0)
    return [_hourly_slug_from_et(now_et - timedelta(hours=offset)) for offset in range(1, count + 1)]


def _event_by_slug(slug: str) -> dict | None:
    resp = dash.requests.get(f"{dash.PM_GAMMA_API}/events/slug/{slug}", timeout=12)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    event = resp.json()
    return event or None


def _market_from_event(event: dict) -> dict | None:
    markets = event.get("markets") or []
    if not markets:
        return None
    return markets[0]


def _tokens_from_market(market: dict) -> dict:
    token_ids = _json_value(market.get("clobTokenIds"), [])
    outcomes = _json_value(market.get("outcomes"), [])
    up_idx = outcomes.index("Up") if "Up" in outcomes else 0
    down_idx = outcomes.index("Down") if "Down" in outcomes else 1
    return {"up": str(token_ids[up_idx]), "down": str(token_ids[down_idx])}


def _winner_from_market(market: dict) -> str:
    outcomes = _json_value(market.get("outcomes"), [])
    prices = _json_value(market.get("outcomePrices"), [])
    if not outcomes or not prices:
        return ""
    best_idx = max(range(len(prices)), key=lambda i: float(prices[i]))
    return str(outcomes[best_idx])


def _price_history(token_id: str) -> list[dict]:
    uri = f"https://clob.polymarket.com/prices-history?market={token_id}&interval=max&fidelity=1"
    resp = dash.requests.get(uri, timeout=15)
    resp.raise_for_status()
    history = resp.json().get("history") or []
    clean = []
    for point in history:
        try:
            clean.append({"t": int(point["t"]), "p": float(point["p"])})
        except (KeyError, TypeError, ValueError):
            continue
    clean.sort(key=lambda item: item["t"])
    return clean


def _history_stats(points: list[dict], threshold: float, side: str, winner: str) -> dict:
    if not points:
        return {
            f"{side}Min": None,
            f"{side}Max": None,
            f"{side}Last": None,
            f"{side}Touched": False,
            f"{side}TouchTime": "",
            f"{side}TouchWon": False,
            f"{side}Points": 0,
        }
    prices = [point["p"] for point in points]
    touch = next((point for point in points if point["p"] <= threshold), None)
    return {
        f"{side}Min": min(prices),
        f"{side}Max": max(prices),
        f"{side}Last": prices[-1],
        f"{side}Touched": touch is not None,
        f"{side}TouchTime": (
            datetime.fromtimestamp(touch["t"], tz=dash.UTC_TZ).isoformat()
            if touch else ""
        ),
        f"{side}TouchWon": bool(touch and winner.lower() == side),
        f"{side}Points": len(points),
    }


def _save_history_csv(rows: list[dict], count: int, threshold: float, timeframe: str) -> str:
    HISTORY_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    suffix = "15m" if timeframe == "15m" else "hourly"
    path = HISTORY_DIR / f"btc_{suffix}_{count}_threshold_{threshold:.3f}_{stamp}.csv"
    fields = [
        "slug", "title", "closed", "winner", "endDate", "volume",
        "upMin", "upMax", "upLast", "upTouched", "upTouchTime", "upTouchWon", "upPoints",
        "downMin", "downMax", "downLast", "downTouched", "downTouchTime", "downTouchWon", "downPoints",
        "url", "error",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    return str(path)


def _summarize_history(rows: list[dict], threshold: float) -> dict:
    valid = [
        row for row in rows
        if row.get("closed") and not row.get("error") and row.get("winner") in {"Up", "Down"}
    ]
    up_touched = [row for row in valid if row.get("upTouched")]
    down_touched = [row for row in valid if row.get("downTouched")]
    all_touched = [
        {"side": "Up", "won": row.get("upTouchWon")} for row in up_touched
    ] + [
        {"side": "Down", "won": row.get("downTouchWon")} for row in down_touched
    ]

    wins = sum(1 for item in all_touched if item["won"])
    touches = len(all_touched)
    win_rate = wins / touches if touches else None
    edge = (win_rate - threshold) if win_rate is not None else None
    return {
        "markets": len(rows),
        "validMarkets": len(valid),
        "threshold": threshold,
        "touches": touches,
        "wins": wins,
        "winRate": win_rate,
        "edgeVsBreakEven": edge,
        "upTouches": len(up_touched),
        "upWins": sum(1 for row in up_touched if row.get("upTouchWon")),
        "downTouches": len(down_touched),
        "downWins": sum(1 for row in down_touched if row.get("downTouchWon")),
    }


def _run_history_job(count: int, threshold: float, timeframe: str) -> None:
    rows = []
    # Skip the current unfinished period. Closed markets have reliable winner data.
    slugs = _history_slugs(timeframe, count)

    with history_lock:
        history_job.update({
            "running": True,
            "progress": 0,
            "total": count,
            "timeframe": timeframe,
            "threshold": threshold,
            "rows": [],
            "summary": None,
            "csvFile": "",
            "error": "",
            "startedAt": time.time(),
            "finishedAt": 0.0,
        })

    try:
        for idx, slug in enumerate(slugs, start=1):
            row = {
                "slug": slug,
                "title": "",
                "closed": False,
                "winner": "",
                "endDate": "",
                "volume": "",
                "upMin": None,
                "upMax": None,
                "upLast": None,
                "upTouched": False,
                "upTouchTime": "",
                "upTouchWon": False,
                "upPoints": 0,
                "downMin": None,
                "downMax": None,
                "downLast": None,
                "downTouched": False,
                "downTouchTime": "",
                "downTouchWon": False,
                "downPoints": 0,
                "url": f"https://polymarket.com/event/{slug}",
                "error": "",
            }
            try:
                event = _event_by_slug(slug)
                if not event:
                    raise RuntimeError("找不到这个小时市场")
                market = _market_from_event(event)
                if not market:
                    raise RuntimeError("事件里没有市场数据")
                tokens = _tokens_from_market(market)
                closed = bool(event.get("closed") or market.get("closed"))
                winner = _winner_from_market(market) if closed else ""
                up_points = _price_history(tokens["up"])
                down_points = _price_history(tokens["down"])
                row.update({
                    "title": event.get("title") or market.get("question") or slug,
                    "closed": closed,
                    "winner": winner,
                    "endDate": event.get("endDate") or market.get("endDate") or "",
                    "volume": event.get("volume") or market.get("volume") or "",
                })
                row.update(_history_stats(up_points, threshold, "up", winner))
                row.update(_history_stats(down_points, threshold, "down", winner))
            except Exception as exc:
                row["error"] = str(exc)

            rows.append(row)
            with history_lock:
                history_job["progress"] = idx
                history_job["rows"] = rows[-30:]
            time.sleep(0.08)

        summary = _summarize_history(rows, threshold)
        csv_file = _save_history_csv(rows, count, threshold, timeframe)
        with history_lock:
            history_job.update({
                "running": False,
                "progress": count,
                "rows": rows[-30:],
                "summary": summary,
                "csvFile": csv_file,
                "finishedAt": time.time(),
            })
    except Exception as exc:
        with history_lock:
            history_job.update({
                "running": False,
                "error": str(exc),
                "finishedAt": time.time(),
            })


def _history_snapshot() -> dict:
    with history_lock:
        return json.loads(json.dumps(history_job, ensure_ascii=False))


def _book_view(book: dict | None) -> dict | None:
    if not book:
        return None

    bids = dash.parse_pm_orderbook(book.get("bids", []))
    asks = dash.parse_pm_orderbook(book.get("asks", []))
    bids.sort(key=lambda x: x[0], reverse=True)
    asks.sort(key=lambda x: x[0])
    best_bid = bids[0][0] if bids else None
    best_ask = asks[0][0] if asks else None
    spread = best_ask - best_bid if best_bid is not None and best_ask is not None else None
    return {
        "bids": [{"price": p, "size": s} for p, s in bids[:8]],
        "asks": [{"price": p, "size": s} for p, s in asks[:8]],
        "bestBid": best_bid,
        "bestAsk": best_ask,
        "spread": spread,
        "bidDepth5": dash.calculate_depth(bids, 5),
        "askDepth5": dash.calculate_depth(asks, 5),
        "imbalance": dash.calculate_imbalance(bids, asks, 5),
        "microprice": dash.calculate_microprice(bids, asks),
        "bidSlope": dash.calculate_orderbook_slope(bids, 5),
        "askSlope": dash.calculate_orderbook_slope(asks, 5),
    }


def _snapshot() -> dict:
    with state_lock:
        timeframe = state["timeframe"]
        slug = state["slug"]
        tokens = state["tokens"]
        up = state["up"]
        down = state["down"]
        updated_at = state["updated_at"]
        error = state["error"]

    dash.configure_market(timeframe, enable_chainlink=False)
    time_left, seconds_left = dash.time_to_market_end()
    log_dir = ROOT / ("logs_1h" if timeframe == "1h" else "logs")
    log_file = log_dir / f"{slug}.csv" if slug else None

    up_best = up.get("bestAsk") if up else None
    down_best = down.get("bestAsk") if down else None
    up_bid = up.get("bestBid") if up else None
    down_bid = down.get("bestBid") if down else None
    arb_rows = []
    if up and down:
        for i in range(5):
            up_price = up["bids"][i]["price"] if i < len(up["bids"]) else 0
            down_price = down["bids"][i]["price"] if i < len(down["bids"]) else 0
            total = up_price + down_price
            arb_rows.append({"level": i + 1, "sum": total, "edge": 1 - total})

    return {
        "timeframe": timeframe,
        "slug": slug,
        "tokens": tokens,
        "timeLeft": time_left,
        "secondsLeft": seconds_left,
        "up": up,
        "down": down,
        "upBestAsk": up_best,
        "downBestAsk": down_best,
        "upBestBid": up_bid,
        "downBestBid": down_bid,
        "arbRows": arb_rows,
        "updatedAt": updated_at,
        "ageSeconds": round(time.time() - updated_at, 1) if updated_at else None,
        "logFile": str(log_file) if log_file else "",
        "logExists": bool(log_file and log_file.exists()),
        "error": error,
    }


def _write_csv_snapshot(snapshot: dict) -> None:
    timeframe = snapshot["timeframe"]
    slug = snapshot["slug"]
    if not slug or not snapshot["up"] or not snapshot["down"]:
        return

    log_dir = ROOT / ("logs_1h" if timeframe == "1h" else "logs")
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / f"{slug}.csv"
    first_write = not log_file.exists()

    fields = [
        "timestamp_ms",
        "market_slug",
        "timeframe",
        "time_till_end",
        "seconds_till_end",
        "up_best_bid",
        "up_best_ask",
        "down_best_bid",
        "down_best_ask",
        "up_spread",
        "down_spread",
        "up_bid_depth5",
        "up_ask_depth5",
        "down_bid_depth5",
        "down_ask_depth5",
        "up_imbalance",
        "down_imbalance",
        "up_microprice",
        "down_microprice",
        "arb_bid_sum_l1",
        "arb_edge_l1",
    ]

    row = {
        "timestamp_ms": int(time.time() * 1000),
        "market_slug": slug,
        "timeframe": timeframe,
        "time_till_end": snapshot["timeLeft"],
        "seconds_till_end": snapshot["secondsLeft"],
        "up_best_bid": snapshot["up"]["bestBid"],
        "up_best_ask": snapshot["up"]["bestAsk"],
        "down_best_bid": snapshot["down"]["bestBid"],
        "down_best_ask": snapshot["down"]["bestAsk"],
        "up_spread": snapshot["up"]["spread"],
        "down_spread": snapshot["down"]["spread"],
        "up_bid_depth5": snapshot["up"]["bidDepth5"],
        "up_ask_depth5": snapshot["up"]["askDepth5"],
        "down_bid_depth5": snapshot["down"]["bidDepth5"],
        "down_ask_depth5": snapshot["down"]["askDepth5"],
        "up_imbalance": snapshot["up"]["imbalance"],
        "down_imbalance": snapshot["down"]["imbalance"],
        "up_microprice": snapshot["up"]["microprice"],
        "down_microprice": snapshot["down"]["microprice"],
        "arb_bid_sum_l1": snapshot["arbRows"][0]["sum"] if snapshot["arbRows"] else None,
        "arb_edge_l1": snapshot["arbRows"][0]["edge"] if snapshot["arbRows"] else None,
    }

    import csv

    with log_file.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        if first_write:
            writer.writeheader()
        writer.writerow(row)


def poll_loop() -> None:
    cached_timeframe = None
    cached_slug = None
    cached_tokens = None

    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="polyrec-book") as pool:
        while not stop_event.is_set():
            loop_started = time.monotonic()
            try:
                with state_lock:
                    timeframe = state["timeframe"]

                dash.configure_market(timeframe, enable_chainlink=False)
                slug = dash.current_btc_slug()

                if timeframe != cached_timeframe or slug != cached_slug or not cached_tokens:
                    cached_tokens = dash.fetch_pm_tokens()
                    cached_timeframe = timeframe
                    cached_slug = slug

                if not cached_tokens:
                    raise RuntimeError(f"no tokens for {slug}")

                up_future = pool.submit(dash.fetch_orderbook, cached_tokens["up"])
                down_future = pool.submit(dash.fetch_orderbook, cached_tokens["down"])
                up_book = up_future.result()
                down_book = down_future.result()
                up = _book_view(up_book)
                down = _book_view(down_book)

                with state_lock:
                    state.update({
                        "slug": slug,
                        "tokens": cached_tokens,
                        "up": up,
                        "down": down,
                        "updated_at": time.time(),
                        "error": "",
                    })

                _write_csv_snapshot(_snapshot())
            except Exception as exc:
                cached_tokens = None
                with state_lock:
                    state["error"] = str(exc)

            elapsed = time.monotonic() - loop_started
            stop_event.wait(max(0.0, POLL_SECONDS - elapsed))


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, value: dict, status: int = 200) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            self._send_json(_snapshot())
            return

        if parsed.path == "/api/set":
            params = parse_qs(parsed.query)
            timeframe = params.get("timeframe", ["15m"])[0]
            if timeframe not in {"15m", "1h"}:
                self._send_json({"ok": False, "error": "timeframe must be 15m or 1h"}, 400)
                return
            with state_lock:
                state["timeframe"] = timeframe
                state["slug"] = ""
                state["tokens"] = None
                state["up"] = None
                state["down"] = None
                state["updated_at"] = 0.0
                state["error"] = ""
            self._send_json({"ok": True, "timeframe": timeframe})
            return

        if parsed.path == "/api/history":
            self._send_json(_history_snapshot())
            return

        if parsed.path == "/api/history/start":
            params = parse_qs(parsed.query)
            try:
                count = int(params.get("hours", ["100"])[0])
                threshold = float(params.get("threshold", ["0.30"])[0])
            except ValueError:
                self._send_json({"ok": False, "error": "小时数量和阈值必须是数字"}, 400)
                return

            timeframe = params.get("timeframe", [""])[0]
            if timeframe not in {"15m", "1h"}:
                with state_lock:
                    timeframe = state["timeframe"]

            count = max(1, min(count, 1500))
            threshold = max(0.01, min(threshold, 0.99))
            with history_lock:
                if history_job["running"]:
                    self._send_json({"ok": False, "error": "历史任务正在运行"}, 409)
                    return

            thread = threading.Thread(target=_run_history_job, args=(count, threshold, timeframe), daemon=True)
            thread.start()
            self._send_json({"ok": True, "hours": count, "timeframe": timeframe, "threshold": threshold})
            return

        path = parsed.path
        if path == "/":
            path = "/index.html"
        target = (WEB_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(WEB_DIR.resolve())) or not target.exists():
            self.send_error(404)
            return

        content_type = "text/plain; charset=utf-8"
        if target.suffix == ".html":
            content_type = "text/html; charset=utf-8"
        elif target.suffix == ".css":
            content_type = "text/css; charset=utf-8"
        elif target.suffix == ".js":
            content_type = "text/javascript; charset=utf-8"

        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    thread = threading.Thread(target=poll_loop, daemon=True)
    thread.start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"Polyrec web dashboard: {url}")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        server.server_close()


if __name__ == "__main__":
    main()
