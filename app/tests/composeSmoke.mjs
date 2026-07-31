// ========================================
// composeSmoke.mjs - 作曲ページ(composePage.js)の画面まわりのスモークテスト
// 実行: node tests/composeSmoke.mjs （appディレクトリで、jsdom が入っている環境）
//
// selftest.mjs は core/data の純粋ロジックを見るためのもので、
// 「DOMに正しく配線されているか」までは見ていない。
// このファイルは jsdom で compose.html を組み立て、composePage.js を読み込んで、
// コードの長さ変更・休符・並べ替え・保存/読み込みが画面ごしに動くかを確認する。
// 音は鳴らせないので、AudioContext と Soundfont はダミーに差し替える。
// ========================================

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'compose.html'), 'utf-8');

const dom = new JSDOM(html, { url: 'http://localhost/compose.html', pretendToBeVisual: true });
const { window } = dom;

// --- ブラウザだけにあるものをダミーで用意する ---
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; }
  createGain() { return { gain: { value: 1 }, connect() {} }; }
}
window.AudioContext = FakeAudioContext;
window.Soundfont = { instrument: async () => ({ play: () => ({ stop() {} }) }) };
window.URL.createObjectURL = () => 'blob:fake';
window.URL.revokeObjectURL = () => {};

// composePage.js はモジュールの読み込み時点で document を触るので、先にグローバルへ載せる
for (const k of ['window', 'document', 'localStorage', 'sessionStorage',
  'HTMLElement', 'HTMLAnchorElement', 'Node', 'Element', 'Event', 'CustomEvent',
  'PointerEvent', 'MouseEvent', 'requestAnimationFrame', 'cancelAnimationFrame',
  'getComputedStyle', 'Blob', 'URL', 'AudioContext', 'Soundfont']) {
  // Node が読み取り専用にしているグローバル（navigator など）は上書きしない
  try { globalThis[k] = window[k]; } catch (_) { /* そのままでよい */ }
}

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n     expected: ${e}\n     actual:   ${a}`); }
}
const $ = (id) => window.document.getElementById(id);
const cards = () => [...$('cards').querySelectorAll('.cv2-card')];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

// --- 読み込み ---
await import('../js/pages/composePage.js');

console.log('--- 初期表示 ---');
check('最初はコードが無い', cards().length, 0);
check('「＋足す」がある', !!$('cards').querySelector('.cv2-add:not(.rest)'), true);
check('「＋休符」がある', !!$('cards').querySelector('.cv2-add.rest'), true);
check('選択行は隠れている', $('selRow').style.display, 'none');
check('キー・保存・開くはヘッダーではなくメイン内にある',
  ['keyName', 'saveSong', 'loadSong'].every(id => !!$(id).closest('.cv2-main')), true);
check('共通ヘッダーには何も足していない',
  ['keyName', 'saveSong', 'loadSong'].some(id => !!$(id).closest('header.app-nav')), false);

// ヘッダーは全ページで同じでなければならない（作曲だけ違う状態に戻らないようにする）
const headerOf = (file) => readFileSync(join(here, '..', file), 'utf-8')
  .match(/<header[\s\S]*?<\/header>/)[0]
  .replace(/\sclass="active"/g, '')      // 現在地のハイライトだけは各ページで違う
  .replace(/\s+/g, ' ').trim();
for (const other of ['index.html', 'tutorial.html', 'learn.html', 'compare.html', '魔法陣.html']) {
  check(`ヘッダーが ${other} と同じ`, headerOf('compose.html'), headerOf(other));
}

console.log('--- プリセット読み込み ---');
click($('presets').querySelector('.cv2-preset'));
const n0 = cards().length;
check('カードが並ぶ', n0 > 0, true);
check('全カードに長さバッジが出る', cards().every(c => /拍/.test(c.querySelector('.lenchip').textContent)), true);

console.log('--- コードの長さ変更 ---');
click(cards()[0]);
check('選ぶと操作行が出る', $('selRow').style.display, 'flex');
check('長さの初期表示', $('lenName').textContent, '2拍');
const startsBefore = cards().map(c => c.dataset.id);
click($('lenUp'));
check('1段階のばすと3拍', $('lenName').textContent, '3拍');
click($('lenUp'));
check('もう1段階で4拍', $('lenName').textContent, '4拍');
check('長さを変えてもカードの数と並びは変わらない', cards().map(c => c.dataset.id), startsBefore);
check('先頭カードのバッジも更新される', cards()[0].querySelector('.lenchip').textContent, '4拍');
click($('lenDown')); click($('lenDown'));
check('戻せる', $('lenName').textContent, '2拍');
// 下限では押せなくなる
click($('lenDown'));
check('最短は1拍', $('lenName').textContent, '1拍');
check('最短では‹が無効', $('lenDown').disabled, true);
click($('lenUp'));

console.log('--- 1音の長さ（メロディ） ---');
const lenTabs = () => [...$('lenTabs').querySelectorAll('.cv2-lentab')];
check('選択肢は拍数で出る', lenTabs().map(b => b.textContent), ['0.5拍', '1拍', '2拍', '4拍']);
check('「みじかい/ながい」という余韻と紛らわしい言葉は使わない',
  lenTabs().some(b => /みじかい|ながい/.test(b.textContent)), false);
check('ラベルも拍数の話だとわかる', $('lenTabs').previousElementSibling.textContent, '1音の長さ');
check('既定は1拍', lenTabs().find(b => b.classList.contains('on')).textContent, '1拍');
// 選んだ長さで音が置かれ、次回のために覚えられる
click(lenTabs()[3]);   // 4拍
check('選び直せる', lenTabs().find(b => b.classList.contains('on')).textContent, '4拍');
check('次回のために保存される', window.localStorage.getItem('composeMelLen'), '4');
click($('doremi').querySelector('.cv2-note-btn'));   // ド
check('その長さで音が置かれる', $('rollGrid').querySelector('.cv2-roll-note.melody').style.width,
  `${4 * 56 - 3}px`);
check('選択した音の長さ表示も拍数', $('noteLen').textContent, '⟷ 長さ（4拍）');
click($('noteLen'));
check('長さボタンで一周する（4拍→0.5拍）', $('noteLen').textContent, '⟷ 長さ（0.5拍）');
click($('noteDel'));
click(lenTabs()[1]);   // 1拍に戻す

console.log('--- 休符 ---');
click(cards()[0]);   // 直前のメロディ操作で選択が外れているので、先頭のコードを選び直す
click($('cards').querySelector('.cv2-add.rest'));
check('休符カードが増える', cards().length, n0 + 1);
const restCard = cards().find(c => c.classList.contains('rest'));
check('休符は選択コードの直後に入る', cards().indexOf(restCard), 1);
check('休符カードに休符記号（SVG）が出る', !!restCard.querySelector('svg.restmark'), true);
check('豆腐になる文字は使っていない', /\u{1D13D}/u.test(window.document.body.innerHTML), false);
check('✕は線で描いている', !!restCard.querySelector('.rm svg'), true);
check('休符を選ぶと和音の操作は隠れる（選択中）', restCard.classList.contains('sel'), true);
check('7th/9thは隠れる', $('chordOnlyTogs').style.display, 'none');
check('積み方も隠れる', $('voicingBtn').style.display, 'none');
check('長さは休符にも効く', $('lenName').textContent, '2拍');
check('ラベルが休符になる', $('selName').textContent, '休符（無音）を調整');
check('ピアノロールに休符帯が出る', !!$('rollRegions').querySelector('.cv2-roll-region.rest'), true);
// 休符ぶん、コード帯は右にずれる
const regions = [...$('rollRegions').querySelectorAll('.cv2-roll-region')];
check('コード帯と休符帯の数が一致', regions.length, n0 + 1);

console.log('--- 並べ替え ---');
const idsBefore = cards().map(c => c.dataset.id);
// 実際のドラッグは jsdom では座標が取れないので、DOMの並びを入れ替えてから pointerup を投げ、
// 「離した時点のDOMの並びが状態に反映されるか」を確認する
const first = cards()[0];
first.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
window.document.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 0 }));
const list = $('cards');
list.insertBefore(first, cards()[2]);   // 3番目の手前へ動かした状態にする
const idsDropped = cards().map(c => c.dataset.id);
window.document.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, clientX: 300, clientY: 0 }));
check('離したあとの並びが保たれる', cards().map(c => c.dataset.id), idsDropped);
check('並びは実際に変わっている', cards().map(c => c.dataset.id).join() !== idsBefore.join(), true);
check('カードの数は変わらない', cards().length, n0 + 1);
// 並べ替えたあとも隙間・重なりが無いこと（ピアノロールの帯の左端で見る）
const lefts = [...$('rollRegions').querySelectorAll('.cv2-roll-region')]
  .map(el => parseFloat(el.style.left));
check('帯は左から昇順に並ぶ', lefts.every((v, i) => i === 0 || v > lefts[i - 1]), true);
check('先頭は0から始まる', lefts[0], 0);

console.log('--- 保存 / 読み込み ---');
let saved = null;
window.Blob = class { constructor(parts) { saved = parts.join(''); } };
globalThis.Blob = window.Blob;
window.prompt = () => 'スモークテスト曲';
window.HTMLAnchorElement.prototype.click = function () { };
click($('saveSong'));
check('JSONが書き出される', typeof saved, 'string');
const doc = JSON.parse(saved);
check('種類の目印が入る', doc.kind, 'tsumine.song');
check('タイトルが入る', doc.title, 'スモークテスト曲');
check('休符も含めて保存される', doc.tracks.chord.length, n0 + 1);
check('休符に印が付く', doc.tracks.chord.some(c => c.isRest === true), true);
check('通知が出る', $('cv2Toast')?.classList.contains('show'), true);

// 画面を空にしてから読み戻す
click($('presets').querySelectorAll('.cv2-preset')[1]);
check('別のプリセットで上書きされた', cards().some(c => c.classList.contains('rest')), false);

const file = { text: async () => saved };
Object.defineProperty($('songFileInput'), 'files', { value: [file], configurable: true });
$('songFileInput').dispatchEvent(new window.Event('change', { bubbles: true }));
await new Promise(r => window.setTimeout(r, 30));
check('読み込みでカード数が戻る', cards().length, n0 + 1);
check('休符も戻る', cards().filter(c => c.classList.contains('rest')).length, 1);
check('並び順も戻る（コード名と休符の位置）',
  cards().map(c => c.classList.contains('rest') ? '休' : c.querySelector('.name').textContent),
  doc.tracks.chord.map((c, i) => c.isRest ? '休' : cards()[i].querySelector('.name').textContent));
check('BPMが戻る', $('bpmRange').value, String(doc.bpm));

console.log('--- 壊れたファイル ---');
Object.defineProperty($('songFileInput'), 'files',
  { value: [{ text: async () => '{"foo":1}' }], configurable: true });
$('songFileInput').dispatchEvent(new window.Event('change', { bubbles: true }));
await new Promise(r => window.setTimeout(r, 30));
check('エラー通知になる', $('cv2Toast').classList.contains('err'), true);
check('曲は壊れない', cards().length, n0 + 1);

console.log(`\n結果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
