// ========================================
// composePage.js - 作曲モード v2（新デザイン「作曲融合案」の落とし込み）
// STEP1: コードをならべる（カード＋タブ式パレット＋7th/9th＋プリセット＋逆引き診断）
// STEP2: メロディ/ベースをのせる（レイヤー切り替え＋おまかせ生成＋ドレミ入力
//        ＋次の音の提案パネル＋編集可能ピアノロール）
// フッター: 再生 / BPM / くりかえし / 音色
// ロジックは core（musicTheory/timeline/audioEngine/melodyGen/suggest）と
// data（progressions/songs/chordPalette）に委譲し、
// このファイルは「新デザインのUI ↔ 既存エンジン」の配線に徹する。
// ========================================

import {
  NOTE_LETTERS, CHORD_INTERVALS, CHORD_TYPE_LABELS, TENSIONS,
  chordDisplayName, chordAltName, midiDisplayName, degreeToRoman,
  pcName, pcAltName, setDisplayKey, chordSpelling, degreeMeaningList
} from '../core/musicTheory.js';

/** 「両方」モードのとき、別表記を小さく添えるための HTML（それ以外は空） */
const altTag = (alt) => alt ? `<small class="alt">${alt}</small>` : '';
import {
  initAudio, loadInstrument, playNow, playTracks, stop, RING_MODES, noteDuration
} from '../core/audioEngine.js';
import { PROGRESSION_PRESETS, presetToChords } from '../data/progressions.js';
import { PALETTE_TABS, paletteChords } from '../data/chordPalette.js';
import { findSimilarProgressions, matchMessage } from '../data/songs.js';
import { MELODY_STYLES, generateMelody } from '../core/melodyGen.js';
import {
  suggestMelodyNotes, suggestBassNotes, suggestNextChords, chordAtCount
} from '../core/suggest.js';
import {
  createTimeline, addEvent, eventMidi, findEvent, removeEvent, sortTrack, withId,
  moveEvent, transposeEvent, resizeEvent, trackEnd, timelineEnd, toPlayableTracks
} from '../core/timeline.js';

// ---------- 定数・見た目 ----------
const COUNT_W = 56;   // 1カウントの横幅(px)
const ROW_H = 14;     // 半音1行の高さ(px)
const ROLL_HEADER = 44; // ビート番号(20) + コード帯(22+2)
const SNAP = 0.5;

const MINOR_TYPES = new Set(['minor', 'm7', 'mmaj7']);
const DIM_TYPES = new Set(['dim', 'dim7', 'm7b5']);
const DOM_TYPES = new Set(['7', '7sus4']);

// クオリティ別のカード色クラス
function qClass(type) {
  if (DOM_TYPES.has(type)) return 'q-dom';
  if (DIM_TYPES.has(type)) return 'q-dim';
  if (MINOR_TYPES.has(type)) return 'q-min';
  return 'q-maj';
}
const ROLL_BLOCK_COLOR = { 'q-maj': 'var(--maj)', 'q-min': 'var(--min)', 'q-dom': 'var(--dom)', 'q-dim': 'var(--dim)' };

// コードの雰囲気を一言で
const FEEL = {
  major: 'あかるい', minor: 'せつない', '7': 'つぎへ進む', maj7: 'おしゃれ',
  m7: '大人なせつなさ', m7b5: '不安定', mmaj7: 'ミステリアス', sus4: 'ふわっと',
  sus2: 'すっきり', '7sus4': 'ふわっと', dim: '緊張感', dim7: '緊張感', aug: 'ふしぎ', none: ''
};

// 7th トグルのための対応表
const SEVENTH_OF = { major: 'maj7', minor: 'm7', dim: 'dim7', sus4: '7sus4', sus2: '7', aug: '7' };
const TRIAD_OF = { maj7: 'major', m7: 'minor', '7': 'major', dim7: 'dim', '7sus4': 'sus4', m7b5: 'minor', mmaj7: 'minor' };
const hasSeventh = (type) => (CHORD_INTERVALS[type] || []).some(i => i === 10 || i === 11);

// ドレミ（メジャースケール音）
const DOREMI = [
  { off: 0, label: 'ド' }, { off: 2, label: 'レ' }, { off: 4, label: 'ミ' },
  { off: 5, label: 'ファ' }, { off: 7, label: 'ソ' }, { off: 9, label: 'ラ' },
  { off: 11, label: 'シ' }
];
const LEN_TABS = [{ label: 'みじかい', val: 1 }, { label: 'ながい', val: 2 }];
const INSTRUMENTS = [
  { label: 'ピアノ', name: 'acoustic_grand_piano' },
  { label: 'ギター', name: 'acoustic_guitar_nylon' },
  { label: 'EP', name: 'electric_piano_1' }
];

// 編集できるレイヤー。octave はドレミ入力・提案で音を置くときの基準。
const LAYERS = [
  { id: 'melody', label: 'メロディ', icon: '🎵', octave: 5, range: { low: 64, high: 86 } },
  { id: 'bass', label: 'ベース', icon: '🎸', octave: 3, range: { low: 40, high: 60 } }
];
const layerOf = (id) => LAYERS.find(l => l.id === id) ?? LAYERS[0];

