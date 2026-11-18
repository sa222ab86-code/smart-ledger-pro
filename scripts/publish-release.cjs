/**
 * بعد رفع ملفات الإصدار كمسودة (draft): يتحقق أن المسودة تحتوي ملف التثبيت و latest.yml ثم ينشرها.
 * هكذا لا يرى البرنامج المثبّت عند العملاء الإصدار الجديد إلا بعد اكتمال رفع كل ملفاته.
 * يعمل على كل مستودعات النشر في package.json (build.publish) — مثل فترة الانتقال لمستودع التحديثات.
 * الاستخدام: GH_TOKEN=... node scripts/publish-release.cjs
 */
'use strict';
const pkg = require('../package.json');
const token = process.env.GH_TOKEN;
const tag = `v${pkg.version}`;
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'smart-ledger-release' };

async function publishIn(owner, repo) {
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(`${api}/releases?per_page=50`, { headers });
  if (!res.ok) throw new Error(`تعذّر قراءة إصدارات ${owner}/${repo}: ${res.status}`);
  const all = (await res.json()).filter((r) => r.tag_name === tag);
  const names = (r) => r.assets.map((a) => a.name);
  const complete = (r) => names(r).includes('latest.yml') && names(r).some((n) => /\.exe$/i.test(n));
  const target = all.find((r) => r.draft && complete(r)) || all.find(complete);
  if (!target) {
    throw new Error(`لا يوجد إصدار ${tag} مكتمل الملفات في ${owner}/${repo} (يحتاج .exe و latest.yml). الموجود: ${JSON.stringify(all.map((r) => ({ id: r.id, draft: r.draft, assets: names(r) })))}`);
  }
  if (target.draft) {
    const p = await fetch(`${api}/releases/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ draft: false, make_latest: 'true' }) });
    if (!p.ok) throw new Error(`فشل نشر المسودة في ${owner}/${repo}: ${p.status} ${await p.text()}`);
  }
  // حذف النسخ المكررة الناقصة لنفس الرقم (مسودات أو إصدارات بلا latest.yml) حتى لا يقرأها البرنامج
  for (const r of all) {
    if (r.id === target.id || complete(r)) continue;
    const d = await fetch(`${api}/releases/${r.id}`, { method: 'DELETE', headers });
    console.log(`[publish] حذف نسخة ناقصة من ${tag} في ${repo} (id ${r.id}): ${d.status}`);
  }
  console.log(`[publish] ${owner}/${repo}: تم نشر ${tag} — ${names(target).join(', ')}`);
}

(async () => {
  if (!token) { console.error('[publish] GH_TOKEN غير موجود'); process.exit(1); }
  const repos = [].concat(pkg.build.publish).filter((p) => p && p.provider === 'github');
  let failed = 0;
  for (const { owner, repo } of repos) {
    try { await publishIn(owner, repo); } catch (e) { failed++; console.error('[publish]', e.message || e); }
  }
  if (failed) process.exit(1);
})().catch((e) => { console.error('[publish]', e); process.exit(1); });
