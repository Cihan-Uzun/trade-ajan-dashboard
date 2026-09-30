const { refreshState, totals } = require("../../../lib/engine");

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await refreshState();
    return Response.json({
      ok: true,
      mode: "PAPER",
      note: "Fiyatlar canli cekildi, pozisyonlar mark-to-market.",
      totals: totals(state),
      state,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