// 提案カードの役割 → 色クラス
const ROLE_CLASS = { lift: 'r-lift', settle: 'r-settle', step: 'r-step', color: 'r-color', flow: 'r-flow' };

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const presetsEl = $('presets');
const cardsEl = $('cards');
const selRow = $('selRow'), selNameEl = $('selName'), tog7 = $('tog7'), tog9 = $('tog9'), delChord = $('delChord');
const diagBtn = $('diagBtn'), diagResult = $('diagResult');
const chordSuggestGridEl = $('chordSuggestGrid'), chordSuggestCtxEl = $('chordSuggestCtx');
const layerTabsEl = $('layerTabs'), bassModeEl = $('bassMode');
const autoMelBtn = $('autoMel'), clearMelBtn = $('clearMel');
const styleTabsEl = $('styleTabs'), styleDescEl = $('styleDesc');
const lenTabsEl = $('lenTabs'), doremiEl = $('doremi');
const suggestGridEl = $('suggestGrid'), suggestCtxEl = $('suggestCtx');
const legendEl = $('legend');
const rollLabels = $('rollLabels'), rollScroll = $('rollScroll');
const rollBeatnums = $('rollBeatnums'), rollRegions = $('rollRegions'), rollGrid = $('rollGrid');
const melSelRow = $('melSelRow'), melSelLabel = $('melSelLabel');
const noteUp = $('noteUp'), noteDown = $('noteDown'), noteLen = $('noteLen'), noteDel = $('noteDel');
const keyName = $('keyName'), keyUp = $('keyUp'), keyDown = $('keyDown');
const playBtn = $('playBtn'), bpmRange = $('bpmRange'), bpmLabel = $('bpmLabel'), loopBtn = $('loopBtn');
const instTabs = $('instTabs'), ringTabs = $('ringTabs');

// ---------- 状態 ----------
let tl = createTimeline();
let keyPc = 0;
let selected = null;        // { track:'chord'|'melody'|'bass', id }
let paletteOpen = false;
let paletteTab = PALETTE_TABS[0].id;
let customRoot = 0, customType = 'major';   // 「くわしく」タブの組み立て状態
const customTensions = new Set();
let activePresetId = null;
let activeLayer = 'melody'; // ピアノロール・ドレミ・提案パネルの操作対象
let bassMode = 'auto';      // 'auto' = コードのルートから自動生成 / 'manual' = ユーザーが編集した
let melStyle = MELODY_STYLES[0].id;
let melLen = 1;             // ドレミ入力・クリック追加の長さ
let chordInstrument = INSTRUMENTS[0].name;
let ringMode = 'normal';    // 音の「のび」（余韻の長さ）
let loopOn = false;
let looping = false;        // くりかえしのつなぎ目かどうか（余韻を切らないため）
let isPlaying = false;
let playheadEl = null;
let curRange = { low: 57, high: 81 };
let gridH = 0, totalCounts = 8;
const restPad = { melody: 0, bass: 0 };   // 「休み」ぶんの空き（レイヤーごと）

const TRACK_INSTRUMENTS = () => ({ chord: chordInstrument, melody: 'acoustic_grand_piano', bass: 'acoustic_bass' });

// ---------- 音の準備・試聴 ----------
let pianoReady = false;
async function ensureAudio() {
  initAudio();
  if (!pianoReady) { await loadInstrument('acoustic_grand_piano'); pianoReady = true; }
  const needed = new Set(Object.values(TRACK_INSTRUMENTS()));
  await Promise.all([...needed].map(n => loadInstrument(n)));
}
async function previewMidi(midis, instrument = 'acoustic_grand_piano', duration = 0.8) {
  await ensureAudio();
  await loadInstrument(instrument);
  playNow(midis, { duration, instrument, ring: ringMode });
}
/**
 * 試聴。以前は長さを 1.0秒 に決め打ちしていたため、
 * 「ながい」音符や 4カウントに伸ばした音を押しても短くしか鳴らなかった。
 * 実際の音符の長さ・BPM・のび設定から発音秒数を計算する。
 */
async function previewEvent(track, ev) {
  if (!ev) return;
  const dur = noteDuration(ev.lengthCount, Number(bpmRange.value), ringMode);
  await previewMidi(eventMidi(track, ev), TRACK_INSTRUMENTS()[track], dur);
}

// ---------- ベース: 自動生成 ＋ 手動上書き ----------
// 既定ではコードのルートから自動生成する（初心者は何もしなくていい）。
// ユーザーがベースを1回でも編集したら 'manual' に切り替わり、以後は自動再生成しない。
// 「自動に戻す」ボタンでいつでも 'auto' に復帰できる。
function rebuildBass() {
  if (bassMode !== 'auto') return;
  tl.bass = [...tl.chord]
    .sort((a, b) => a.startCount - b.startCount)
    .map(c => withId({ rootPc: c.rootPc, type: 'none', tensions: [], octave: 3, startCount: c.startCount, lengthCount: c.lengthCount }));
}
function markBassManual() {
  if (bassMode === 'manual') return;
  bassMode = 'manual';
}
function resetBassAuto() {
  bassMode = 'auto';
  restPad.bass = 0;
  if (selected?.track === 'bass') selected = null;
  rebuildBass();
  renderAll();
}
function buildBassMode() {
  const manual = bassMode === 'manual';
  bassModeEl.innerHTML = `
    <span class="tag ${manual ? 'manual' : 'auto'}">${manual ? '✋ ベース: 手動' : '⚙️ ベース: 自動'}</span>
    <span class="note">${manual ? 'コードを変えてもベースは変わりません' : 'コードのルートから自動で作っています'}</span>
    ${manual ? '<button id="bassReset" type="button">自動に戻す</button>' : ''}`;
  const btn = $('bassReset');
  if (btn) btn.addEventListener('click', resetBassAuto);
}

// ---------- レイヤー切り替え ----------
function buildLayerTabs() {
  layerTabsEl.innerHTML = '';
  LAYERS.forEach(l => {
    const b = document.createElement('button');
    b.className = `cv2-layertab l-${l.id}` + (l.id === activeLayer ? ' on' : '');
    b.innerHTML = `<span class="ic">${l.icon}</span>${l.label}<small>${tl[l.id].length}音</small>`;
    b.addEventListener('click', () => {
      if (activeLayer === l.id) return;
      activeLayer = l.id;
      if (selected && selected.track !== 'chord' && selected.track !== l.id) selected = null;
      renderAll();
    });
    layerTabsEl.appendChild(b);
  });
}

