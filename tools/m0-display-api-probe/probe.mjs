#!/usr/bin/env node
/**
 * M0 — TikTok Display API sandbox verification harness.
 *
 * Standalone, zero-dependency (Node >= 18). Deliberately NOT part of the Next.js app:
 * M0 must answer whether the data architecture holds up BEFORE any app code exists.
 *
 * Answers the 5 open questions in docs/DISPLAY_API.md §"Việc cần kiểm chứng (M0)",
 * plus refresh-token rotation (docs/CLAUDE.md hard rule).
 *
 * Usage:
 *   node probe.mjs auth               # OAuth one channel, store tokens
 *   node probe.mjs probe [--label X]  # run all checks, write snapshot + report
 *   node probe.mjs refresh            # verify refresh_token rotation
 *   node probe.mjs diff A.json B.json # per-video delta (the M3b algorithm)
 *   node probe.mjs status             # token expiry / stored state
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_DIR = join(HERE, 'out');
const TOKENS_FILE = join(OUT_DIR, 'tokens.json');

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API = 'https://open.tiktokapis.com/v2';

const SCOPES = ['user.info.basic', 'user.info.stats', 'video.list'];

const USER_FIELDS_BASIC = ['open_id', 'union_id', 'display_name', 'avatar_url'];
const USER_FIELDS_STATS = ['follower_count', 'following_count', 'likes_count', 'video_count'];

// Metric fields we need but which docs never confirm for /video/list/ (only for /video/query/).
const METRIC_FIELDS = ['view_count', 'like_count', 'comment_count', 'share_count'];
const VIDEO_BASE_FIELDS = ['id', 'create_time', 'title', 'video_description', 'share_url'];

const MAX_PAGES = 60; // safety net: 60 pages x 20 = 1200 videos
const PAGE_SIZE = 20; // hard API maximum

// ── tiny utils ───────────────────────────────────────────────────────────────

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
};

const log = (...a) => console.log(...a);
const die = (msg) => {
  console.error(c.err(`\n✗ ${msg}\n`));
  process.exit(1);
};

function loadEnv() {
  // Minimal .env reader — no dotenv dependency. Real env vars win.
  for (const file of ['.env.local', '.env']) {
    const p = join(REPO_ROOT, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      if (process.env[k]) continue;
      process.env[k] = raw.replace(/^["']|["']$/g, '');
    }
  }
  const cfg = {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirectUri: process.env.TIKTOK_REDIRECT_URI,
  };
  const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    die(
      `Thiếu biến môi trường: ${missing.join(', ')}\n` +
        `  Tạo ${join(REPO_ROOT, '.env.local')} theo .env.example rồi điền giá trị từ developers.tiktok.com.`
    );
  }
  if (!cfg.redirectUri.startsWith('https://')) {
    log(c.warn(`⚠ TIKTOK_REDIRECT_URI = ${cfg.redirectUri}`));
    log(c.warn('  TikTok CHỈ chấp nhận redirect URI https:// — http://localhost sẽ bị từ chối.'));
    log(c.warn('  Xem README.md mục "Redirect URI".\n'));
  }
  return cfg;
}

const ensureOut = () => mkdirSync(OUT_DIR, { recursive: true });

function saveJson(file, data) {
  ensureOut();
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return file;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

const nowIso = () => new Date().toISOString();

/** Calendar date in Asia/Ho_Chi_Minh — the project's canonical `date` column. */
function vnDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// ── API layer ────────────────────────────────────────────────────────────────

/**
 * Display API returns HTTP 200 with `error.code = "ok"` on success — a non-"ok"
 * code inside a 200 body is still a failure. Never trust the status alone.
 */
async function callApi(path, { token, method = 'GET', fields, body } = {}) {
  const url = new URL(`${API}${path}`);
  if (fields) url.searchParams.set('fields', fields.join(','));

  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _unparsed: text.slice(0, 500) };
  }

  const err = json?.error ?? {};
  const errorCode = err.code && err.code !== 'ok' ? err.code : null;
  const result = {
    ok: res.ok && !errorCode,
    httpStatus: res.status,
    rateLimited: res.status === 429 || errorCode === 'rate_limit_exceeded',
    errorCode,
    errorMessage: err.message || null,
    logId: err.log_id || null,
    data: json?.data ?? null,
    ms: Date.now() - started,
    request: { url: url.toString(), method, body: body ?? null },
  };
  return result;
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    die(
      `Token request thất bại (HTTP ${res.status}): ${json.error ?? '?'} — ` +
        `${json.error_description ?? JSON.stringify(json).slice(0, 300)}`
    );
  }
  return json;
}

