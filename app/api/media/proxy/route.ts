import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only allow proxying from these trusted CDN domains
const ALLOWED_HOSTS = [
  "instagram.com",
  "cdninstagram.com",
  "fbcdn.net",
  "scontent",           // Instagram CDN prefix
  "tiktokcdn.com",
  "tiktok.com",
  "p16-sign.tiktokcdn-us.com",
  "p19-sign.tiktokcdn-us.com",
  "p16-sign-va.tiktokcdn.com",
];

function isAllowedUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  // Require authentication
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("URL is required", { status: 400 });
  }

  if (!isAllowedUrl(url)) {
    return new NextResponse("URL not allowed", { status: 403 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
    headers.set("Cache-Control", "public, max-age=86400");

    const download = searchParams.get("download");
    if (download === "1") {
      const filename = searchParams.get("filename") || "foto.jpg";
      // Sanitize filename to prevent header injection
      const safeFilename = filename.replace(/[^\w.-]/g, "_").slice(0, 100);
      headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);
    }

    return new NextResponse(buffer, { headers });
  } catch (error) {
    console.error("Proxy error:", error);
    return new NextResponse("Failed to proxy", { status: 500 });
  }
}