// ============================================================
// STEP1: プリセット
// ============================================================
function buildPresets() {
  presetsEl.innerHTML = '';
  PROGRESSION_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'cv2-preset';
    b.textContent = p.name;
    b.title = p.romanLabel + ' — ' + p.mood;
    b.addEventListener('click', () => loadPreset(p.id));
    b.dataset.id = p.id;
    presetsEl.appendChild(b);
  });
}
function updatePresetActive() {
  presetsEl.querySelectorAll('.cv2-preset').forEach(b =>
    b.classList.toggle('on', b.dataset.id === activePresetId));
}
function loadPreset(id) {
  const preset = PROGRESSION_PRESETS.find(p => p.id === id);
  if (!preset) return;
  tl.chord = presetToChords(preset, keyPc).map((c, i) =>
    withId({ ...c, tensions: [], octave: 4, startCount: i * 2, lengthCount: 2 }));
  rebuildBass();
  activePresetId = id;
  selected = null;
  diagResult.textContent = '';
  renderAll();
}

// ============================================================
// STEP1: コードカード
// ============================================================
// 構成音は「そのコードの中で何度か」で綴る（Cdim の第3音は F♯ ではなく G♭）
function chordNoteLetters(ev) {
  return chordSpelling(ev.rootPc, ev.type, ev.tensions ?? []).map(s => s.name).join('・');
}
/** 「1・♭3・♭5」のような度数の並び。なぜその綴りになるかが読み取れる */
function chordDegreeLabels(ev) {
  return chordSpelling(ev.rootPc, ev.type, ev.tensions ?? []).map(s => s.degreeLabel).join('・');
}

function buildCards() {
  cardsEl.innerHTML = '';
  const chords = [...tl.chord].sort((a, b) => a.startCount - b.startCount);
  chords.forEach(ev => {
    const off = ((ev.rootPc - keyPc) % 12 + 12) % 12;
    const card = document.createElement('div');
    card.className = `cv2-card ${qClass(ev.type)}` + (selected?.track === 'chord' && selected.id === ev.id ? ' sel' : '');
    card.innerHTML = `
      <div class="top">
        <span class="deg">${degreeToRoman(off, ev.type)}</span>
        <button class="rm" title="削除">✕</button>
      </div>
      <div class="name">${chordDisplayName(ev.rootPc, ev.type, ev.tensions)}${altTag(chordAltName(ev.rootPc, ev.type, ev.tensions))}</div>
      <div class="feel">${FEEL[ev.type] ?? ''}</div>
      <div class="notes">${chordNoteLetters(ev)}</div>
      <div class="degs" title="${degreeMeaningList(ev.rootPc, ev.type, ev.tensions ?? [])}">${chordDegreeLabels(ev)}</div>`;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.rm')) { removeChord(ev.id); return; }
      selectChord(ev.id);
    });
    cardsEl.appendChild(card);
  });

  // ＋足す（パレット）
  const wrap = document.createElement('div');
  wrap.className = 'cv2-addwrap';
  const add = document.createElement('button');
  add.className = 'cv2-add' + (paletteOpen ? ' on' : '');
  add.innerHTML = '<span class="plus">＋</span><span class="txt">足す</span>';
  add.addEventListener('click', () => { paletteOpen = !paletteOpen; buildCards(); });
  wrap.appendChild(add);
  if (paletteOpen) wrap.appendChild(buildPalette());
  cardsEl.appendChild(wrap);
}

// タブ式のコードパレット。定義は data/chordPalette.js 側に置いてある。
function buildPalette() {
  const pal = document.createElement('div');
  pal.className = 'cv2-palette';
  pal.addEventListener('click', e => e.stopPropagation());

  // タブ
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  PALETTE_TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = t.id === paletteTab ? 'on' : '';
    b.textContent = t.label;
    b.addEventListener('click', () => { paletteTab = t.id; buildCards(); });
    tabs.appendChild(b);
  });
  pal.appendChild(tabs);

  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = PALETTE_TABS.find(t => t.id === paletteTab)?.desc ?? '';
  pal.appendChild(cap);

  // 「くわしく」タブは自由組み立て式
  if (paletteTab === 'custom') {
    pal.classList.add('wide');
    pal.appendChild(buildCustomChord());
    return pal;
  }

  // コードボタン
  const grid = document.createElement('div');
  grid.className = 'grid';
  paletteChords(paletteTab, keyPc).forEach(d => {
    const b = document.createElement('button');
    b.style.background = ROLL_BLOCK_COLOR[qClass(d.type)];
    b.innerHTML = `<span class="nm">${chordDisplayName(d.rootPc, d.type)}</span>
                   <span class="dg">${d.badge ?? degreeToRoman(d.off, d.type)}</span>`;
    b.title = d.tip ?? '';
    b.addEventListener('click', () => addChord(d.rootPc, d.type));
    b.addEventListener('mouseenter', () => { tip.textContent = d.tip ?? ''; });
    grid.appendChild(b);
  });
  pal.appendChild(grid);

  // ホバーで一言解説を出す欄
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.textContent = 'コードにカーソルを合わせると、使いどころが出ます';
  pal.appendChild(tip);

  return pal;
}

// ------------------------------------------------------------
// パレット「くわしく」: ルート × 種類 × テンションを自由に組み立てる
// 練習モードと同じ自由度を作曲モードにも持たせるためのタブ。
// これまでは用意された組み合わせしか置けず、A♭m7♭5 のようなコードを作れなかった。
// ------------------------------------------------------------
const CHORD_TYPE_MENU = [
  ['major', 'メジャー'], ['minor', 'マイナー'], ['7', '7th'], ['maj7', 'maj7'],
  ['m7', 'm7'], ['m7b5', 'm7♭5'], ['mmaj7', 'mM7'], ['dim', 'dim'], ['dim7', 'dim7'],
  ['aug', 'aug'], ['sus4', 'sus4'], ['sus2', 'sus2'], ['7sus4', '7sus4']
];

