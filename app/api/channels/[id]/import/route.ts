import { NextResponse, type NextRequest } from "next/server";

import { requireManager } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { runStudioImport } from "@/lib/import/run-import";
import { nowVnDateString } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

// POST /api/channels/:id/import — M. docs/API_SPEC.md
// ?dryRun=true parses everything and returns the same response shape, but writes nothing — the
// preview step in design/Import.dc.html before the Manager confirms with "Lưu dữ liệu".
export async function POST(request: NextRequest, context: RouteContext<"/api/channels/[id]/import">) {
  try {
    await requireManager();
    const { id: channelId } = await context.params;
    const supabase = await createSupabaseServerClient();

    const { data: channel, error } = await supabase.from("channel").select("id").eq("id", channelId).maybeSingle();
    if (error) throw error;
    if (!channel) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });

    const formData = await request.formData();
    const files = formData
      .getAll("files[]")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      throw new ValidationError("Chưa có file nào được tải lên.");
    }

    const buffers = await Promise.all(
      files.map(async (file) => ({ filename: file.name, buffer: Buffer.from(await file.arrayBuffer()) })),
    );

    const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
    const exportDate = nowVnDateString();

    const result = await runStudioImport({ supabase, channelId, exportDate, files: buffers, dryRun });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