// tokens.json = { [channel]: { open_id, access_token, refresh_token, ... } }
// Lưu theo từng kênh (không phải 1 slot chung) — mô phỏng đúng cách app thật (M3b) sẽ lưu
// token trong DB theo channel_id, để không phải OAuth lại mỗi khi đổi kênh test.
function loadAllTokens() {
  if (!existsSync(TOKENS_FILE)) return {};
  const data = readJson(TOKENS_FILE);
  // Tương thích ngược: file cũ (trước khi hỗ trợ đa kênh) là 1 object phẳng có open_id ở gốc.
  if (data.open_id && !data[Object.keys(data)[0]]?.open_id) {
    return { default: data };
  }
  return data;
}

function loadTokens(channel) {
  const all = loadAllTokens();
  if (!all[channel]) {
    const known = Object.keys(all);
    die(
      `Chưa có token cho kênh "${channel}". ` +
        (known.length ? `Đang có: ${known.join(', ')} — dùng --as <tên>.` : `Chạy trước: node probe.mjs auth --as ${channel}`)
    );
  }
  return all[channel];
}

function storeTokens(raw, previous, channel) {
  const now = Date.now();
  const tokens = {
    channel,
    open_id: raw.open_id,
    scope_granted: raw.scope,
    access_token: raw.access_token,
    access_expires_at: new Date(now + raw.expires_in * 1000).toISOString(),
    refresh_token: raw.refresh_token,
    refresh_expires_at: new Date(now + raw.refresh_expires_in * 1000).toISOString(),
    // Rotation evidence — CLAUDE.md hard rule: always persist the NEW refresh_token.
    refresh_rotated: previous ? previous.refresh_token !== raw.refresh_token : null,
    previous_refresh_token_tail: previous ? previous.refresh_token.slice(-8) : null,
    obtained_at: nowIso(),
  };
  const all = loadAllTokens();
  all[channel] = tokens;
  saveJson(TOKENS_FILE, all);
  return tokens;
}

// ── command: auth ────────────────────────────────────────────────────────────

async function cmdAuth(cfg) {
  const usePkce = process.argv.includes('--pkce'); // required for desktop apps only
  const callbackArg = argValue('--callback'); // dùng khi authorize URL đã được mở ở lần chạy khác
  const channel = argValue('--as') ?? 'default'; // tên kênh để lưu token — vd. --as vuonvuonvang

  let code;
  let cb;

  if (callbackArg) {
    // Bỏ qua bước in URL + hỏi lại — state của lần chạy trước đã mất theo tiến trình cũ,
    // không kiểm được nữa. Chỉ dùng khi chính bạn vừa tự tay điều hướng + Authorize.
    try {
      cb = new URL(callbackArg);
    } catch {
      die('`--callback` không phải URL hợp lệ.');
    }
    log(c.dim('  (Dùng --callback — bỏ qua kiểm tra `state`, chỉ dùng cho URL bạn vừa tự Authorize.)'));
  } else {
    const state = randomBytes(16).toString('hex');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const url = new URL(AUTH_URL);
    url.searchParams.set('client_key', cfg.clientKey);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES.join(','));
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('state', state);
    if (usePkce) {
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    log(c.bold('\n1. Mở URL này trong trình duyệt đang đăng nhập kênh TikTok cần kiểm chứng:\n'));
    log(url.toString());
    log(
      c.dim(
        '\n2. Bấm Authorize. Trình duyệt sẽ nhảy sang redirect URI — trang đó có thể báo lỗi\n' +
          '   "không kết nối được", KHÔNG SAO. Thứ cần là URL trên thanh địa chỉ.\n'
      )
    );

    const pasted = await ask('3. Dán nguyên URL trên thanh địa chỉ vào đây: ');
    if (!pasted) die('Không nhận được URL.');

    try {
      cb = new URL(pasted);
    } catch {
      die('Chuỗi vừa dán không phải URL hợp lệ.');
    }
    if (cb.searchParams.get('state') !== state) {
      die('`state` không khớp — có thể dán nhầm URL của lần chạy trước. Chạy lại `auth`.');
    }
  }

  const q = cb.searchParams;
  if (q.get('error')) {
    die(`TikTok từ chối: ${q.get('error')} — ${q.get('error_description') ?? ''}`);
  }
  code = q.get('code'); // URLSearchParams already URL-decodes (the trailing `*1` matters)
  if (!code) die('URL không chứa tham số `code`.');

  const raw = await tokenRequest({
    client_key: cfg.clientKey,
    client_secret: cfg.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: cfg.redirectUri,
    ...(usePkce ? { code_verifier: verifier } : {}),
  });

  const tokens = storeTokens(raw, null, channel);
  const grantedScopes = (tokens.scope_granted ?? '').split(',').filter(Boolean);
  const missing = SCOPES.filter((s) => !grantedScopes.includes(s));

  log(c.ok('\n✓ Lấy token thành công.'));
  log(`  lưu dưới tên       : ${channel}${channel === 'default' ? ' (dùng --as <tên> để đặt tên khác, giữ được nhiều kênh cùng lúc)' : ''}`);
  log(`  open_id            : ${tokens.open_id}`);
  log(`  scope XIN          : ${SCOPES.join(', ')}`);
  log(`  scope ĐƯỢC CẤP     : ${grantedScopes.join(', ') || '(rỗng)'}`);
  log(`  access hết hạn     : ${tokens.access_expires_at}`);
  log(`  refresh hết hạn    : ${tokens.refresh_expires_at}`);
  log(c.dim(`  → ${TOKENS_FILE}`));

  if (missing.length) {
    log(c.err(`\n✗ THIẾU SCOPE: ${missing.join(', ')}`));
    log(c.err('  Đây là câu trả lời cho checklist M0 #1 — sandbox/app không cấp đủ scope.'));
    log('  Kiểm tra lại phần Products/Scopes của app trong developer portal trước khi kết luận.');
  } else {
    log(c.ok('\n✓ Đủ cả 3 scope. Chạy tiếp: node probe.mjs probe'));
  }
}

