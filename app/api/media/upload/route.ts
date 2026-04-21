import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json() as {
    storagePath: string;
    originalName: string;
    sizeBytes: number;
    mimeType: string;
    publicUrl: string;
  };

  const { storagePath, originalName, sizeBytes, mimeType, publicUrl } = body;
  if (!storagePath || !originalName || !publicUrl) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  const video = await prisma.libraryVideo.create({
    data: {
      userId: user.id,
      filename: storagePath.split("/").pop() ?? storagePath,
      originalName,
      storagePath,
      publicUrl,
      sizeBytes: sizeBytes ?? 0,
      mimeType: mimeType ?? "video/mp4",
    },
  });

  return NextResponse.json({ video });
}

export async function GET() {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const videos = await prisma.libraryVideo.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ videos });
}
