import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const isAuthPage =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/reset-password");

  const isPublicPage =
    path.startsWith("/privacy") ||
    path.startsWith("/terms");

  const isPendingApprovalPage = path.startsWith("/pending-approval");

  const isPublicApi =
    path.startsWith("/api/auth/callback") ||
    path.startsWith("/api/auth/instagram") ||
    path.startsWith("/api/instagram/oauth") ||
    path.startsWith("/api/instagram/deauth") ||
    path.startsWith("/api/instagram/deletion") ||
    path.startsWith("/api/admin/meta-test") ||
    path.startsWith("/api/cron/") ||
    path.startsWith("/api/webhooks/") ||
    path.startsWith("/connect/") ||
    path.startsWith("/connect-error");

  // Redirect unauthenticated users to login
  if (!user && !isAuthPage && !isPublicPage && !isPublicApi && !isPendingApprovalPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Block unapproved users — redirect to pending-approval page
  if (user && !isAuthPage && !isPublicPage && !isPublicApi && !isPendingApprovalPage) {
    const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
    const isAdmin = user.email === adminEmail;
    if (!isAdmin && user.app_metadata?.approved === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/pending-approval";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
