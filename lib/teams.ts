import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { ValidationError } from "@/lib/validation";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type TeamSummary = {
  id: string;
  name: string;
  creatorCount: number;
};

export async function listTeams(supabase: SupabaseServerClient): Promise<TeamSummary[]> {
  const { data: teams, error } = await supabase.from("team").select("id, name").order("name", { ascending: true });
  if (error) throw error;
  if (!teams || teams.length === 0) return [];

  const { data: creators, error: creatorsError } = await supabase
    .from("creator")
    .select("team_id")
    .not("team_id", "is", null);
  if (creatorsError) throw creatorsError;

  const countByTeam = new Map<string, number>();
  for (const c of creators ?? []) {
    const id = c.team_id as string;
    countByTeam.set(id, (countByTeam.get(id) ?? 0) + 1);
  }

  return teams.map((t) => ({ id: t.id, name: t.name, creatorCount: countByTeam.get(t.id) ?? 0 }));
}

/** Just the team's own row, without `listTeams()`'s second (creatorCount) query — a lean single-team
 *  fetch for a caller that only needs the name (e.g. a future `GET /api/teams/:id`, which doesn't
 *  exist yet even though `PATCH`/`DELETE` do; no current UI route calls this — `/creators/[id]`'s team
 *  pill reads `creator.team` straight off `listCreators()` instead of a second fetch). */
export async function getTeam(supabase: SupabaseServerClient, id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from("team").select("id, name").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTeam(supabase: SupabaseServerClient, name: string): Promise<TeamSummary> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Tên team không được để trống.");

  const { data, error } = await supabase.from("team").insert({ name: trimmed }).select("id, name").single();
  if (error) throw error;
  return { id: data.id, name: data.name, creatorCount: 0 };
}

export async function renameTeam(supabase: SupabaseServerClient, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Tên team không được để trống.");

  const { error } = await supabase.from("team").update({ name: trimmed }).eq("id", id);
  if (error) throw error;
}

/** `creator.team_id` is `on delete set null` — deleting a team never deletes its Creators, they
 *  just become unassigned (same shape as unassigning a channel's Creator). */
export async function deleteTeam(supabase: SupabaseServerClient, id: string): Promise<void> {
  const { error } = await supabase.from("team").delete().eq("id", id);
  if (error) throw error;
}
