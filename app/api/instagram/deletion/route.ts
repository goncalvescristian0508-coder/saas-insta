import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ url: "https://saas-insta.vercel.app", confirmation_code: "deletion_confirmed" });
}
