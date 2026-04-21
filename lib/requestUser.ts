import { createClient } from "@/lib/supabase/server";

export async function getRequestUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getOrCreateRequestUserId(): Promise<{ userId: string; created: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { userId: user.id, created: false };
  return { userId: "anonymous", created: false };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function attachRequestUserCookie(_response: unknown, _userId: string): void {
  // No-op: Supabase manages its own session cookies
}
