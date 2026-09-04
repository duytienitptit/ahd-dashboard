import { NextResponse, type NextRequest } from "next/server";

import { AuthorizationError, requireWritableUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { runStudioImport } from "@/lib/import/run-import";
import { nowVnDateString } from "@/lib/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

// POST /api/channels/:id/import — M/C (Creator: chỉ kênh mình đang phụ trách, 21/08/2026 theo vận
// hành thực tế đã ghi ở CLAUDE.md). docs/API_SPEC.md
// ?dryRun=true parses everything and returns the same response shape, but writes nothing — the
// preview step in design/Import.dc.html before confirming với "Lưu dữ liệu".
//
// The app-level check below is a convenience 403 (clearer than a raw Postgres RLS error) — the REAL
// enforcement is 20260821000004_creator_studio_import.sql's RLS policies, which independently reject
// a Creator writing to a channel they don't own even if this check were ever removed or wrong.
export async function POST(request: NextRequest, context: RouteContext<"/api/channels/[id]/import">) {
  try {
    const user = await requireWritableUser();
    const { id: channelId } = await context.params;
    const supabase = await createSupabaseServerClient();

    const { data: channel, error } = await supabase
      .from("channel")
      .select("id, current_creator_id")
      .eq("id", channelId)
      .maybeSingle();
    if (error) throw error;
    if (!channel) return NextResponse.json({ error: "Không tìm thấy kênh." }, { status: 404 });

    if (user.role === "creator" && channel.current_creator_id !== user.id) {
      throw new AuthorizationError(403, "Bạn chỉ import được kênh mình đang phụ trách.");
    }

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