function buildCustomChord() {
  const box = document.createElement('div');
  box.className = 'cv2-custom';
  const tensions = [...customTensions];

  // --- ルート（12音） ---
  const rootRow = document.createElement('div');
  rootRow.className = 'row roots';
  for (let pc = 0; pc < 12; pc++) {
    const b = document.createElement('button');
    b.className = 'chip' + (pc === customRoot ? ' on' : '') + (NOTE_LETTERS[pc].includes('#') ? ' black' : '');
    b.innerHTML = `${pcName(pc)}${altTag(pcAltName(pc))}`;
    b.addEventListener('click', () => { customRoot = pc; buildCards(); previewCustom(); });
    rootRow.appendChild(b);
  }
  box.appendChild(section('ルート', rootRow));

  // --- 種類 ---
  const typeRow = document.createElement('div');
  typeRow.className = 'row';
  CHORD_TYPE_MENU.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.className = 'chip' + (id === customType ? ' on' : '');
    b.textContent = label;
    b.addEventListener('click', () => { customType = id; buildCards(); previewCustom(); });
    typeRow.appendChild(b);
  });
  box.appendChild(section('種類', typeRow));

  // --- テンション ---
  const tenRow = document.createElement('div');
  tenRow.className = 'row';
  Object.entries(TENSIONS).forEach(([key, def]) => {
    const b = document.createElement('button');
    b.className = 'chip' + (customTensions.has(key) ? ' on' : '');
    b.textContent = def.label;
    b.title = def.feel;
    b.addEventListener('click', () => {
      if (customTensions.has(key)) customTensions.delete(key);
      else customTensions.add(key);
      buildCards();
      previewCustom();
    });
    tenRow.appendChild(b);
  });
  box.appendChild(section('テンション', tenRow));

  // --- プレビュー＋追加 ---
  const prev = document.createElement('div');
  prev.className = 'cv2-custom-preview';
  const ev = { rootPc: customRoot, type: customType, tensions };
  prev.innerHTML = `
    <div class="nm">${chordDisplayName(customRoot, customType, tensions)}${altTag(chordAltName(customRoot, customType, tensions))}</div>
    <div class="notes">${chordNoteLetters(ev)}<span class="degs">${chordDegreeLabels(ev)}</span></div>`;
  const add = document.createElement('button');
  add.className = 'cv2-custom-add';
  add.textContent = '＋ このコードを足す';
  add.addEventListener('click', () => addChord(customRoot, customType, tensions));
  prev.appendChild(add);
  box.appendChild(prev);
  return box;

  function section(label, body) {
    const s = document.createElement('div');
    s.className = 'cv2-custom-sec';
    s.innerHTML = `<span class="lb">${label}</span>`;
    s.appendChild(body);
    return s;
  }
}
function previewCustom() {
  previewEvent('chord', { rootPc: customRoot, type: customType, tensions: [...customTensions], octave: 4, lengthCount: 2 });
}

function addChord(rootPc, type, tensions = []) {
  const ev = addEvent(tl, 'chord', { rootPc, type, octave: 4, startCount: trackEnd(tl.chord), lengthCount: 2, tensions });
  rebuildBass();
  activePresetId = null;
  selectChord(ev.id);
}
function removeChord(id) {
  removeEvent(tl, 'chord', id);
  rebuildBass();
  if (selected?.track === 'chord' && selected.id === id) selected = null;
  activePresetId = null;
  renderAll();
}
function selectChord(id) {
  selected = { track: 'chord', id };
  renderAll();
  previewEvent('chord', findEvent(tl, 'chord', id));
}

// 選択コードの操作行（7th / 9th / 削除）
function updateSelRow() {
  const ev = selected?.track === 'chord' ? findEvent(tl, 'chord', selected.id) : null;
  if (!ev) { selRow.style.display = 'none'; return; }
  selRow.style.display = 'flex';
  selNameEl.textContent = `${chordDisplayName(ev.rootPc, ev.type, ev.tensions)} に音を足す`;
  tog7.classList.toggle('on', hasSeventh(ev.type));
  tog9.classList.toggle('on', (ev.tensions || []).includes('add9'));
}
tog7.addEventListener('click', () => {
  const ev = findEvent(tl, 'chord', selected?.id);
  if (!ev) return;
  ev.type = hasSeventh(ev.type) ? (TRIAD_OF[ev.type] || ev.type) : (SEVENTH_OF[ev.type] || ev.type);
  activePresetId = null;
  renderAll();
  previewEvent('chord', ev);
});
tog9.addEventListener('click', () => {
  const ev = findEvent(tl, 'chord', selected?.id);
  if (!ev) return;
  ev.tensions = (ev.tensions || []).includes('add9') ? [] : ['add9'];
  activePresetId = null;
  renderAll();
  previewEvent('chord', ev);
});
delChord.addEventListener('click', () => { if (selected?.track === 'chord') removeChord(selected.id); });

// ------------------------------------------------------------
// STEP1: 次のコードの提案パネル
// ------------------------------------------------------------
function buildChordSuggest() {
  chordSuggestGridEl.innerHTML = '';
  const list = suggestNextChords({ chords: tl.chord, keyPc });
  const chords = [...tl.chord].sort((a, b) => a.startCount - b.startCount);
  const last = chords[chords.length - 1];

  chordSuggestCtxEl.textContent = last
    ? `いまは ${chordDisplayName(last.rootPc, last.type, last.tensions)} で終わっています`
    : 'まだコードがありません。出だしの候補です';

  list.forEach(s => {
    const card = document.createElement('button');
    card.className = `cv2-suggest-card ${ROLE_CLASS[s.role] ?? ''}`;
    card.innerHTML = `
      <span class="role">${s.label}</span>
      <span class="pitch">${s.name}<small>${s.degree}</small></span>
      <span class="hint">${s.hint}</span>`;
    card.addEventListener('click', () => addChord(s.rootPc, s.type));
    chordSuggestGridEl.appendChild(card);
  });
}

