import { NextResponse } from "next/server";

/** @deprecated Use GET /api/auth/instagram (Instagram Login em api.instagram.com). */
export async function GET(request: Request) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;
  return NextResponse.redirect(`${base}/api/auth/instagram`, 307);
}
