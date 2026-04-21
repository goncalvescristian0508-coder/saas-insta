import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

  const allowed = ["video/mp4", "video/quicktime", "video/mov", "video/x-msvideo"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Formato inválido. Use MP4 ou MOV." }, { status: 400 });
  }

  const MAX_SIZE = 200 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande. Máximo 200MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "mp4";
  const storagePath = `${user.id}/${uuidv4()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const storageClient = createStorageClient();
  const { error: uploadError } = await storageClient
    .storage
    .from("library-videos")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Erro no upload: ${uploadError.message}` }, { status: 500 });
  }

  const { data: publicData } = storageClient
    .storage
    .from("library-videos")
    .getPublicUrl(storagePath);

  const video = await prisma.libraryVideo.create({
    data: {
      userId: user.id,
      filename: `${uuidv4()}.${ext}`,
      originalName: file.name,
      storagePath,
      publicUrl: publicData.publicUrl,
      sizeBytes: file.size,
      mimeType: file.type,
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

function createStorageClient() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