// 逆引き診断
diagBtn.addEventListener('click', () => {
  const chords = [...tl.chord].sort((a, b) => a.startCount - b.startCount);
  if (chords.length === 0) { diagResult.textContent = 'まずコードをならべてね'; return; }
  const results = findSimilarProgressions(chords);
  diagResult.textContent = results.length > 0 ? matchMessage(results[0]) : matchMessage(null);
});

// ============================================================
// STEP2: 共通ヘルパー（カーソル位置・直前の音）
// ============================================================
/** いま音を書き足す位置（＝アクティブレイヤーの終端 ＋ 休符ぶん） */
function cursorCount() {
  return trackEnd(tl[activeLayer]) + restPad[activeLayer];
}
/** アクティブレイヤーの最後の音のMIDI（無ければ null） */
function lastMidi() {
  const evs = [...tl[activeLayer]].sort((a, b) => a.startCount - b.startCount);
  if (evs.length === 0) return null;
  return eventMidi(activeLayer, evs[evs.length - 1])[0];
}
function chordTonePcs(ev) {
  if (!ev) return new Set();
  return new Set((CHORD_INTERVALS[ev.type] || [0]).map(i => (ev.rootPc + i) % 12));
}

// ============================================================
// STEP2: ドレミ入力
// ============================================================
function buildLenTabs() {
  lenTabsEl.innerHTML = '';
  LEN_TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'cv2-lentab' + (t.val === melLen ? ' on' : '');
    b.textContent = t.label;
    b.addEventListener('click', () => { melLen = t.val; buildLenTabs(); });
    lenTabsEl.appendChild(b);
  });
}
function buildDoremi() {
  doremiEl.innerHTML = '';
  const tones = chordTonePcs(chordAtCount(tl.chord, cursorCount()));
  DOREMI.forEach(d => {
    const pc = (keyPc + d.off) % 12;
    const b = document.createElement('button');
    b.className = 'cv2-note-btn' + (tones.has(pc) ? ' fit' : '');
    b.innerHTML = `<span class="lab">${d.label}</span><span class="sub">${pcName(pc)}${altTag(pcAltName(pc))}</span>`;
    b.addEventListener('click', () => addLayerNote(pc, layerOf(activeLayer).octave));
    doremiEl.appendChild(b);
  });
  const rest = document.createElement('button');
  rest.className = 'cv2-note-btn util';
  rest.innerHTML = '<span class="lab">𝄽</span><span class="sub">休み</span>';
  rest.addEventListener('click', addRest);
  doremiEl.appendChild(rest);
  const back = document.createElement('button');
  back.className = 'cv2-note-btn util';
  back.innerHTML = '<span class="lab">⌫</span><span class="sub">戻す</span>';
  back.addEventListener('click', backstepLayer);
  doremiEl.appendChild(back);
}

// 「休符」= 実体は持たないので、次の音の開始位置を melLen ぶん後ろにずらすための番兵。
function addRest() { restPad[activeLayer] += melLen; renderStep2(); }

/** アクティブレイヤーに音を1つ足す */
function addLayerNote(pc, octave, startCount = null, lengthCount = null) {
  const start = startCount ?? cursorCount();
  restPad[activeLayer] = 0;
  if (activeLayer === 'bass') markBassManual();
  const ev = addEvent(tl, activeLayer, {
    rootPc: pc, octave, startCount: start, lengthCount: lengthCount ?? melLen
  });
  sortTrack(tl, activeLayer);
  selected = { track: activeLayer, id: ev.id };
  renderAll();
  previewEvent(activeLayer, ev);
}
function backstepLayer() {
  const track = tl[activeLayer];
  if (track.length === 0) {
    restPad[activeLayer] = Math.max(0, restPad[activeLayer] - melLen);
    renderStep2();
    return;
  }
  if (activeLayer === 'bass') markBassManual();
  const last = [...track].sort((a, b) => a.startCount - b.startCount).pop();
  removeEvent(tl, activeLayer, last.id);
  if (selected?.track === activeLayer && selected.id === last.id) selected = null;
  renderAll();
}

// ============================================================
// STEP2: 次の音の提案パネル
// ============================================================
function buildStyleTabs() {
  styleTabsEl.innerHTML = '';
  MELODY_STYLES.forEach(s => {
    const b = document.createElement('button');
    b.className = s.id === melStyle ? 'on' : '';
    b.textContent = s.label;
    b.title = s.desc;
    b.addEventListener('click', () => { melStyle = s.id; buildStyleTabs(); updateStyleDesc(); });
    styleTabsEl.appendChild(b);
  });
}
function updateStyleDesc() {
  const s = MELODY_STYLES.find(x => x.id === melStyle);
  styleDescEl.textContent = s ? `${s.label} — ${s.desc}　※押すたびに違うメロディができます` : '';
}

function buildSuggest() {
  suggestGridEl.innerHTML = '';
  if (tl.chord.length === 0) {
    suggestCtxEl.textContent = '';
    suggestGridEl.innerHTML = '<div class="cv2-suggest-empty">さきにコードをならべると、次に置くとよい音を提案します</div>';
    return;
  }
  const cur = cursorCount();
  const chord = chordAtCount(tl.chord, cur);
  const layer = layerOf(activeLayer);
  const opts = { chords: tl.chord, keyPc, cursorCount: cur, prevMidi: lastMidi(), range: layer.range };
  const list = activeLayer === 'bass' ? suggestBassNotes(opts) : suggestMelodyNotes(opts);

  suggestCtxEl.textContent = chord
    ? `${layer.label}｜${cur + 1}拍目・いまのコードは ${chordDisplayName(chord.rootPc, chord.type, chord.tensions)}`
    : '';

  if (list.length === 0) {
    suggestGridEl.innerHTML = '<div class="cv2-suggest-empty">提案できる音が見つかりませんでした</div>';
    return;
  }
  list.forEach(s => {
    const card = document.createElement('button');
    card.className = `cv2-suggest-card ${ROLE_CLASS[s.role] ?? ''}`;
    card.innerHTML = `
      <span class="role">${s.label}</span>
      <span class="pitch">${s.doremi ?? s.noteName}<small>${s.noteName}</small></span>
      <span class="hint">${s.hint}</span>
      <span class="tagline">${s.isChordTone ? 'コードの音' : 'コード外の音'}</span>`;
    card.addEventListener('click', () => {
      const pc = ((s.midi % 12) + 12) % 12;
      addLayerNote(pc, Math.floor(s.midi / 12) - 1);
    });
    suggestGridEl.appendChild(card);
  });
}

