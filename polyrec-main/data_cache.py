from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "local_data"
DEFAULT_DB = DATA_DIR / "polymarket_btc.sqlite"
GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"
TIMEFRAMES = ("1h", "4h", "daily")

try:
    ET_TZ = ZoneInfo("America/New_York")
except ZoneInfoNotFoundError:
    ET_TZ = timezone(timedelta(hours=-4), "ET")


def now_ts() -> int:
    return int(time.time())


def log(message: str = "") -> None:
    print(message, flush=True)


def json_value(value, fallback=None):
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    return value


def init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS markets (
            slug TEXT PRIMARY KEY,
            timeframe TEXT NOT NULL,
            slot_start_ts INTEGER,
            slot_end_ts INTEGER,
            title TEXT,
            closed INTEGER NOT NULL DEFAULT 0,
            winner TEXT,
            up_token TEXT,
            down_token TEXT,
            volume REAL,
            end_date TEXT,
            event_json TEXT,
            market_json TEXT,
            fetched_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS price_points (
            slug TEXT NOT NULL,
            side TEXT NOT NULL,
            token_id TEXT NOT NULL,
            t INTEGER NOT NULL,
            p REAL NOT NULL,
            PRIMARY KEY (slug, side, t)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_points_token_t ON price_points(token_id, t)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_markets_timeframe_slot ON markets(timeframe, slot_start_ts)")
    conn.commit()
    return conn


def hourly_slug(dt_et: datetime) -> str:
    dt_et = dt_et.replace(minute=0, second=0, microsecond=0)
    month = dt_et.strftime("%B").lower()
    hour_12 = dt_et.strftime("%I").lstrip("0") or "12"
    ampm = dt_et.strftime("%p").lower()
    return f"bitcoin-up-or-down-{month}-{dt_et.day}-{dt_et.year}-{hour_12}{ampm}-et"


def daily_slug(day_et: date) -> str:
    month = day_et.strftime("%B").lower()
    return f"bitcoin-up-or-down-on-{month}-{day_et.day}-{day_et.year}"


def target_markets(timeframe: str, limit: int) -> list[dict]:
    if timeframe == "1h":
        current = datetime.now(tz=ET_TZ).replace(minute=0, second=0, microsecond=0)
        out = []
        for offset in range(1, limit + 1):
            start = current - timedelta(hours=offset)
            start_ts = int(start.timestamp())
            out.append({
                "timeframe": timeframe,
                "slug": hourly_slug(start),
                "slot_start_ts": start_ts,
                "slot_end_ts": start_ts + 3600,
            })
        return out

    if timeframe == "4h":
        current_slot = (now_ts() // 14400) * 14400
        return [
            {
                "timeframe": timeframe,
                "slug": f"btc-updown-4h-{current_slot - offset * 14400}",
                "slot_start_ts": current_slot - offset * 14400,
                "slot_end_ts": current_slot - (offset - 1) * 14400,
            }
            for offset in range(1, limit + 1)
        ]

    if timeframe == "daily":
        today_et = datetime.now(tz=ET_TZ).date()
        out = []
        for offset in range(1, limit + 1):
            day = today_et - timedelta(days=offset)
            start = datetime(day.year, day.month, day.day, tzinfo=ET_TZ)
            start_ts = int(start.timestamp())
            out.append({
                "timeframe": timeframe,
                "slug": daily_slug(day),
                "slot_start_ts": start_ts,
                "slot_end_ts": start_ts + 86400,
            })
        return out

    raise ValueError(f"unsupported timeframe: {timeframe}")


def fetch_event(session: requests.Session, slug: str) -> dict | None:
    resp = session.get(f"{GAMMA_API}/events", params={"slug": slug}, timeout=15)
    resp.raise_for_status()
    events = resp.json()
    return events[0] if events else None


def market_from_event(event: dict) -> dict | None:
    markets = event.get("markets") or []
    return markets[0] if markets else None


def tokens_from_market(market: dict) -> dict:
    token_ids = json_value(market.get("clobTokenIds"), [])
    outcomes = json_value(market.get("outcomes"), [])
    up_idx = outcomes.index("Up") if "Up" in outcomes else 0
    down_idx = outcomes.index("Down") if "Down" in outcomes else 1
    return {"up": str(token_ids[up_idx]), "down": str(token_ids[down_idx])}


def winner_from_market(market: dict) -> str:
    outcomes = json_value(market.get("outcomes"), [])
    prices = json_value(market.get("outcomePrices"), [])
    if not outcomes or not prices:
        return ""
    best_idx = max(range(len(prices)), key=lambda i: float(prices[i]))
    return str(outcomes[best_idx])


def fetch_price_history(
    session: requests.Session,
    token_id: str,
    start_ts: int | None = None,
    end_ts: int | None = None,
) -> list[dict]:
    params = {"market": token_id, "fidelity": 1}
    if start_ts and end_ts:
        params.update({"startTs": start_ts, "endTs": end_ts})
    else:
        params["interval"] = "max"

    resp = session.get(f"{CLOB_API}/prices-history", params=params, timeout=20)
    resp.raise_for_status()
    points = []
    for point in resp.json().get("history") or []:
        try:
            points.append({"t": int(point["t"]), "p": float(point["p"])})
        except (KeyError, TypeError, ValueError):
            continue
    points.sort(key=lambda item: item["t"])
    return points


def existing_complete(conn: sqlite3.Connection, slug: str) -> bool:
    row = conn.execute(
        """
        SELECT closed,
               (SELECT COUNT(*) FROM price_points WHERE slug = markets.slug AND side = 'up') AS up_points,
               (SELECT COUNT(*) FROM price_points WHERE slug = markets.slug AND side = 'down') AS down_points
        FROM markets
        WHERE slug = ?
        """,
        (slug,),
    ).fetchone()
    return bool(row and row[0] and row[1] > 0 and row[2] > 0)


def save_market(
    conn: sqlite3.Connection,
    item: dict,
    event: dict,
    market: dict,
    tokens: dict,
) -> None:
    closed = bool(event.get("closed") or market.get("closed"))
    winner = winner_from_market(market) if closed else ""
    conn.execute(
        """
        INSERT INTO markets (
            slug, timeframe, slot_start_ts, slot_end_ts, title, closed, winner,
            up_token, down_token, volume, end_date, event_json, market_json, fetched_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
            timeframe = excluded.timeframe,
            slot_start_ts = excluded.slot_start_ts,
            slot_end_ts = excluded.slot_end_ts,
            title = excluded.title,
            closed = excluded.closed,
            winner = excluded.winner,
            up_token = excluded.up_token,
            down_token = excluded.down_token,
            volume = excluded.volume,
            end_date = excluded.end_date,
            event_json = excluded.event_json,
            market_json = excluded.market_json,
            fetched_at = excluded.fetched_at
        """,
        (
            item["slug"],
            item["timeframe"],
            item["slot_start_ts"],
            item["slot_end_ts"],
            event.get("title") or market.get("question") or item["slug"],
            int(closed),
            winner,
            tokens["up"],
            tokens["down"],
            float(event.get("volume") or market.get("volume") or 0),
            event.get("endDate") or market.get("endDate") or "",
            json.dumps(event, ensure_ascii=False),
            json.dumps(market, ensure_ascii=False),
            now_ts(),
        ),
    )


def save_points(conn: sqlite3.Connection, slug: str, side: str, token_id: str, points: list[dict]) -> None:
    conn.executemany(
        """
        INSERT OR IGNORE INTO price_points (slug, side, token_id, t, p)
        VALUES (?, ?, ?, ?, ?)
        """,
        [(slug, side, token_id, point["t"], point["p"]) for point in points],
    )


def sync_timeframe(
    conn: sqlite3.Connection,
    session: requests.Session,
    timeframe: str,
    limit: int,
    refresh: bool,
    delay: float,
) -> None:
    items = target_markets(timeframe, limit)
    log(f"\n[{timeframe}] 计划检查市场数量：{len(items)}")
    for idx, item in enumerate(items, start=1):
        slug = item["slug"]
        if not refresh and existing_complete(conn, slug):
            log(f"[{timeframe}] {idx}/{limit} 跳过，已有完整数据：{slug}")
            continue

        try:
            event = fetch_event(session, slug)
            if not event:
                log(f"[{timeframe}] {idx}/{limit} 没找到这个市场：{slug}")
                continue
            market = market_from_event(event)
            if not market:
                log(f"[{timeframe}] {idx}/{limit} 事件里没有市场数据：{slug}")
                continue
            tokens = tokens_from_market(market)
            start_ts = int(item["slot_start_ts"]) - 3600
            end_ts = int(item["slot_end_ts"]) + 3600
            up_points = fetch_price_history(session, tokens["up"], start_ts, end_ts)
            if delay:
                time.sleep(delay)
            down_points = fetch_price_history(session, tokens["down"], start_ts, end_ts)

            save_market(conn, item, event, market, tokens)
            save_points(conn, slug, "up", tokens["up"], up_points)
            save_points(conn, slug, "down", tokens["down"], down_points)
            conn.commit()

            closed = bool(event.get("closed") or market.get("closed"))
            log(
                f"[{timeframe}] {idx}/{limit} 已保存：{slug} "
                f"已结束={int(closed)} UP曲线点={len(up_points)} DOWN曲线点={len(down_points)}"
            )
        except Exception as exc:
            conn.rollback()
            log(f"[{timeframe}] {idx}/{limit} 出错：{slug}：{exc}")

        if delay:
            time.sleep(delay)


def status(conn: sqlite3.Connection) -> None:
    log("本地数据状态")
    for timeframe in TIMEFRAMES:
        row = conn.execute(
            """
            SELECT COUNT(*),
                   SUM(CASE WHEN closed = 1 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN
                       (SELECT COUNT(*) FROM price_points WHERE slug = markets.slug AND side = 'up') > 0
                       AND
                       (SELECT COUNT(*) FROM price_points WHERE slug = markets.slug AND side = 'down') > 0
                       THEN 1 ELSE 0 END),
                   COALESCE(SUM((SELECT COUNT(*) FROM price_points WHERE slug = markets.slug AND side = 'up')), 0),
                   COALESCE(SUM((SELECT COUNT(*) FROM price_points WHERE slug = markets.slug AND side = 'down')), 0),
                   MIN(slot_start_ts),
                   MAX(slot_start_ts)
            FROM markets
            WHERE timeframe = ?
            """,
            (timeframe,),
        ).fetchone()
        total, closed, complete, up_points, down_points, min_ts, max_ts = row
        log(
            f"{timeframe:5} 市场数={total or 0} 已结束={closed or 0} 完整曲线={complete or 0} "
            f"UP点数={up_points or 0} DOWN点数={down_points or 0}"
        )
        if min_ts and max_ts:
            start = datetime.fromtimestamp(min_ts, ET_TZ).strftime("%Y-%m-%d %H:%M ET")
            end = datetime.fromtimestamp(max_ts, ET_TZ).strftime("%Y-%m-%d %H:%M ET")
            log(f"      时间范围={start} -> {end}")


def export_csv(conn: sqlite3.Connection, out_dir: Path) -> None:
    out_dir.mkdir(exist_ok=True)
    for timeframe in TIMEFRAMES:
        path = out_dir / f"btc_{timeframe}_price_points.csv"
        rows = conn.execute(
            """
            SELECT m.timeframe, m.slug, m.title, m.closed, m.winner,
                   m.slot_start_ts, m.slot_end_ts, p.side, p.t, p.p
            FROM price_points p
            JOIN markets m ON m.slug = p.slug
            WHERE m.timeframe = ?
            ORDER BY m.slot_start_ts DESC, p.side, p.t
            """,
            (timeframe,),
        )
        with path.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow([
                "timeframe", "slug", "title", "closed", "winner",
                "slot_start_ts", "slot_end_ts", "side", "price_ts", "price",
            ])
            writer.writerows(rows)
        log(f"已导出：{path}")


def parse_timeframes(values: Iterable[str] | None) -> list[str]:
    if not values or "all" in values:
        return list(TIMEFRAMES)
    return list(dict.fromkeys(values))


def interactive_menu() -> None:
    conn = init_db(DEFAULT_DB)
    while True:
        log()
        log("Polymarket BTC 本地数据工具")
        log("1. 查看本地数据数量")
        log("2. 下载/更新最新数据（1小时/4小时各240条，日线能拿多少拿多少）")
        log("3. 导出本地数据到 CSV")
        log("4. 退出")
        choice = input("请输入 1/2/3/4，然后按回车：").strip()

        if choice == "1":
            status(conn)
        elif choice == "2":
            session = requests.Session()
            log("开始下载/更新。下面会显示进度：")
            log("saved = 新保存或刷新成功；skip = 本地已经有了，跳过；missing = 这个市场不存在。")
            for timeframe in TIMEFRAMES:
                sync_timeframe(
                    conn=conn,
                    session=session,
                    timeframe=timeframe,
                    limit=240,
                    refresh=False,
                    delay=0.08,
                )
            status(conn)
            log("下载/更新完成。")
        elif choice == "3":
            export_csv(conn, DATA_DIR / "exports")
            log("导出完成。")
        elif choice == "4":
            return
        else:
            log("请输入 1、2、3 或 4。")


def main() -> None:
    if len(sys.argv) == 1:
        interactive_menu()
        print()
        input("按回车退出...")
        return

    parser = argparse.ArgumentParser(description="Cache Polymarket BTC Up/Down price-history data locally.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite database path")
    sub = parser.add_subparsers(dest="command", required=True)

    sync_parser = sub.add_parser("sync", help="Fetch missing BTC market data into the local SQLite cache")
    sync_parser.add_argument("--timeframes", nargs="+", choices=("all",) + TIMEFRAMES, default=["all"])
    sync_parser.add_argument("--limit", type=int, default=240, help="Markets per timeframe")
    sync_parser.add_argument("--refresh", action="store_true", help="Re-fetch markets that are already complete")
    sync_parser.add_argument("--delay", type=float, default=0.08, help="Small delay between CLOB requests")

    sub.add_parser("status", help="Show local cache counts")

    export_parser = sub.add_parser("export", help="Export cached points to CSV files")
    export_parser.add_argument("--out", default=str(DATA_DIR / "exports"))

    args = parser.parse_args()
    conn = init_db(Path(args.db))

    if args.command == "sync":
        session = requests.Session()
        for timeframe in parse_timeframes(args.timeframes):
            sync_timeframe(
                conn=conn,
                session=session,
                timeframe=timeframe,
                limit=max(1, args.limit),
                refresh=args.refresh,
                delay=max(0.0, args.delay),
            )
        status(conn)
    elif args.command == "status":
        status(conn)
    elif args.command == "export":
        export_csv(conn, Path(args.out))


if __name__ == "__main__":
    main()
