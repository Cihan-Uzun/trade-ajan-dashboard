export const dynamic = "force-dynamic";

const BASE = "https://raw.githubusercontent.com/Cihan-Uzun/trade-ajan-dashboard/main/data/history";

async function read(path) {
  const res = await fetch(BASE + path + "?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error(res.status + " " + path);
  return res.json();
}

export async function GET(req) {
  try {
    const date = new URL(req.url).searchParams.get("date");
    const index = await read("/index.json");
    const snap = date ? await read("/" + date + ".json") : null;
    return Response.json({ ok: true, dates: index.dates || [], snap });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
