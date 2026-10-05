import json, urllib.request
from datetime import datetime, timezone

STATE = "data/state.json"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "TradeAjanMark/1.0"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())

def binance(symbols):
    if not symbols:
        return {}
    q = urllib.parse.quote(json.dumps(symbols))
    rows = get(f"https://data-api.binance.vision/api/v3/ticker/price?symbols={q}")
    return {r["symbol"]: float(r["price"]) for r in rows}

def yahoo(symbols):
    out = {}
    for sym in symbols:
        try:
            data = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval=1d&range=1d")
            meta = data["chart"]["result"][0]["meta"]
            px = meta.get("regularMarketPrice") or meta.get("chartPreviousClose")
            if px:
                out[sym] = float(px)
        except Exception:
            pass
    return out

def shares_of(p, fx):
    if not str(p.get("symbol", "")).endswith(".IS"):
        return float(p.get("qty_left") or 0)
    if p.get("qty_is_shares"):
        return float(p.get("qty_left") or 0)
    return float(p.get("qty_left") or 0) * fx

def usd_px(symbol, px, fx):
    if str(symbol).endswith(".IS"):
        return float(px) / fx
    return float(px)

def main():
    import urllib.parse
    state = json.load(open(STATE))
    cfg = state.get("config") or {}
    symbols = set((state.get("quotes") or {}).keys())
    symbols.update(cfg.get("alt_universe") or [])
    symbols.update(cfg.get("us_universe") or [])
    symbols.update(cfg.get("bist_universe") or [])
    bsyms = sorted(s for s in symbols if s.endswith("USDT"))
    ysyms = sorted(s for s in symbols if not s.endswith("USDT"))
    quotes = {}
    try:
        quotes.update(binance(bsyms))
    except Exception as e:
        print("binance", e)
    try:
        fxrow = get("https://data-api.binance.vision/api/v3/ticker/price?symbol=USDTTRY")
        quotes["USDTTRY"] = float(fxrow["price"])
    except Exception as e:
        print("fx", e)
    quotes.update(yahoo(ysyms))
    fx = quotes.get("USDTTRY") or (state.get("fx") or {}).get("USDTTRY") or 49
    state["quotes"] = {**(state.get("quotes") or {}), **quotes}
    state.setdefault("fx", {})["USDTTRY"] = fx
    near = []
    for key, book in state.get("books", {}).items():
        unreal = hold = 0
        for p in book.get("positions") or []:
            native = state["quotes"].get(p["symbol"], p.get("entry"))
            shares = shares_of(p, fx)
            px = usd_px(p["symbol"], native, fx)
            entry = usd_px(p["symbol"], p.get("entry"), p.get("fx_entry") or fx)
            unreal += shares * (px - entry)
            hold += shares * px
            for label, level in (("stop", p.get("stop")), ("tp1", p.get("tp1")), ("tp2", p.get("tp2"))):
                if not level or not native:
                    continue
                if abs(float(native) - float(level)) / float(level) <= 0.004:
                    near.append({"symbol": p["symbol"], "level": label, "px": native})
        book["unrealized"] = round(unreal, 2)
        book["equity"] = round((book.get("cash") or 0) + hold, 2)
        book["open_count"] = len(book.get("positions") or [])
    state["mark"] = {"at": datetime.now(timezone.utc).isoformat(), "source": "github-action", "near": near[:12]}
    json.dump(state, open(STATE, "w"), ensure_ascii=False, indent=2)
    print("marked", len(quotes), "near", len(near))

if __name__ == "__main__":
    main()