// ── command: probe ───────────────────────────────────────────────────────────

async function probeUserInfo(token, findings) {
  log(c.bold('\n[A] GET /v2/user/info/ — scope user.info.stats'));

  const basic = await callApi('/user/info/', { token, fields: USER_FIELDS_BASIC });
  const stats = await callApi('/user/info/', {
    token,
    fields: [...USER_FIELDS_BASIC, ...USER_FIELDS_STATS],
  });

  findings.userInfo = {
    basicOk: basic.ok,
    statsOk: stats.ok,
    error: stats.errorCode,
    errorMessage: stats.errorMessage,
    user: stats.data?.user ?? null,
  };

  if (!basic.ok) {
    log(c.err(`  ✗ user/info cơ bản cũng lỗi: ${basic.errorCode} — ${basic.errorMessage}`));
    log(c.dim('    Lỗi ngay ở call cơ bản thường là token/cấu hình app, chưa phải giới hạn sandbox.'));
    return null;
  }
  if (!stats.ok) {
    log(c.err(`  ✗ Trường stats bị từ chối: ${stats.errorCode} — ${stats.errorMessage}`));
    log(c.err('  → user/info cơ bản chạy được nhưng stats thì không → nhiều khả năng scope'));
    log(c.err('    `user.info.stats` chưa được cấp. Kiểm tra app trước khi kết luận phải sang M7.'));
    return null;
  }

  const u = stats.data.user;
  const missingFields = USER_FIELDS_STATS.filter((f) => u[f] === undefined);
  log(c.ok(`  ✓ ${u.display_name ?? u.open_id}`));
  log(`    follower_count = ${u.follower_count}   video_count = ${u.video_count}`);
  log(`    likes_count    = ${u.likes_count}      following  = ${u.following_count}`);
  if (missingFields.length) {
    log(c.warn(`  ⚠ Trường không trả về dù không báo lỗi: ${missingFields.join(', ')}`));
    findings.userInfo.missingFields = missingFields;
  }
  return u;
}

/** Which metric fields does /video/list/ actually accept? Bisect one field at a time. */
async function probeListFields(token, findings) {
  log(c.bold('\n[B] POST /v2/video/list/ — có trả view_count qua `fields` không?'));

  const full = await callApi('/video/list/', {
    token,
    method: 'POST',
    fields: [...VIDEO_BASE_FIELDS, ...METRIC_FIELDS],
    body: { max_count: 2 },
  });

  const perField = {};
  let baseOk = full.ok;

  if (!full.ok) {
    log(c.warn(`  ⚠ Bộ field đầy đủ bị từ chối: ${full.errorCode} — ${full.errorMessage}`));
    const base = await callApi('/video/list/', {
      token,
      method: 'POST',
      fields: VIDEO_BASE_FIELDS,
      body: { max_count: 2 },
    });
    baseOk = base.ok;
    if (!base.ok) {
      log(c.err(`  ✗ Endpoint /video/list/ không dùng được: ${base.errorCode} — ${base.errorMessage}`));
      findings.videoList = { endpointOk: false, error: base.errorCode, message: base.errorMessage };
      return { endpointOk: false, metricsInList: false };
    }
    // Endpoint works — find exactly which metric field breaks it.
    for (const f of METRIC_FIELDS) {
      const r = await callApi('/video/list/', {
        token,
        method: 'POST',
        fields: [...VIDEO_BASE_FIELDS, f],
        body: { max_count: 2 },
      });
      perField[f] = r.ok ? 'accepted' : `rejected: ${r.errorCode}`;
      log(`    ${f.padEnd(14)} → ${r.ok ? c.ok('nhận') : c.err(perField[f])}`);
    }
  } else {
    const sample = full.data?.videos?.[0] ?? {};
    for (const f of METRIC_FIELDS) {
      perField[f] = sample[f] === undefined ? 'accepted but null/absent' : 'returned';
    }
    log(c.ok('  ✓ Bộ field đầy đủ được chấp nhận.'));
    for (const f of METRIC_FIELDS) {
      log(`    ${f.padEnd(14)} → ${sample[f] === undefined ? c.warn('không có trong response') : c.ok(String(sample[f]))}`);
    }
  }

  const metricsInList =
    full.ok && METRIC_FIELDS.every((f) => (full.data?.videos?.[0] ?? {})[f] !== undefined);

  findings.videoList = { endpointOk: baseOk, fullFieldSetOk: full.ok, perField, metricsInList };
  if (!metricsInList) {
    log(c.warn('  → Phải dùng phương án 2 bước: video/list lấy id, video/query lấy chỉ số.'));
  }
  return { endpointOk: baseOk, metricsInList };
}

