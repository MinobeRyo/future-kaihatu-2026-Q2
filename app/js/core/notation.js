// ========================================
// notation.js - 音名表記（♯/♭）の切替（全ページ共通）
// theme.js と同じ考え方で、設定は localStorage に持ち、ページをまたいで統一する。
// ヘッダーのテーマボタンの隣にコントロールを差し込むので、
// 各ページのHTMLを個別にいじる必要はない（このファイルを読み込むだけでよい）。
//
// 表記が変わったら document に 'notationchange' イベントを飛ばす。
// 各ページは、それを受けて自分の描画関数を呼び直す。
// ========================================

import { NOTATION_MODES, setNotation, getNotation } from './musicTheory.js';

const STORAGE_KEY = 'noteNotation';

/** 保存済みの設定を読み込んで適用する（描画より先に呼ばれる） */
function loadSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setNotation(saved);
  } catch (e) { /* プライベートモード等は無視 */ }
}

function buildControl() {
  const themeBtn = document.getElementById('themeToggle');
  if (!themeBtn || document.getElementById('notationTabs')) return;

  const wrap = document.createElement('div');
  wrap.className = 'notation-switch';
  wrap.id = 'notationTabs';
  wrap.title = '音名の表記を切り替えます';

  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.textContent = '表記';
  wrap.appendChild(lbl);

  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  NOTATION_MODES.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mode = m.id;
    b.textContent = m.label;
    b.title = m.desc;
    b.addEventListener('click', () => apply(m.id));
    tabs.appendChild(b);
  });
  wrap.appendChild(tabs);

  themeBtn.parentNode.insertBefore(wrap, themeBtn);
  syncButtons();
}

function syncButtons() {
  const cur = getNotation();
  document.querySelectorAll('#notationTabs .tabs button').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === cur));
}

function apply(mode) {
  setNotation(mode);
  try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* 無視 */ }
  syncButtons();
  // 各ページはこれを受けて再描画する
  document.dispatchEvent(new CustomEvent('notationchange', { detail: { mode } }));
}

loadSaved();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildControl);
} else {
  buildControl();
}
