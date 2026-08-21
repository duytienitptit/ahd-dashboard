// Seed the database with the Manager account, the Creator accounts, and the channels.
//
//   npm run seed
//
// Idempotent: re-running updates existing rows instead of duplicating them. It does NOT seed
// data_snapshot — loading the 60 days of real data in data/ is the job of the M3a Studio parser,
// and testing that parser against rows this script invented would prove nothing.

import { readFileSync, existsSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const CHANNELS_CSV = "data/samples/channels_seed.csv";

// Used when the seed CSV has not been filled in yet: the two channels that already have real
// exported data. They start unassigned; a Manager assigns a Creator from the UI in M2.
const FALLBACK_CHANNELS = [
  { channel_name: "nong.nghiep.xanh.17", tiktok_handle: "@nong.nghiep.xanh.17" },
  { channel_name: "vuonvuonvang", tiktok_handle: "@vuonvuonvang" },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thiếu biến môi trường ${name} trong .env.local — xem .env.example.`);
    process.exit(1);
  }
  return value;
}

/** Minimal CSV reader: strips the BOM and understands quoted fields. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }

  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell !== ""));
  return body.map((cells) =>
    Object.fromEntries(header.map((key, i) => [key.replace(/^﻿/, "").trim(), cells[i] ?? ""])),
  );
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Creates the auth user if missing, and returns its id either way. */
async function ensureAuthUser(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // internal accounts: nobody is around to click a confirmation link
  });

  if (!error) return data.user.id;
  if (error.code !== "email_exists") throw error;

  // Already there from an earlier run — find the id. The user base is tiny (one team).
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw listError;

  const existing = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw new Error(`Auth đã có email ${email} nhưng không tìm thấy khi liệt kê.`);
  return existing.id;
}

async function main() {
  const managerEmail = requireEnv("SEED_MANAGER_EMAIL");
  const managerId = await ensureAuthUser(managerEmail, requireEnv("SEED_MANAGER_PASSWORD"));

  const { error: managerError } = await supabase
    .from("manager")
    .upsert(
      { id: managerId, name: process.env.SEED_MANAGER_NAME || "Manager", email: managerEmail },
      { onConflict: "id" },
    );
  if (managerError) throw managerError;
  console.log(`Manager: ${managerEmail}`);

  const rows = existsSync(CHANNELS_CSV)
    ? parseCsv(readFileSync(CHANNELS_CSV, "utf8"))
    : FALLBACK_CHANNELS;

  if (!existsSync(CHANNELS_CSV)) {
    console.log(
      `Không thấy ${CHANNELS_CSV} — seed 2 kênh đã có data thật, chưa gán Creator.\n` +
        `  Muốn seed đủ 8 kênh kèm Creator: copy data/samples/channels_seed.example.csv thành ` +
        `${CHANNELS_CSV}, điền vào rồi chạy lại.`,
    );
  }

  const creatorPassword = process.env.SEED_CREATOR_DEFAULT_PASSWORD;

  for (const row of rows) {
    let creatorId = null;

    if (row.creator_email) {
      if (!creatorPassword) {
        console.error(
          `Cần SEED_CREATOR_DEFAULT_PASSWORD để tạo tài khoản Creator (${row.creator_email}).`,
        );
        process.exit(1);
      }

      creatorId = await ensureAuthUser(row.creator_email, creatorPassword);
      const { error } = await supabase.from("creator").upsert(
        {
          id: creatorId,
          name: row.creator_name || row.creator_email,
          email: row.creator_email,
          manager_id: managerId,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
    }

    // channel_ownership_history is kept in sync by a DB trigger (20260820000007_ownership_trigger.sql)
    // firing off this upsert's write to current_creator_id — no manual bookkeeping needed here, and
    // none should be added: writing the history table directly fights the trigger.
    const { error: channelError } = await supabase
      .from("channel")
      .upsert(
        { name: row.channel_name, tiktok_handle: row.tiktok_handle, current_creator_id: creatorId },
        { onConflict: "tiktok_handle" },
      );
    if (channelError) throw channelError;

    console.log(`Kênh: ${row.tiktok_handle}${creatorId ? ` → ${row.creator_email}` : " (chưa gán)"}`);
  }

  if (rows.some((row) => row.current_followers)) {
    console.log(
      "Bỏ qua cột current_followers — số liệu theo ngày do parser import M3a ghi, không seed tay.",
    );
  }

  console.log("Seed xong.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