async function paginateAll(token, fields, findings) {
  log(c.bold('\n[C] Phân trang /video/list/ tới khi has_more = false'));

  const videos = [];
  const pages = [];
  const seen = new Set();
  let cursor;
  let duplicates = 0;
  let hitCap = false;
  let rateLimited = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = { max_count: PAGE_SIZE, ...(cursor !== undefined ? { cursor } : {}) };
    const r = await callApi('/video/list/', { token, method: 'POST', fields, body });

    if (r.rateLimited) {
      rateLimited = true;
      log(c.warn(`  ⚠ 429 rate_limit_exceeded ở trang ${page} — dừng, đánh dấu snapshot không đầy đủ.`));
      break;
    }
    if (!r.ok) {
      log(c.err(`  ✗ Trang ${page} lỗi: ${r.errorCode} — ${r.errorMessage}`));
      pages.push({ page, error: r.errorCode, message: r.errorMessage });
      break;
    }

    const batch = r.data?.videos ?? [];
    for (const v of batch) {
      if (seen.has(v.id)) duplicates++;
      else {
        seen.add(v.id);
        videos.push(v);
      }
    }
    pages.push({
      page,
      count: batch.length,
      cursor: r.data?.cursor ?? null,
      has_more: r.data?.has_more ?? false,
      ms: r.ms,
    });
    log(
      `  trang ${String(page).padStart(2)}: ${String(batch.length).padStart(2)} video  ` +
        `has_more=${r.data?.has_more}  cursor=${r.data?.cursor ?? '-'}  ${r.ms}ms`
    );

    if (!r.data?.has_more) break;
    if (r.data.cursor === cursor) {
      log(c.warn('  ⚠ Cursor không đổi giữa 2 trang — dừng để tránh vòng lặp vô tận.'));
      break;
    }
    cursor = r.data.cursor;
    if (page === MAX_PAGES) hitCap = true;
  }

  findings.pagination = {
    pages: pages.length,
    videos: videos.length,
    duplicates,
    hitSafetyCap: hitCap,
    rateLimited,
    detail: pages,
  };
  log(`  → ${videos.length} video trong ${pages.length} trang` + (duplicates ? c.warn(` (${duplicates} trùng id)`) : ''));
  return videos;
}

async function probeVideoQuery(token, ids, findings) {
  log(c.bold('\n[E] POST /v2/video/query/ — lô 20 id, đối chiếu với video/list'));
  const byId = new Map();
  let batches = 0;
  let failed = 0;

  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const r = await callApi('/video/query/', {
      token,
      method: 'POST',
      fields: [...VIDEO_BASE_FIELDS, ...METRIC_FIELDS],
      body: { filters: { video_ids: chunk } },
    });
    batches++;
    if (!r.ok) {
      failed++;
      log(c.err(`  ✗ Lô ${batches} lỗi: ${r.errorCode} — ${r.errorMessage}`));
      continue;
    }
    for (const v of r.data?.videos ?? []) byId.set(v.id, v);
  }

  findings.videoQuery = {
    ok: failed === 0 && byId.size > 0,
    batches,
    failedBatches: failed,
    returned: byId.size,
    requested: ids.length,
  };
  log(
    failed === 0
      ? c.ok(`  ✓ ${byId.size}/${ids.length} video có chỉ số qua video/query (${batches} lô)`)
      : c.err(`  ✗ ${failed}/${batches} lô lỗi`)
  );
  return byId;
}

