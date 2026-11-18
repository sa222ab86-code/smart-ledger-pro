'use strict';
/**
 * تحديث أيقونة اختصارات البرنامج بعد كل تحديث (ويندوز فقط).
 *
 * المشكلة: ويندوز يحفظ أيقونة الاختصار في ذاكرة مؤقتة (icon cache) مرتبطة بمسار الملف،
 * والتحديث التلقائي يستبدل البرنامج دون إعادة إنشاء الاختصار → تبقى الأيقونة القديمة.
 *
 * الحل: نسخ icon.ico إلى ملف باسم جديد لكل إصدار، ثم توجيه الاختصارات (سطح المكتب،
 * قائمة ابدأ، المثبّتة في شريط المهام) إليه. المسار الجديد يجبر ويندوز على قراءة الأيقونة من جديد.
 * يعمل مرة واحدة لكل إصدار، وأي خطأ يُتجاهل ولا يؤثر على تشغيل البرنامج.
 */
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');

function findIco() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),            // extraResources في النسخة المثبتة
    path.join(__dirname, '..', 'build', 'icon.ico'),               // وضع التطوير
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function listLnk(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lnk')).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function refreshShortcutIcons() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    const userData = app.getPath('userData');
    const marker = path.join(userData, 'icon-refreshed.txt');
    const version = app.getVersion();
    if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === version) return;

    const ico = findIco();
    if (!ico) return;
    const iconsDir = path.join(userData, 'icons');
    fs.mkdirSync(iconsDir, { recursive: true });
    for (const f of fs.readdirSync(iconsDir)) {
      try { fs.unlinkSync(path.join(iconsDir, f)); } catch { /* قد يكون مستخدماً */ }
    }
    const target = path.join(iconsDir, `app-${version}.ico`);
    fs.copyFileSync(ico, target);

    const exe = process.execPath.toLowerCase();
    const appData = app.getPath('appData');
    const dirs = [
      app.getPath('desktop'),
      path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(appData, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
      path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'),
    ];
    let updated = 0;
    for (const dir of dirs) {
      for (const lnk of listLnk(dir)) {
        try {
          const info = shell.readShortcutLink(lnk);
          if (!info.target || info.target.toLowerCase() !== exe) continue; // اختصارات برنامجنا فقط
          if (shell.writeShortcutLink(lnk, 'update', { icon: target, iconIndex: 0 })) updated++;
        } catch { /* لا صلاحية أو اختصار تالف */ }
      }
    }
    fs.writeFileSync(marker, version);
    console.log(`Shortcut icons refreshed: ${updated}`);
  } catch (err) {
    console.error('refreshShortcutIcons failed:', err);
  }
}

module.exports = { refreshShortcutIcons };
