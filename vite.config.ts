import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // ضروري لـ Electron: الملفات تُحمَّل عبر file:// فلا بد من مسارات نسبية
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    // الشعار والصور المستوردة تُضمَّن داخل الكود كـ data: URI حتى لا تتغير مساراتها
    // (الإعدادات المحفوظة في SQLite قد تشير إليها) ولا تنكسر بعد التحديثات.
    assetsInlineLimit: (filePath: string) => (/\.(jpe?g|png|svg)$/i.test(filePath) ? true : undefined),
  },
  server: { port: 5173, strictPort: true },
});