async function cmdProbe(cfg) {
  const channel = argValue('--as') ?? 'default';
  const tokens = loadTokens(channel);
  if (new Date(tokens.access_expires_at) < new Date()) {
    log(c.warn('access_token đã hết hạn — tự refresh trước khi probe.'));
    await cmdRefresh(cfg, { quiet: true, channel });
  }
  const token = loadTokens(channel).access_token;

  const findings = {
    ranAt: nowIso(),
    vnDate: vnDate(),
    label: argValue('--label') ?? (channel !== 'default' ? channel : null),
    openId: tokens.open_id,
    scopeGranted: tokens.scope_granted,
  };

  const user = await probeUserInfo(token, findings);
  const { endpointOk, metricsInList } = await probeListFields(token, findings);

  let videos = [];
  let queryById = new Map();

  if (endpointOk) {
    const fields = metricsInList ? [...VIDEO_BASE_FIELDS, ...METRIC_FIELDS] : VIDEO_BASE_FIELDS;
    videos = await paginateAll(token, fields, findings);

    // [D] video_count vs số video thật sự lấy được
    log(c.bold('\n[D] video_count (user/info) so với số video /video/list/ trả về'));
    if (user) {
      const delta = user.video_count - videos.length;
      findings.countCheck = {
        videoCount: user.video_count,
        listed: videos.length,
        delta,
        matches: delta === 0,
      };
      log(`  video_count = ${user.video_count} · lấy được = ${videos.length} · lệch = ${delta}`);
      log(
        delta === 0
          ? c.ok('  ✓ Khớp — dùng thẳng làm phép kiểm isComplete được.')
          : c.warn(
              '  ⚠ Lệch. Nếu lệch CỐ ĐỊNH qua nhiều ngày → là video riêng tư, đổi phép kiểm\n' +
                '    isComplete sang so với lần lấy trước (TASKS M3b).'
            )
      );
    }

    if (videos.length) {
      queryById = await probeVideoQuery(token, videos.map((v) => v.id), findings);

      if (metricsInList) {
        const mismatches = [];
        for (const v of videos) {
          const q = queryById.get(v.id);
          if (q && q.view_count !== v.view_count) {
            mismatches.push({ id: v.id, list: v.view_count, query: q.view_count });
          }
        }
        findings.listVsQuery = { compared: queryById.size, mismatches };
        log(
          mismatches.length
            ? c.warn(`  ⚠ ${mismatches.length} video lệch view_count giữa list và query`)
            : c.ok('  ✓ view_count của list và query khớp nhau')
        );
      }
    }
  }

  // Snapshot dùng cho `diff` — nguồn chỉ số ưu tiên video/query vì chắc chắn có.
  const snapshot = {
    takenAt: nowIso(),
    date: vnDate(),
    openId: tokens.open_id,
    videoCount: user?.video_count ?? null,
    followerCount: user?.follower_count ?? null,
    isComplete: Boolean(user) && videos.length > 0 && user.video_count === videos.length,
    videos: videos.map((v) => {
      const q = queryById.get(v.id) ?? {};
      return {
        id: v.id,
        create_time: v.create_time ?? q.create_time ?? null,
        title: v.title ?? q.title ?? v.video_description ?? null,
        view_count: v.view_count ?? q.view_count ?? null,
        like_count: v.like_count ?? q.like_count ?? null,
        comment_count: v.comment_count ?? q.comment_count ?? null,
        share_count: v.share_count ?? q.share_count ?? null,
      };
    }),
  };

  const stamp = `${snapshot.date}${findings.label ? `-${findings.label}` : ''}`;
  const snapFile = saveJson(join(OUT_DIR, `snapshot-${stamp}.json`), snapshot);
  const rawFile = saveJson(join(OUT_DIR, `findings-${stamp}.json`), findings);
  const reportFile = writeReport(findings, snapshot, stamp);

  log(c.bold('\n── Kết quả ─────────────────────────────────────────────'));
  log(`  snapshot : ${snapFile}`);
  log(`  raw      : ${rawFile}`);
  log(`  báo cáo  : ${reportFile}`);
  log(c.dim('\n  Chạy lại `probe` sau ~24h rồi `diff` 2 snapshot để có view/ngày.'));
}

// ── report ───────────────────────────────────────────────────────────────────

const verdict = (state) => ({ pass: '✅', fail: '❌', warn: '⚠️', unknown: '❓' })[state] ?? '❓';

