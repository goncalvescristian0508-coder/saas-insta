import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id: targetId } = await params;
  if (!targetId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  if (targetId === user.id) return NextResponse.json({ error: "Não pode deletar a própria conta" }, { status: 400 });

  // Delete all Prisma records for this user
  await prisma.$transaction([
    prisma.scheduledPost.deleteMany({ where: { userId: targetId } }),
    prisma.cloneJob.deleteMany({ where: { userId: targetId } }),
    prisma.libraryVideo.deleteMany({ where: { userId: targetId } }),
    prisma.instagramOAuthAccount.deleteMany({ where: { userId: targetId } }),
    prisma.privateInstagramAccount.deleteMany({ where: { userId: targetId } }),
    prisma.userApifyToken.deleteMany({ where: { userId: targetId } }),
    prisma.userIntegration.deleteMany({ where: { userId: targetId } }),
    prisma.sale.deleteMany({ where: { userId: targetId } }),
  ]);

  // Delete from Supabase Auth
  const { error } = await adminClient().auth.admin.deleteUser(targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
