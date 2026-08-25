// Updates the real Manager account's display `name` to whatever SEED_MANAGER_NAME currently holds
// in .env.local — for when the two have drifted apart, same reasoning as reset-manager-password.mjs
// but for `name` instead of the Auth password. Does NOT touch username/email/password/channels/
// creators — scripts/seed.mjs owns the full reseed, but re-running it here would fall back to
// FALLBACK_CHANNELS (no data/samples/channels_seed.csv present) and silently unassign the Creator
// on 2 real channels. This script only ever writes `manager.name`.
//
//   npm run update-manager-name

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thiếu biến môi trường ${name} trong .env.local — xem .env.example.`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  const username = requireEnv("SEED_MANAGER_USERNAME");
  const newName = requireEnv("SEED_MANAGER_NAME");

  const { data: manager, error: managerError } = await supabase
    .from("manager")
    .select("id, name")
    .eq("username", username)
    .maybeSingle();
  if (managerError) throw managerError;
  if (!manager) {
    console.error(`Không tìm thấy Manager với username "${username}" trong bảng manager.`);
    process.exit(1);
  }

  const { error } = await supabase.from("manager").update({ name: newName }).eq("id", manager.id);
  if (error) throw error;

  console.log(`Đã đổi tên Manager "${username}": "${manager.name}" → "${newName}".`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
