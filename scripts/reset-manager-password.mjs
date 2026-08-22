// Resets the real Manager account's Supabase Auth password to whatever SEED_MANAGER_PASSWORD
// currently holds in .env.local — for when the two have drifted apart (e.g. nobody wrote a manual
// password change back to .env.local, so npm run seed's login stopped matching reality).
// Does NOT touch username/email/name — scripts/seed.mjs owns those. Looks the account up by
// SEED_MANAGER_USERNAME (manager.id === auth.users.id, docs/DATABASE_ERD.md), never creates one.
//
//   npm run reset-manager-password

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
  const newPassword = requireEnv("SEED_MANAGER_PASSWORD");

  const { data: manager, error: managerError } = await supabase
    .from("manager")
    .select("id, email")
    .eq("username", username)
    .maybeSingle();
  if (managerError) throw managerError;
  if (!manager) {
    console.error(`Không tìm thấy Manager với username "${username}" trong bảng manager.`);
    process.exit(1);
  }

  const { error } = await supabase.auth.admin.updateUserById(manager.id, { password: newPassword });
  if (error) throw error;

  console.log(`Đã đổi mật khẩu cho Manager "${username}" (${manager.email}) theo SEED_MANAGER_PASSWORD trong .env.local.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
