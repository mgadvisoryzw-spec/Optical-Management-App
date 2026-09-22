import { NextResponse, type NextRequest } from "next/server";
import { paynowResult } from "@/lib/billing";

export async function POST(req: NextRequest) {
  const body = Object.fromEntries(new URLSearchParams(await req.text()));
  const ok = await paynowResult(body);
  return new NextResponse(ok ? "OK" : "Invalid", { status: ok ? 200 : 400 });
}
