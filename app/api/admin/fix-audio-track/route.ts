import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ ok: true, test: "minimal" });
}

export async function POST() {
  return NextResponse.json({ ok: true, test: "minimal-post" });
}