function writeReport(f, snap, stamp) {
  const L = [];
  const scopes = (f.scopeGranted ?? '').split(',').filter(Boolean);

  const q1 =
    f.userInfo?.statsOk && f.videoList?.endpointOk ? 'pass' : f.userInfo?.statsOk || f.videoList?.endpointOk ? 'warn' : 'fail';
  const q2 = !f.videoList?.endpointOk ? 'unknown' : f.videoList.metricsInList ? 'pass' : 'warn';
  const q3 = !f.countCheck ? 'unknown' : f.countCheck.matches ? 'pass' : 'warn';
  const q4 = !f.pagination ? 'unknown' : f.pagination.rateLimited || f.pagination.hitSafetyCap ? 'warn' : 'pass';

  L.push(`# M0 — Kết quả kiểm chứng Display API`);
  L.push('');
  L.push(`Chạy lúc: ${f.ranAt} (ngày VN ${f.vnDate})`);
  L.push(`open_id: \`${f.openId}\``);
  L.push(`Scope được cấp: \`${scopes.join(', ') || '(rỗng)'}\``);
  L.push('');
  L.push('## Checklist docs/DISPLAY_API.md §M0');
  L.push('');
  L.push('| # | Câu hỏi | Kết quả |');
  L.push('| :-- | :--- | :--- |');
  L.push(
    `| 1 | Sandbox gọi được \`user.info.stats\` + \`video.list\`? | ${verdict(q1)} user/info stats: ${
      f.userInfo?.statsOk ? 'OK' : `LỖI (${f.userInfo?.error ?? 'n/a'})`
    } · video/list: ${f.videoList?.endpointOk ? 'OK' : `LỖI (${f.videoList?.error ?? 'n/a'})`} |`
  );
  const q2Text =
    q2 === 'unknown'
      ? 'chưa đo được — endpoint lỗi trước đó'
      : f.videoList.metricsInList
        ? 'CÓ — không cần video/query'
        : 'KHÔNG — bắt buộc 2 bước qua video/query';
  L.push(`| 2 | \`video/list\` trả \`view_count\` qua \`fields\`? | ${verdict(q2)} ${q2Text} |`);
  L.push(
    `| 3 | \`video_count\` khớp số video trả về? | ${verdict(q3)} ${
      f.countCheck ? `${f.countCheck.videoCount} vs ${f.countCheck.listed} (lệch ${f.countCheck.delta})` : 'chưa đo được'
    } |`
  );
  L.push(
    `| 4 | Phân trang tới đâu? | ${verdict(q4)} ${
      f.pagination ? `${f.pagination.pages} trang, ${f.pagination.videos} video${f.pagination.rateLimited ? ', BỊ 429' : ''}` : 'chưa đo được'
    } |`
  );
  L.push(`| 5 | \`view_count\` lệch bao nhiêu % so với Studio? | ❓ cần ≥2 snapshot cách nhau 24h + 1 file Overview.csv — xem mục dưới |`);
  L.push('');

  const detailStart = L.length;
  if (f.userInfo?.user) {
    const u = f.userInfo.user;
    L.push('### Kênh');
    L.push(`- \`follower_count\` = **${u.follower_count}**`);
    L.push(`- \`video_count\` = **${u.video_count}**`);
    L.push(`- \`likes_count\` = ${u.likes_count}`);
    L.push('');
  }
  if (Object.keys(f.videoList?.perField ?? {}).length) {
    L.push('### `video/list` — từng trường chỉ số');
    L.push('');
    L.push('| Trường | Trạng thái |');
    L.push('| :--- | :--- |');
    for (const [k, v] of Object.entries(f.videoList.perField ?? {})) L.push(`| \`${k}\` | ${v} |`);
    L.push('');
  }
  if (f.pagination) {
    L.push('### Phân trang');
    L.push('');
    L.push('| Trang | Số video | has_more | ms |');
    L.push('| ---: | ---: | :--- | ---: |');
    for (const p of f.pagination.detail) {
      L.push(`| ${p.page} | ${p.count ?? '—'} | ${p.has_more ?? p.error ?? '—'} | ${p.ms ?? '—'} |`);
    }
    L.push('');
    if (f.pagination.duplicates) L.push(`⚠️ ${f.pagination.duplicates} id trùng giữa các trang.`);
    if (f.pagination.hitSafetyCap) L.push(`⚠️ Chạm trần an toàn ${MAX_PAGES} trang — có thể còn video chưa lấy.`);
    L.push('');
  }
  if (f.videoQuery) {
    L.push('### `video/query`');
    L.push(`- ${f.videoQuery.returned}/${f.videoQuery.requested} video trả về qua ${f.videoQuery.batches} lô 20 id`);
    if (f.videoQuery.failedBatches) L.push(`- ⚠️ ${f.videoQuery.failedBatches} lô lỗi`);
    L.push('');
  }
  if (f.listVsQuery) {
    L.push('### list vs query');
    L.push(`- So sánh ${f.listVsQuery.compared} video, lệch: **${f.listVsQuery.mismatches.length}**`);
    for (const m of f.listVsQuery.mismatches.slice(0, 10)) {
      L.push(`  - \`${m.id}\`: list=${m.list} query=${m.query}`);
    }
    L.push('');
  }

  if (L.length > detailStart) L.splice(detailStart, 0, '## Chi tiết', '');

  L.push('## Hệ quả kiến trúc');
  L.push('');
  const decisions = [];
  // Token hỏng thì mọi endpoint đều lỗi — đó KHÔNG phải kết luận về sandbox.
  const authCodes = ['access_token_invalid', 'access_token_expired', 'scope_not_authorized', 'scope_permission_missed'];
  const seenErrors = [...new Set([f.userInfo?.error, f.videoList?.error].filter(Boolean))];
  const authProblem = seenErrors.some((e) => authCodes.includes(e));

  if (authProblem) {
    decisions.push(
      '⛔ **Chưa kết luận được gì về sandbox** — lỗi thuộc nhóm token/scope ' +
        `(\`${seenErrors.join('`, `')}\`). ` +
        'Chạy lại `node probe.mjs auth`, kiểm tra scope đã bật trong app, rồi probe lại.'
    );
  } else if (q1 === 'fail') {
    decisions.push('❌ **Sandbox không đủ.** Chuyển sang M7: nộp duyệt app chính thức (1-2 tuần); trong lúc chờ, M3a (import Studio) vẫn chạy độc lập được.');
  } else if (q1 === 'warn') {
    decisions.push('⚠️ Một trong hai endpoint bị chặn — đọc mã lỗi ở bảng trên trước khi kết luận là giới hạn sandbox hay cấu hình scope của app.');
  } else {
    decisions.push('✅ Giả định lớn nhất của kiến trúc đứng vững — tầng `display_api` khả thi, làm tiếp M1.');
  }
  if (q2 === 'warn') {
    decisions.push('⚠️ `video/list` không kèm chỉ số → `DisplayApiProvider` phải làm 2 bước (list lấy id + query lấy chỉ số), ~2× số lệnh gọi. Vẫn dưới 0,1% giới hạn 600/phút.');
  } else if (q2 === 'pass') {
    decisions.push('✅ Lấy chỉ số ngay từ `video/list` → bỏ được bước `video/query`, giảm nửa số lệnh gọi.');
  }
  if (q3 === 'warn' && f.countCheck) {
    decisions.push(
      `⚠️ \`video_count\` lệch ${f.countCheck.delta} so với số video lấy được. Chạy probe vài ngày: lệch **cố định** = video riêng tư (đổi phép kiểm \`isComplete\` sang so với lần lấy trước); lệch **thay đổi** = response bị cắt ngắn, giữ nguyên phép kiểm hiện tại.`
    );
  }
  if (f.pagination?.rateLimited) {
    decisions.push('⚠️ Đã dính 429 dù khối lượng nhỏ → phải có retry/backoff ngay từ M3b, không để sau.');
  }
  for (const d of decisions) L.push(`- ${d}`);
  L.push('');

  L.push('## Câu hỏi 5 — đối chiếu với Studio (cần thêm bước)');
  L.push('');
  L.push('`view_count` của API là **luỹ kế trọn đời**, còn `Video Views` của Studio là **theo ngày**.');
  L.push('Không so trực tiếp được trong một lần chạy. Quy trình:');
  L.push('');
  L.push('```bash');
  L.push('node probe.mjs probe --label d1     # hôm nay');
  L.push('node probe.mjs probe --label d2     # ~24h sau, cùng giờ');
  L.push('node probe.mjs diff out/snapshot-<d1>.json out/snapshot-<d2>.json');
  L.push('```');
  L.push('');
  L.push('Rồi so số `viewsInPeriod` với dòng tương ứng trong `Overview.csv` của kỳ import kế tiếp');
  L.push('(nhớ độ trễ 2 ngày của Studio — xem docs/CSV_FORMAT.md).');
  L.push('');
  L.push(`> Snapshot của lần chạy này: \`out/snapshot-${stamp}.json\` — ${snap.videos.length} video, isComplete=${snap.isComplete}.`);
  L.push('');

  const file = join(OUT_DIR, `report-${stamp}.md`);
  ensureOut();
  writeFileSync(file, L.join('\n'));
  return file;
}

