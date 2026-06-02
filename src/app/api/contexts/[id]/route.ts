import { NextResponse } from "next/server";
import { z } from "zod";
import { updateContext } from "@/lib/repository";

const updateSchema = z.object({
  namespace: z.string().trim().min(1).optional(),
  owner: z.string().trim().min(1).optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const context = await updateContext(id, body);
    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "更新失败" },
      { status: 400 }
    );
  }
}
