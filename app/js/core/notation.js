// ========================================
// notation.js - 音名表記（♯/♭）の切替（全ページ共通）
// theme.js と同じ考え方で、設定は localStorage に持ち、ページをまたいで統一する。
// ヘッダーのテーマボタンの隣にコントロールを差し込むので、
// 各ページのHTMLを個別にいじる必要はない（このファイルを読み込むだけでよい）。
//
// 表記が変わったら document に 'notationchange' イベントを飛ばす。
// 各ページは、それを受けて自分の描画関数を呼び直す。
// ========================================

import {
  NOTATION_MODES, setNotation, getNotation,
  CHORD_STYLES, setChordStyle, getChordStyle
} from './musicTheory.js';

const STORAGE_KEY = 'noteNotation';
const STYLE_KEY = 'chordStyle';

/** 保存済みの設定を読み込んで適用する（描画より先に呼ばれる） */
function loadSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setNotation(saved);
    const style = localStorage.getItem(STYLE_KEY);
    if (style) setChordStyle(style);
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

  // コード記号のスタイル（maj7 / M7 / △7 はどれも同じコード。書き方だけの違い）
  const sw = document.createElement('div');
  sw.className = 'notation-switch';
  sw.id = 'chordStyleTabs';
  const l2 = document.createElement('span');
  l2.className = 'lbl';
  l2.textContent = '記号';
  sw.appendChild(l2);
  const t2 = document.createElement('div');
  t2.className = 'tabs';
  CHORD_STYLES.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.style = s.id;
    b.textContent = s.label;
    b.title = s.sample;
    b.addEventListener('click', () => applyStyle(s.id));
    t2.appendChild(b);
  });
  sw.appendChild(t2);
  themeBtn.parentNode.insertBefore(sw, themeBtn);

  syncButtons();
}

function syncButtons() {
  const cur = getNotation();
  document.querySelectorAll('#notationTabs .tabs button').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === cur));
  const st = getChordStyle();
  document.querySelectorAll('#chordStyleTabs .tabs button').forEach(b =>
    b.classList.toggle('on', b.dataset.style === st));
}

function applyStyle(id) {
  setChordStyle(id);
  try { localStorage.setItem(STYLE_KEY, id); } catch (e) { /* 無視 */ }
  syncButtons();
  document.dispatchEvent(new CustomEvent('notationchange', { detail: { chordStyle: id } }));
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
