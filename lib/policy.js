// Policy before prompt. Rules live here, not only in agent text.
// Agents propose. This module decides whether a write is allowed.

function zoned(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }[get("weekday")] ?? 0;
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday,
  };
}

const BIST_CLOSED = new Set(["2026-01-01", "2026-03-20", "2026-03-21", "2026-03-22", "2026-04-23", "2026-05-01", "2026-05-19", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-07-15", "2026-10-29"]);
const BIST_HALF = new Set(["2026-03-19", "2026-05-26", "2026-10-28"]);
const US_CLOSED = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);
const US_EARLY = new Set(["2026-11-27", "2026-12-24"]);

function sessionOpen(market, now = new Date()) {
  if (market === "binance") return { open: true, reason: "7/24" };
  if (market === "bist") {
    const z = zoned(now, "Europe/Istanbul");
    if (z.weekday === 0 || z.weekday === 6) return { open: false, reason: "WAIT_SESSION hafta sonu" };
    if (BIST_CLOSED.has(z.ymd)) return { open: false, reason: "WAIT_SESSION tatil" };
    const end = BIST_HALF.has(z.ymd) ? 13 * 60 : 18 * 60;
    const open = z.minutes >= 10 * 60 && z.minutes < end;
    return { open, reason: open ? "BIST acik" : "WAIT_SESSION seans kapali" };
  }
  const z = zoned(now, "America/New_York");
  if (z.weekday === 0 || z.weekday === 6) return { open: false, reason: "WAIT_SESSION hafta sonu" };
  if (US_CLOSED.has(z.ymd)) return { open: false, reason: "WAIT_SESSION tatil" };
  const end = US_EARLY.has(z.ymd) ? 13 * 60 : 16 * 60;
  const open = z.minutes >= 9 * 60 + 30 && z.minutes < end;
  return { open, reason: open ? "ABD acik" : "WAIT_SESSION seans kapali" };
}

function bookIntegrity(state) {
  const required = ["binance", "us", "bist", "tavan"];
  const missing = required.filter((k) => !state?.books?.[k]);
  return {
    ok: missing.length === 0,
    missing,
    reason: missing.length ? `defter eksik: ${missing.join(",")}` : "defter butun",
  };
}

function canBuy(state, market, opts = {}) {
  const checks = [];
  const integ = bookIntegrity(state);
  checks.push({ rule: "integrity", pass: integ.ok, reason: integ.reason });
  if (!integ.ok) return { allowed: false, checks, reason: integ.reason };

  const sess = sessionOpen(market);
  checks.push({ rule: "session", pass: sess.open, reason: sess.reason });
  if (!sess.open && market !== "binance") {
    return { allowed: false, checks, reason: sess.reason };
  }

  const book = state.books[market];
  const start = book.start || 4000;
  const dayPnl = (book.equity || 0) - start;
  const dayHalt = dayPnl <= start * -0.01;
  checks.push({ rule: "day_halt", pass: !dayHalt, reason: dayHalt ? "kitap -%1" : "gunluk limit icinde" });
  if (dayHalt) return { allowed: false, checks, reason: "WAIT day halt" };

  if (market === "binance") {
    const alts = (book.positions || []).filter((p) => p.bucket === "alt" || (p.symbol && p.symbol !== "BTCUSDT" && p.symbol !== "ETHUSDT")).length;
    const room = alts < (state.config?.risk_rules?.max_open_alts || 3);
    checks.push({ rule: "alt_count", pass: room, reason: room ? `alt ${alts}/3` : "alt 3 dolu" });
    const used = book.alt_used || 0;
    const capOk = used < (state.config?.binance_alt_cap || 1400);
    checks.push({ rule: "alt_cap", pass: capOk, reason: capOk ? `used ${used}` : "alt cap dolu" });
    if (!room || !capOk) return { allowed: false, checks, reason: "WAIT alt limit" };
  }

  const theme = opts.theme;
  if (theme && opts.themeWeight != null && opts.themeWeight > (state.config?.theme_cap || 0.4)) {
    checks.push({ rule: "theme_cap", pass: false, reason: `${theme} %40 ustu` });
    return { allowed: false, checks, reason: "WAIT theme cap" };
  }
  checks.push({ rule: "theme_cap", pass: true, reason: "tema ok" });

  return { allowed: true, checks, reason: "policy pass" };
}

function protectedKeys() {
  return ["books.us", "books.bist", "books.tavan", "config", "journal", "fx"];
}

function assertScopedWrite(market, payload) {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "bos payload" };
  if (market === "binance" && payload.books && (payload.books.us || payload.books.bist)) {
    return { ok: false, reason: "binance turu us/bist dokunamaz" };
  }
  if (market === "us" && payload.books && (payload.books.binance || payload.books.bist)) {
    return { ok: false, reason: "abd turu binance/bist dokunamaz" };
  }
  if (market === "bist" && payload.books && (payload.books.binance || payload.books.us)) {
    return { ok: false, reason: "bist turu binance/abd dokunamaz" };
  }
  return { ok: true, reason: "scope ok" };
}

module.exports = { sessionOpen, bookIntegrity, canBuy, protectedKeys, assertScopedWrite };
