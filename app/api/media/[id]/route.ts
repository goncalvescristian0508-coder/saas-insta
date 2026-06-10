import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { coverUrl } = await request.json() as { coverUrl: string | null };

  const video = await prisma.libraryVideo.findFirst({ where: { id, userId: user.id } });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const updated = await prisma.libraryVideo.update({
    where: { id },
    data: { coverUrl: coverUrl ?? null },
  });

  return NextResponse.json({ ok: true, coverUrl: updated.coverUrl });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const video = await prisma.libraryVideo.findFirst({
    where: { id, userId: user.id },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await storage.storage.from("library-videos").remove([video.storagePath]);
  await prisma.libraryVideo.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
