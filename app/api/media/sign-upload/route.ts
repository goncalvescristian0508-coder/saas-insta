import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename") ?? "video.mp4";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp4";
  const storagePath = `${user.id}/${uuidv4()}.${ext}`;

  const admin = storageAdmin();
  const { data, error } = await admin.storage
    .from("library-videos")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar URL de upload" }, { status: 500 });
  }

  const { data: publicData } = admin.storage
    .from("library-videos")
    .getPublicUrl(storagePath);

  return NextResponse.json({
    signedUrl: data.signedUrl,
    storagePath,
    publicUrl: publicData.publicUrl,
  });
}
