import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function DELETE(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { type } = await request.json() as { type: "duplicates" | "all" };
  if (type !== "duplicates" && type !== "all") {
    return NextResponse.json({ error: "type deve ser 'duplicates' ou 'all'" }, { status: 400 });
  }

  const storage = storageAdmin();

  if (type === "all") {
    const videos = await prisma.libraryVideo.findMany({ where: { userId: user.id } });
    await storage.storage.from("library-videos").remove(videos.map((v) => v.storagePath));
    const { count } = await prisma.libraryVideo.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ deleted: count });
  }

  // Find duplicates: group by sizeBytes + originalName, keep the oldest, delete the rest
  const videos = await prisma.libraryVideo.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const seen = new Map<string, string>(); // key -> id to keep
  const toDelete: typeof videos = [];

  for (const v of videos) {
    const key = `${v.sizeBytes}__${v.originalName}`;
    if (seen.has(key)) {
      toDelete.push(v);
    } else {
      seen.set(key, v.id);
    }
  }

  if (toDelete.length === 0) return NextResponse.json({ deleted: 0 });

  await storage.storage.from("library-videos").remove(toDelete.map((v) => v.storagePath));
  await prisma.libraryVideo.deleteMany({ where: { id: { in: toDelete.map((v) => v.id) } } });

  return NextResponse.json({ deleted: toDelete.length });
}
