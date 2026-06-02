import { NextResponse } from "next/server";
import { parseImportInput } from "@/lib/kubeconfig";
import { saveImportResult } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = parseImportInput(body);
    const batch = await saveImportResult(result);
    return NextResponse.json({
      batchId: batch?.id,
      summary: result.summary,
      imported: result.contexts.length
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "导入失败" },
      { status: 400 }
    );
  }
}
