import { NextResponse } from "next/server";
import { listContexts } from "@/lib/repository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? undefined;
  const risk = url.searchParams.get("risk") ?? undefined;
  const contexts = await listContexts(query, risk);
  return NextResponse.json({ contexts });
}
