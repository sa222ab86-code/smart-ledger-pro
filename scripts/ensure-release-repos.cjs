/**
 * قبل البناء: يتحقق من مستودعات النشر في package.json (build.publish):
 *  - موجودة والتوكن يملك صلاحية الكتابة عليها (يفشل فوراً بدل الفشل بعد دقائق من البناء)
 *  - المستودع الفارغ (بلا أي ملف) لا يقبل إصدارات في GitHub → يُضاف له README تلقائياً
 * الاستخدام: GH_TOKEN=... node scripts/ensure-release-repos.cjs
 */
'use strict';
const pkg = require('../package.json');
const token = process.env.GH_TOKEN;
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'smart-ledger-release' };

const README = `# Smart Ledger Pro — الدفتر الذكي Pro

نقاط البيع والفواتير والمحاسبة الكاملة وربط الفروع عن بعد.
ملفات التثبيت والتحديث التلقائي في صفحة Releases.

POS, invoicing, full double-entry accounting and remote branches. Installers and auto-update files are in Releases.
`;

(async () => {
  if (!token) { console.error('[repos] GH_TOKEN غير موجود'); process.exit(1); }
  const repos = [].concat(pkg.build.publish).filter((p) => p && p.provider === 'github');
  for (const { owner, repo } of repos) {
    const api = `https://api.github.com/repos/${owner}/${repo}`;
    const r = await fetch(api, { headers });
    if (r.status === 404 || r.status === 401 || r.status === 403) {
      console.error(`[repos] المستودع ${owner}/${repo} غير موجود أو التوكن لا يملك صلاحية عليه (${r.status}).`);
      console.error('        التوكن يحتاج صلاحية Contents: Read and write على هذا المستودع.');
      process.exit(1);
    }
    if (!r.ok) { console.error(`[repos] تعذّر قراءة ${owner}/${repo}: ${r.status}`); process.exit(1); }
    const info = await r.json();
    if (info.permissions && info.permissions.push === false) {
      console.error(`[repos] التوكن لا يملك صلاحية الكتابة على ${owner}/${repo}.`);
      process.exit(1);
    }
    const c = await fetch(`${api}/contents`, { headers });
    if (c.status === 404) {
      // مستودع فارغ: أول ملف (README) — بدونه يرفض GitHub إنشاء الإصدار
      const put = await fetch(`${api}/contents/README.md`, {
        method: 'PUT', headers,
        body: JSON.stringify({ message: 'Initialize releases repository', content: Buffer.from(README, 'utf8').toString('base64') }),
      });
      if (!put.ok) { console.error(`[repos] تعذّر تهيئة ${owner}/${repo}: ${put.status} ${await put.text()}`); process.exit(1); }
      console.log(`[repos] ${owner}/${repo}: كان فارغاً — أُضيف README`);
    } else {
      console.log(`[repos] ${owner}/${repo}: جاهز (${info.private ? 'خاص' : 'عام'})`);
    }
    if (info.private && repo === [].concat(pkg.build.publish)[0].repo) {
      console.warn(`[repos] تنبيه: ${owner}/${repo} خاص — البرنامج عند العملاء لن يرى التحديثات منه. اجعله عاماً (Public).`);
    }
  }
})().catch((e) => { console.error('[repos]', e); process.exit(1); });