// ============================================================
// STEP2: おまかせ生成
// ============================================================
autoMelBtn.addEventListener('click', autoGenerate);
function autoGenerate() {
  if (tl.chord.length === 0) { diagResult.textContent = 'さきにコードをならべてね'; return; }
  const layer = layerOf(activeLayer);
  if (activeLayer === 'bass') markBassManual();

  const notes = generateMelody({
    chords: tl.chord,
    keyPc,
    style: melStyle,
    range: layer.range
  });
  tl[activeLayer] = [];
  notes.forEach(n => addEvent(tl, activeLayer, n));
  sortTrack(tl, activeLayer);
  restPad[activeLayer] = 0;
  selected = null;
  renderAll();
}
clearMelBtn.addEventListener('click', () => {
  if (activeLayer === 'bass') markBassManual();
  tl[activeLayer] = [];
  restPad[activeLayer] = 0;
  if (selected?.track === activeLayer) selected = null;
  renderAll();
});

// ============================================================
// ピアノロール（描画）
// ============================================================
function computeRange() {
  let lo = Infinity, hi = -Infinity;
  ['chord', 'melody', 'bass'].forEach(t => tl[t].forEach(ev => {
    eventMidi(t, ev).forEach(m => { if (m < lo) lo = m; if (m > hi) hi = m; });
  }));
  if (lo === Infinity) { lo = 60; hi = 79; }        // 空ならC4〜G5
  lo -= 1; hi += 1;
  while (hi - lo < 16) { hi++; if (hi - lo < 16) lo--; } // 最低でも十数行は確保
  return { low: lo, high: hi };
}

function renderRoll() {
  curRange = computeRange();
  totalCounts = Math.max(8, Math.ceil(timelineEnd(tl)) + 2);
  const rows = curRange.high - curRange.low + 1;
  gridH = rows * ROW_H;
  const totalW = totalCounts * COUNT_W;

  // 左の音名ラベル（Cのみ表示）
  rollLabels.style.height = `${ROLL_HEADER + gridH}px`;
  let labelsHtml = '';
  for (let m = curRange.high; m >= curRange.low; m--) {
    if (m % 12 !== 0) continue;
    const top = ROLL_HEADER + (curRange.high - m) * ROW_H;
    labelsHtml += `<div class="cv2-roll-label" style="top:${top}px; height:${ROW_H}px; line-height:${ROW_H}px;">${midiDisplayName(m)}</div>`;
  }
  rollLabels.innerHTML = labelsHtml;

  // ビート番号
  rollBeatnums.style.width = `${totalW}px`;
  let bn = '';
  for (let c = 0; c < totalCounts; c++) bn += `<span class="cv2-roll-beatnum" style="left:${c * COUNT_W + COUNT_W / 2}px;">${c + 1}</span>`;
  rollBeatnums.innerHTML = bn;

  // コード帯（読み取り専用の色バンド＋度数/コード名）
  rollRegions.style.width = `${totalW}px`;
  let rg = '';
  [...tl.chord].sort((a, b) => a.startCount - b.startCount).forEach(ev => {
    const off = ((ev.rootPc - keyPc) % 12 + 12) % 12;
    rg += `<div class="cv2-roll-region" style="left:${ev.startCount * COUNT_W}px; width:${ev.lengthCount * COUNT_W - 2}px; background:${ROLL_BLOCK_COLOR[qClass(ev.type)]};">${degreeToRoman(off, ev.type)} ${chordDisplayName(ev.rootPc, ev.type, ev.tensions)}</div>`;
  });
  rollRegions.innerHTML = rg;

  // グリッド
  rollGrid.style.width = `${totalW}px`;
  rollGrid.style.height = `${gridH}px`;
  let g = '';
  // 行線（C行は少し濃く）
  for (let m = curRange.high; m >= curRange.low; m--) {
    const top = (curRange.high - m) * ROW_H;
    if (m % 12 === 0) g += `<div class="cv2-roll-rowfill" style="top:${top}px; height:${ROW_H}px;"></div>`;
    g += `<div class="cv2-roll-rowline" style="top:${top + ROW_H}px;"></div>`;
  }
  // 拍線
  for (let c = 0; c <= totalCounts; c++) g += `<div class="cv2-roll-beatline${c % 4 === 0 ? ' bar' : ''}" style="left:${c * COUNT_W}px;"></div>`;
  // コード構成音（薄い読み取り専用ブロック）
  [...tl.chord].sort((a, b) => a.startCount - b.startCount).forEach(ev => {
    const minq = MINOR_TYPES.has(ev.type) || DIM_TYPES.has(ev.type);
    eventMidi('chord', ev).forEach(m => {
      const top = rowTop(m);
      if (top === null) return;
      g += `<div class="cv2-roll-block chord${minq ? ' minq' : ''}" style="left:${ev.startCount * COUNT_W + 1}px; top:${top + 2}px; width:${ev.lengthCount * COUNT_W - 3}px; height:${ROW_H - 4}px; opacity:.28;"></div>`;
    });
  });
  // メロディ・ベース（アクティブなレイヤーだけ編集できる。非アクティブは薄く表示）
  ['bass', 'melody'].forEach(track => {
    const active = track === activeLayer;
    [...tl[track]].sort((a, b) => a.startCount - b.startCount).forEach(ev => {
      const m = eventMidi(track, ev)[0];
      const top = rowTop(m);
      if (top === null) return;
      const sel = selected?.track === track && selected.id === ev.id;
      g += `<div class="cv2-roll-note ${track}${active ? ' active' : ' dim'}${sel ? ' sel' : ''}"
             data-id="${ev.id}" data-track="${track}"
             style="left:${ev.startCount * COUNT_W + 1}px; top:${top + 1}px; width:${ev.lengthCount * COUNT_W - 3}px; height:${ROW_H - 2}px;">
             <span class="lab">${midiDisplayName(m)}</span>${active ? '<span class="handle"></span>' : ''}</div>`;
    });
  });
  rollGrid.innerHTML = g;

  // 再生ヘッド
  playheadEl = document.createElement('div');
  playheadEl.className = 'cv2-roll-playhead';
  playheadEl.style.display = 'none';
  playheadEl.style.height = `${gridH}px`;
  rollGrid.appendChild(playheadEl);
}
function rowTop(midi) {
  if (midi > curRange.high || midi < curRange.low) return null;
  return (curRange.high - midi) * ROW_H;
}

