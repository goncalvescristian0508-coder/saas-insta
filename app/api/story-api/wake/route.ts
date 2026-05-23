import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const url = process.env.STORY_API_URL;
  if (!url) return NextResponse.json({ ok: false });
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(25_000) });
    const json = await res.json();
    return NextResponse.json({ ok: true, ...json });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