// ── command: refresh ─────────────────────────────────────────────────────────

async function cmdRefresh(cfg, { quiet = false, channel } = {}) {
  channel ??= argValue('--as') ?? 'default';
  const prev = loadTokens(channel);
  const raw = await tokenRequest({
    client_key: cfg.clientKey,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: prev.refresh_token,
  });
  const next = storeTokens(raw, prev, channel);

  if (quiet) return next;
  log(c.bold('\n[F] Refresh token có xoay vòng không?'));
  log(`  refresh_token cũ  …${prev.refresh_token.slice(-8)}`);
  log(`  refresh_token mới …${next.refresh_token.slice(-8)}`);
  log(
    next.refresh_rotated
      ? c.ok('  ✓ CÓ xoay vòng — bắt buộc ghi đè token mới mỗi lần refresh (đúng như CLAUDE.md).')
      : c.warn('  ⚠ Lần này không đổi. Vẫn phải code theo hướng ghi đè: TikTok không cam kết giữ nguyên.')
  );
  log(`  access mới hết hạn : ${next.access_expires_at}`);
  log(`  refresh hết hạn    : ${next.refresh_expires_at}`);
  return next;
}

// ── command: diff ────────────────────────────────────────────────────────────

/**
 * Reference implementation of the M3b rule (CLAUDE.md / DATA_SOURCES.md):
 * per-video delta, new video counts in full, disappeared video is skipped — never subtracted.
 * Lift this into the app when writing M3b.
 */