// 選択した音の操作行
function updateNoteSelRow() {
  const track = selected?.track;
  const ev = (track === 'melody' || track === 'bass') ? findEvent(tl, track, selected.id) : null;
  if (!ev) { melSelRow.style.display = 'none'; return; }
  melSelRow.style.display = 'flex';
  const m = eventMidi(track, ev)[0];
  melSelLabel.textContent = `${layerOf(track).label}の「${midiDisplayName(m)}」を`;
  noteLen.textContent = `⟷ 長さ（${ev.lengthCount}）`;
}
noteUp.addEventListener('click', () => editSelNote(ev => transposeEvent(ev, 1)));
noteDown.addEventListener('click', () => editSelNote(ev => transposeEvent(ev, -1)));
noteLen.addEventListener('click', () => editSelNote(ev => { ev.lengthCount = ({ 0.5: 1, 1: 2, 2: 4, 4: 0.5 })[ev.lengthCount] ?? 1; }));
noteDel.addEventListener('click', () => {
  const track = selected?.track;
  if (track !== 'melody' && track !== 'bass') return;
  if (track === 'bass') markBassManual();
  removeEvent(tl, track, selected.id);
  selected = null;
  renderAll();
});
function editSelNote(fn) {
  const track = selected?.track;
  if (track !== 'melody' && track !== 'bass') return;
  const ev = findEvent(tl, track, selected.id);
  if (!ev) return;
  if (track === 'bass') markBassManual();
  fn(ev);
  sortTrack(tl, track);
  renderAll();
  previewEvent(track, ev);
}

// ============================================================
// ピアノロール（操作: クリック追加・ドラッグ移動・右端リサイズ）
// ============================================================
function posToGrid(clientX, clientY, centerLen = 0) {
  const rect = rollGrid.getBoundingClientRect();
  const x = clientX - rect.left - (centerLen * COUNT_W) / 2;
  const y = clientY - rect.top;
  const count = Math.max(0, Math.round((x / COUNT_W) / SNAP) * SNAP);
  const rowIndex = Math.floor(y / ROW_H);
  const midi = curRange.high - rowIndex;
  return { count, midi, inGrid: y >= 0 && y <= gridH };
}

let drag = null;
rollGrid.addEventListener('pointerdown', (e) => {
  // 編集できるのはアクティブレイヤーの音だけ
  const noteEl = e.target.closest('.cv2-roll-note.active');
  if (noteEl) {
    e.preventDefault();
    const track = noteEl.dataset.track;
    const id = Number(noteEl.dataset.id);
    const ev = findEvent(tl, track, id);
    if (!ev) return;
    if (e.target.classList.contains('handle')) {
      drag = { mode: 'resize', track, id, x0: e.clientX, len0: ev.lengthCount, d: 0, moved: false };
    } else {
      drag = { mode: 'move', track, id, el: noteEl, x0: e.clientX, y0: e.clientY, dC: 0, dS: 0, moved: false };
    }
    rollGrid.setPointerCapture(e.pointerId);
    return;
  }
  const { count, midi, inGrid } = posToGrid(e.clientX, e.clientY, melLen);
  if (inGrid) {
    drag = { mode: 'add', track: activeLayer, x0: e.clientX, y0: e.clientY, count, midi, moved: false };
    rollGrid.setPointerCapture(e.pointerId);
  }
});
rollGrid.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.mode === 'move') {
    const dC = Math.round((e.clientX - drag.x0) / COUNT_W / SNAP) * SNAP;
    const dS = -Math.round((e.clientY - drag.y0) / ROW_H);
    if (dC === drag.dC && dS === drag.dS) return;
    drag.dC = dC; drag.dS = dS;
    if (dC !== 0 || dS !== 0) drag.moved = true;
    drag.el.style.transform = `translate(${dC * COUNT_W}px, ${-dS * ROW_H}px)`;
  } else if (drag.mode === 'resize') {
    const dC = Math.round((e.clientX - drag.x0) / COUNT_W / SNAP) * SNAP;
    if (dC === drag.d) return;
    drag.d = dC;
    if (dC !== 0) drag.moved = true;
    const el = rollGrid.querySelector(`.cv2-roll-note[data-id="${drag.id}"][data-track="${drag.track}"]`);
    if (el) el.style.width = `${Math.max(0.5, drag.len0 + dC) * COUNT_W - 3}px`;
  }
});
rollGrid.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  const track = d.track;
  if (track === 'bass' && d.mode !== 'add') markBassManual();

  if (d.mode === 'move') {
    const ev = findEvent(tl, track, d.id);
    if (ev && d.moved && (d.dC !== 0 || d.dS !== 0)) {
      moveEvent(ev, d.dC);
      if (d.dS !== 0) transposeEvent(ev, d.dS);
      sortTrack(tl, track);
    }
    selected = { track, id: d.id };
    renderAll();
    previewEvent(track, ev);
  } else if (d.mode === 'resize') {
    const ev = findEvent(tl, track, d.id);
    if (ev && d.moved && d.d !== 0) resizeEvent(ev, d.d);
    selected = { track, id: d.id };
    renderAll();
  } else if (d.mode === 'add') {
    if (!d.moved) {
      const pc = ((d.midi % 12) + 12) % 12;
      const octave = Math.floor(d.midi / 12) - 1;
      addLayerNote(pc, octave, d.count, melLen);
    }
  }
});
rollGrid.addEventListener('pointercancel', () => { drag = null; renderAll(); });

