// ========================================
// theme.js - ダーク/ライトテーマ切替（全ページ共通）
// 実際の切替(data-theme属性のセット)は各HTMLの<head>内インラインスクリプトが
// 描画前に行う（FOUC防止）。ここではトグルボタンの表示と click ハンドラのみを担当する。
// ========================================

const STORAGE_KEY = 'theme';

function updateButton(btn, theme) {
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  btn.title = theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
  btn.setAttribute('aria-label', btn.title);
}

export function initThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  updateButton(btn, current);

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* private mode等は無視 */ }
    updateButton(btn, next);
  });
}

initThemeToggle();