function diffSnapshots(a, b) {
  const prev = new Map(a.videos.map((v) => [v.id, v]));
  const curr = new Map(b.videos.map((v) => [v.id, v]));

  let viewsInPeriod = 0;
  const newVideos = [];
  const disappeared = [];
  const negative = [];

  for (const [id, v] of curr) {
    const p = prev.get(id);
    if (!p) {
      newVideos.push(id);
      viewsInPeriod += v.view_count ?? 0;
      continue;
    }
    const d = (v.view_count ?? 0) - (p.view_count ?? 0);
    if (d < 0) negative.push({ id, from: p.view_count, to: v.view_count });
    viewsInPeriod += Math.max(0, d);
  }
  for (const id of prev.keys()) if (!curr.has(id)) disappeared.push(id); // bỏ qua, KHÔNG trừ

  return {
    from: a.date,
    to: b.date,
    viewsInPeriod,
    followersDiff: (b.followerCount ?? 0) - (a.followerCount ?? 0),
    newVideos,
    disappeared,
    negative,
    // Không dùng để tính KPI nếu một trong hai snapshot không đầy đủ.
    isComplete: a.isComplete && b.isComplete && negative.length === 0,
  };
}

function cmdDiff() {
  const [fileA, fileB] = process.argv.slice(3).filter((x) => !x.startsWith('--'));
  if (!fileA || !fileB) die('Cú pháp: node probe.mjs diff <snapshotCũ.json> <snapshotMới.json>');
  const r = diffSnapshots(readJson(resolve(fileA)), readJson(resolve(fileB)));

  log(c.bold(`\nChênh lệch ${r.from} → ${r.to}`));
  log(`  view trong kỳ   : ${r.viewsInPeriod.toLocaleString('vi-VN')}`);
  log(`  follower tăng   : ${r.followersDiff}`);
  log(`  video mới       : ${r.newVideos.length}`);
  log(`  video biến mất  : ${r.disappeared.length} ${c.dim('(bỏ qua, không trừ)')}`);
  if (r.negative.length) log(c.warn(`  ⚠ ${r.negative.length} video có view GIẢM — dấu hiệu response bị cắt ngắn hoặc lỗi nguồn`));
  log(r.isComplete ? c.ok('  ✓ isComplete — dùng tính KPI được') : c.warn('  ⚠ KHÔNG đầy đủ — không dùng tính KPI'));
  log(c.dim('\n  So số "view trong kỳ" này với Video Views của Overview.csv cùng ngày để trả lời checklist #5.'));
}

// ── command: status ──────────────────────────────────────────────────────────

function cmdStatus() {
  const all = loadAllTokens();
  const names = Object.keys(all);
  if (!names.length) return log('Chưa có token. Chạy: node probe.mjs auth [--as <tên kênh>]');
  const days = (iso) => ((new Date(iso) - Date.now()) / 86400000).toFixed(1);

  log(c.bold(`\nToken đang lưu (${names.length} kênh)`));
  for (const name of names) {
    const t = all[name];
    log(c.bold(`\n  [${name}]`));
    log(`    open_id        : ${t.open_id}`);
    log(`    scope          : ${t.scope_granted}`);
    log(`    access còn     : ${days(t.access_expires_at)} ngày (${t.access_expires_at})`);
    log(`    refresh còn    : ${days(t.refresh_expires_at)} ngày (${t.refresh_expires_at})`);
    log(`    đã xoay vòng   : ${t.refresh_rotated ?? '(chưa refresh lần nào)'}`);
  }

  if (existsSync(OUT_DIR)) {
    const snaps = readdirSync(OUT_DIR).filter((x) => x.startsWith('snapshot-'));
    log(c.bold('\nSnapshot đã có'));
    for (const s of snaps) log(`  ${s}`);
    if (snaps.length < 2) log(c.dim('  → cần ≥2 snapshot cách nhau ~24h để chạy `diff`'));
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];
const needsCfg = ['auth', 'probe', 'refresh'].includes(cmd);
const cfg = needsCfg ? loadEnv() : null;

switch (cmd) {
  case 'auth':
    await cmdAuth(cfg);
    break;
  case 'probe':
    await cmdProbe(cfg);
    break;
  case 'refresh':
    await cmdRefresh(cfg);
    break;
  case 'diff':
    cmdDiff();
    break;
  case 'status':
    cmdStatus();
    break;
  default:
    log(`
M0 — kiểm chứng TikTok Display API sandbox

  node probe.mjs auth [--as <kênh>]        OAuth 1 kênh, lưu token dưới tên <kênh> (mặc định "default")
  node probe.mjs probe [--as <kênh>]       chạy toàn bộ kiểm chứng bằng token của <kênh>
  node probe.mjs refresh [--as <kênh>]     kiểm tra refresh_token của <kênh> có xoay vòng
  node probe.mjs diff <cũ.json> <mới.json>  view trong kỳ theo từng video
  node probe.mjs status                    xem hạn token của TẤT CẢ kênh đã lưu + snapshot đang có

Dùng --as để giữ token nhiều kênh cùng lúc, không bị ghi đè khi đổi kênh test — vd.
  node probe.mjs auth --as vuonvuonvang
  node probe.mjs probe --as vuonvuonvang

Đọc README.md cùng thư mục trước khi chạy lần đầu.
`);
}