// Deleteキーで選択削除
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (!selected) return;
  e.preventDefault();
  if (selected.track === 'bass') markBassManual();
  removeEvent(tl, selected.track, selected.id);
  if (selected.track === 'chord') rebuildBass();
  selected = null;
  renderAll();
});

// ============================================================
// ヘッダー: キー移調
// ============================================================
function transposeAll(semi) {
  keyPc = ((keyPc + semi) % 12 + 12) % 12;
  tl.chord.forEach(ev => transposeEvent(ev, semi));
  tl.melody.forEach(ev => transposeEvent(ev, semi));
  // 自動モードのベースは rebuildBass で作り直されるので、手動のときだけ移調する
  if (bassMode === 'manual') tl.bass.forEach(ev => transposeEvent(ev, semi));
  rebuildBass();
  updateKeyLabel();
  renderAll();
}
/** ヘッダーのキー表示を更新し、音名の綴りの基準キーもそろえる */
function updateKeyLabel() {
  setDisplayKey(keyPc);
  keyName.textContent = pcName(keyPc, keyPc);
}
keyUp.addEventListener('click', () => transposeAll(1));
keyDown.addEventListener('click', () => transposeAll(-1));

// ============================================================
// フッター: 再生 / BPM / くりかえし / 音色
// ============================================================
function updatePlayBtn() {
  playBtn.textContent = isPlaying ? '■ とめる' : '▶ 再生';
  playBtn.classList.toggle('playing', isPlaying);
}
async function startPlay() {
  const tracks = toPlayableTracks(tl, TRACK_INSTRUMENTS());
  if (tracks.length === 0) return;
  await ensureAudio();
  isPlaying = true;
  updatePlayBtn();
  playTracks(tracks, {
    bpm: Number(bpmRange.value),
    ring: ringMode,
    // くりかえしのつなぎ目では、前の周の余韻を切らずに残す
    keepTails: looping,
    onCount: (c) => setPlayhead(c),
    onComplete: onPlayComplete
  });
  looping = false;
}
function onPlayComplete() {
  clearPlayhead();
  if (loopOn && isPlaying) { looping = true; startPlay(); }
  else { isPlaying = false; updatePlayBtn(); }
}
function stopPlay() { isPlaying = false; looping = false; stop(); clearPlayhead(); updatePlayBtn(); }
function setPlayhead(count) {
  if (!playheadEl) return;
  playheadEl.style.display = 'block';
  playheadEl.style.left = `${count * COUNT_W}px`;
}
function clearPlayhead() { if (playheadEl) playheadEl.style.display = 'none'; }

playBtn.addEventListener('click', () => { if (isPlaying) stopPlay(); else startPlay(); });
bpmRange.addEventListener('input', () => { bpmLabel.textContent = bpmRange.value; });
loopBtn.addEventListener('click', () => { loopOn = !loopOn; loopBtn.classList.toggle('on', loopOn); });

// 音の「のび」（余韻）。sample-player の release を切り替えて、音が短く刈られるのを防ぐ。
function buildRingTabs() {
  ringTabs.innerHTML = '';
  RING_MODES.forEach(r => {
    const b = document.createElement('button');
    b.className = (r.id === ringMode ? 'on' : '');
    b.textContent = r.label;
    b.title = `余韻 ${r.release} 秒`;
    b.addEventListener('click', () => { ringMode = r.id; buildRingTabs(); });
    ringTabs.appendChild(b);
  });
}

function buildInstTabs() {
  instTabs.innerHTML = '';
  INSTRUMENTS.forEach(ins => {
    const b = document.createElement('button');
    b.className = (ins.name === chordInstrument ? 'on' : '');
    b.textContent = ins.label;
    b.addEventListener('click', () => {
      chordInstrument = ins.name;
      buildInstTabs();
      loadInstrument(ins.name).catch(() => {});
    });
    instTabs.appendChild(b);
  });
}

// ============================================================
// まとめて描画
// ============================================================
/** STEP2 のうち、カーソル位置に連動する部分だけ描き直す */
function renderStep2() {
  buildLayerTabs();
  buildBassMode();
  buildDoremi();
  buildSuggest();
}
function renderAll() {
  updatePresetActive();
  buildCards();
  updateSelRow();
  buildChordSuggest();
  renderStep2();
  renderRoll();
  updateNoteSelRow();
}

// ---------- 初期化 ----------
buildPresets();
buildLenTabs();
buildStyleTabs();
updateStyleDesc();
buildInstTabs();
buildRingTabs();
buildLegend();
updateKeyLabel();
renderAll();

// 表記（♯/♭）が切り替わったら、音名を出している所を丸ごと描き直す
document.addEventListener('notationchange', () => { updateKeyLabel(); renderAll(); });

function buildLegend() {
  legendEl.innerHTML = `
    <span><span class="sw" style="background:var(--maj)"></span>コード</span>
    <span><span class="sw" style="background:var(--mel)"></span>メロディ</span>
    <span><span class="sw" style="background:var(--bass)"></span>ベース</span>`;
}

// compare.html から送られたプリセットを反映
const incoming = sessionStorage.getItem('composeIncomingPreset');
if (incoming) {
  try {
    const { presetId, keyPc: kp } = JSON.parse(incoming);
    keyPc = kp ?? 0;
    updateKeyLabel();
    loadPreset(presetId);
  } catch (_) { /* ignore */ }
  sessionStorage.removeItem('composeIncomingPreset');
}
