import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listCreators } from "@/lib/creators";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CreateCreatorForm, CreatorCard } from "./creator-form";

// Manager-only screen (docs/USER_FLOW.md: "Tạo tài khoản Creator — Có / Ẩn"). RLS lets a Creator
// read the creator table too (cross-channel visibility is deliberate elsewhere), but this specific
// management screen — with the "tạo tài khoản" action — is not meant for them.
export default async function CreatorsPage() {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");

  const supabase = await createSupabaseServerClient();
  const creators = await listCreators(supabase);
  const totalChannels = creators.reduce((sum, creator) => sum + creator.channelCount, 0);

  return (
    <div className="px-8 py-10">
      <div className="mb-[18px] flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.6px]">Creator</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {creators.length} Creator đang phụ trách {totalChannels} kênh
          </p>
        </div>
      </div>

      <CreateCreatorForm />

      {creators.length === 0 ? (
        <div className="rounded-card border border-line px-5 py-10 text-center text-sm text-ink-3">
          Chưa có Creator nào.
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {creators.map((creator) => (
            // This page redirects non-Managers above, so isManager is always true here — kept as an
            // explicit prop (not hardcoded in CreatorCard) so the component stays reusable if a
            // read-only view is ever needed elsewhere.
            <CreatorCard key={creator.id} creator={creator} isManager />
          ))}
        </div>
      )}
    </div>
  );
}
