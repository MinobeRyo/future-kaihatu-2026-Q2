// ========================================
// composePage.js - 作曲モード（compose.html）
// 左パネル（トラック切替・追加操作）＋右ピアノロールの2カラム版。
// 状態は core/timeline.js、描画は ui/pianoRoll.js。このファイルは配線のみ。
// ========================================

import { NOTE_LETTERS, chordDisplayName, midiToNoteName, pcToMidi } from '../core/musicTheory.js';
import { initAudio, loadInstrument, playNow, playTracks, stop } from '../core/audioEngine.js';
import { PROGRESSION_PRESETS, presetToChords } from '../data/progressions.js';
import { findSimilarProgressions, matchMessage } from '../data/songs.js';
import {
  createTimeline, addEvent, eventMidi, moveEvent, transposeEvent, resizeEvent, trimStart,
  findEvent, removeEvent, sortTrack, withId,
  toPlayableTracks, TRACK_LABELS, DEFAULT_OCTAVE
} from '../core/timeline.js';
import { createPianoRoll } from '../ui/pianoRoll.js';
import { createKeyboard } from '../ui/keyboard.js';

// --- DOM ---
const presetSelect = document.getElementById('presetSelect');
const keySelect = document.getElementById('keySelect');
const loadPresetBtn = document.getElementById('loadPresetBtn');
const trackChips = document.querySelectorAll('.track-chip');
const chordFields = document.getElementById('chordFields');
const noteFields = document.getElementById('noteFields');
const typeSelect = document.getElementById('typeSelect');
const rootKeyboardEl = document.getElementById('rootKeyboard');
const rootLabelEl = document.getElementById('rootLabel');
const noteKeyboardEl = document.getElementById('noteKeyboard');
const noteLabelEl = document.getElementById('noteLabel');
const noteOctDownBtn = document.getElementById('noteOctDown');
const noteOctUpBtn = document.getElementById('noteOctUp');
const noteOctLabelEl = document.getElementById('noteOctLabel');
const lenSelect = document.getElementById('lenSelect');
const addBtn = document.getElementById('addBtn');
const clearBtn = document.getElementById('clearBtn');
const playAllBtn = document.getElementById('playAllBtn');
const stopBtn = document.getElementById('stopBtn');
const bpmRange = document.getElementById('bpmRange');
const bpmLabel = document.getElementById('bpmLabel');
const instrumentSelect = document.getElementById('instrumentSelect');
const rollEl = document.getElementById('pianoRoll');
const progressionLabel = document.getElementById('progressionLabel');
const selInfo = document.getElementById('selInfo');
const deleteBtn = document.getElementById('deleteBtn');
const matchBtn = document.getElementById('matchBtn');
const matchResultEl = document.getElementById('matchResult');

// --- セレクトの初期化 ---
NOTE_LETTERS.forEach((n, i) => {
  keySelect.appendChild(new Option(n, i));
});
['major', 'minor', '7', 'maj7', 'm7', 'm7b5', 'mmaj7', 'sus4', 'sus2', '7sus4', 'dim', 'dim7', 'aug'].forEach(t =>
  typeSelect.appendChild(new Option(t, t)));
PROGRESSION_PRESETS.forEach(p =>
  presetSelect.appendChild(new Option(`${p.name}（${p.romanLabel}）`, p.id)));

// --- ルート/音の鍵盤ピッカー（ドロップダウンの代わりにタップで選ぶ） ---
let chordRootPc = 0;
let notePc = 0;
let noteOctave = DEFAULT_OCTAVE.melody;

const rootKb = createKeyboard(rootKeyboardEl, { startOctave: 4, octaves: 1 });
rootKb.highlight([pcToMidi(chordRootPc, 4)]);
rootKeyboardEl.addEventListener('click', (e) => {
  const key = e.target.closest('.key');
  if (!key) return;
  const midi = Number(key.dataset.midi);
  chordRootPc = ((midi % 12) + 12) % 12;
  rootKb.highlight([midi]);
  rootLabelEl.textContent = NOTE_LETTERS[chordRootPc];
  previewMidi([midi], instrumentSelect.value);
});

let noteKb = null;
function renderNoteKeyboard() {
  noteKb = createKeyboard(noteKeyboardEl, { startOctave: noteOctave, octaves: 1 });
  noteOctLabelEl.textContent = `オクターブ${noteOctave}`;
}
noteKeyboardEl.addEventListener('click', (e) => {
  const key = e.target.closest('.key');
  if (!key) return;
  const midi = Number(key.dataset.midi);
  notePc = ((midi % 12) + 12) % 12;
  noteOctave = Math.floor(midi / 12) - 1;
  noteKb.highlight([midi]);
  noteLabelEl.textContent = midiToNoteName(midi);
  previewMidi([midi], 'acoustic_grand_piano');
});
noteOctDownBtn.addEventListener('click', () => {
  noteOctave = Math.max(1, noteOctave - 1);
  renderNoteKeyboard();
});
noteOctUpBtn.addEventListener('click', () => {
  noteOctave = Math.min(6, noteOctave + 1);
  renderNoteKeyboard();
});
renderNoteKeyboard();

// --- トラック切替チップ ---
let addTrack = 'chord';
function updateGhostSpec() {
  roll.setGhostSpec({ lengthCount: Number(lenSelect.value), trackClass: `t-${addTrack}` });
}
function setAddTrack(track) {
  addTrack = track;
  trackChips.forEach(chip => chip.classList.toggle('on', chip.dataset.track === track));
  chordFields.classList.toggle('active', track === 'chord');
  noteFields.classList.toggle('active', track !== 'chord');
  if (track !== 'chord') {
    noteOctave = DEFAULT_OCTAVE[track];
    renderNoteKeyboard();
  }
  lenSelect.value = track === 'chord' ? '2' : '1';
  updateGhostSpec();
}
trackChips.forEach(chip => {
  chip.addEventListener('click', () => setAddTrack(chip.dataset.track));
});
lenSelect.addEventListener('change', updateGhostSpec);

// --- 状態 ---
let tl = createTimeline();
let selected = null; // { track, id }

const TRACK_INSTRUMENTS = () => ({
  chord: instrumentSelect.value,
  melody: 'acoustic_grand_piano',
  bass: 'acoustic_bass'
});

// --- ピアノロール ---
function parseRef(ref) {
  const [track, idStr] = ref.split(':');
  return { track, id: Number(idStr) };
}

const roll = createPianoRoll(rollEl, {
  onSelect(ref) {
    const { track, id } = parseRef(ref);
    selected = { track, id };
    roll.setSelected(ref);
    updateSelInfo();
    previewEvent(track, findEvent(tl, track, id));
  },
  onCommit(ref, dCount, dSemi) {
    const { track, id } = parseRef(ref);
    const ev = findEvent(tl, track, id);
    if (!ev) return;
    moveEvent(ev, dCount);
    if (dSemi !== 0) transposeEvent(ev, dSemi);
    sortTrack(tl, track);
    selected = { track, id };
    render();
    updateSelInfo();
    previewEvent(track, ev);
  },
  onResize(ref, dCount) {
    const { track, id } = parseRef(ref);
    const ev = findEvent(tl, track, id);
    if (!ev) return;
    resizeEvent(ev, dCount);
    selected = { track, id };
    render();
    updateSelInfo();
  },
  onResizeLeft(ref, dCount) {
    const { track, id } = parseRef(ref);
    const ev = findEvent(tl, track, id);
    if (!ev) return;
    trimStart(ev, dCount);
    sortTrack(tl, track);
    selected = { track, id };
    render();
    updateSelInfo();
  },
  onAddAt(count, midi) {
    const pc = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const opts = {
      rootPc: pc,
      octave,
      startCount: count,
      lengthCount: Number(lenSelect.value)
    };
    if (addTrack === 'chord') opts.type = typeSelect.value;
    const ev = addEvent(tl, addTrack, opts);
    sortTrack(tl, addTrack);
    selected = { track: addTrack, id: ev.id };
    render();
    updateSelInfo();
    previewEvent(addTrack, ev);
  }
});
updateGhostSpec();

function eventLabel(track, ev) {
  return track === 'chord'
    ? chordDisplayName(ev.rootPc, ev.type)
    : midiToNoteName(eventMidi(track, ev)[0]);
}

function updateSelInfo() {
  const ev = selected ? findEvent(tl, selected.track, selected.id) : null;
  if (!ev) {
    selInfo.textContent = 'ブロックをクリックで選択、中央をドラッグで移動（横=タイミング、縦=音の高さ）、左右端のドラッグ/ホイールで長さ変更';
    deleteBtn.disabled = true;
    return;
  }
  selInfo.textContent =
    `選択中: ${eventLabel(selected.track, ev)}（${TRACK_LABELS[selected.track]}・${ev.startCount + 1}カウント目〜・長さ${ev.lengthCount}）`;
  deleteBtn.disabled = false;
}

function render() {
  // 常に左（開始位置が早い順）から並べて表示・判定する。追加/操作した順序には依存しない。
  const chords = [...tl.chord].sort((a, b) => a.startCount - b.startCount);
  progressionLabel.textContent = chords.length
    ? chords.map(c => chordDisplayName(c.rootPc, c.type)).join(' → ')
    : '（まだコードがありません。プリセットを読み込むか、ピアノロールをクリックして追加してください）';
  roll.render(tl);
  roll.setSelected(selected ? `${selected.track}:${selected.id}` : null);
}
render();
updateSelInfo();

// --- 音の準備・試聴 ---
let pianoReady = false;
async function ensureAudio() {
  initAudio();
  if (!pianoReady) {
    await loadInstrument('acoustic_grand_piano');
    pianoReady = true;
  }
  const needed = new Set(Object.values(TRACK_INSTRUMENTS()));
  await Promise.all([...needed].map(n => loadInstrument(n)));
}

async function previewEvent(track, ev) {
  if (!ev) return;
  await ensureAudio();
  playNow(eventMidi(track, ev), { duration: 1.0, instrument: TRACK_INSTRUMENTS()[track] });
}

async function previewMidi(midis, instrument) {
  await ensureAudio();
  await loadInstrument(instrument);
  playNow(midis, { duration: 0.8, instrument });
}

// --- 操作: プリセット読み込み（コードトラックのみ置き換え） ---
loadPresetBtn.addEventListener('click', () => {
  const preset = PROGRESSION_PRESETS.find(p => p.id === presetSelect.value);
  if (!preset) return;
  tl.chord = presetToChords(preset, Number(keySelect.value)).map((c, i) =>
    withId({ ...c, octave: 4, startCount: i * 2, lengthCount: 2 }));
  sortTrack(tl, 'chord');
  selected = null;
  render();
  updateSelInfo();
  matchResultEl.textContent = '';
});

// --- 操作: 末尾に追加（左パネルのボタン） ---
addBtn.addEventListener('click', () => {
  const opts = { lengthCount: Number(lenSelect.value) };
  if (addTrack === 'chord') {
    opts.rootPc = chordRootPc;
    opts.type = typeSelect.value;
  } else {
    opts.rootPc = notePc;
    opts.octave = noteOctave;
  }
  const ev = addEvent(tl, addTrack, opts);
  sortTrack(tl, addTrack);
  selected = { track: addTrack, id: ev.id };
  render();
  updateSelInfo();
  previewEvent(addTrack, ev);
});

// --- 操作: 削除・全消去 ---
function deleteSelected() {
  if (!selected || !findEvent(tl, selected.track, selected.id)) return;
  removeEvent(tl, selected.track, selected.id);
  selected = null;
  render();
  updateSelInfo();
}
deleteBtn.addEventListener('click', deleteSelected);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  deleteSelected();
});

clearBtn.addEventListener('click', () => {
  tl = createTimeline();
  selected = null;
  render();
  updateSelInfo();
  matchResultEl.textContent = '';
});

// --- 再生（3トラック同時） ---
bpmRange.addEventListener('input', () => { bpmLabel.textContent = bpmRange.value; });

playAllBtn.addEventListener('click', async () => {
  const tracks = toPlayableTracks(tl, TRACK_INSTRUMENTS());
  if (tracks.length === 0) return;
  await ensureAudio();
  playTracks(tracks, {
    bpm: Number(bpmRange.value),
    onCount: (count) => roll.setPlayhead(count),
    onComplete: () => roll.clearPlayhead()
  });
});

stopBtn.addEventListener('click', () => {
  stop();
  roll.clearPlayhead();
});

// --- 逆引き検索（コードトラックが対象） ---
matchBtn.addEventListener('click', () => {
  const chords = [...tl.chord].sort((a, b) => a.startCount - b.startCount);
  if (chords.length === 0) { matchResultEl.textContent = 'コードトラックが空です。'; return; }
  const results = findSimilarProgressions(chords);
  matchResultEl.textContent = results.length > 0 ? matchMessage(results[0]) : matchMessage(null);
});

// --- compare.html から送られたプリセットを反映 ---
const incoming = sessionStorage.getItem('composeIncomingPreset');
if (incoming) {
  try {
    const { presetId, keyPc } = JSON.parse(incoming);
    const preset = PROGRESSION_PRESETS.find(p => p.id === presetId);
    if (preset) {
      presetSelect.value = presetId;
      keySelect.value = keyPc;
      tl.chord = presetToChords(preset, keyPc).map((c, i) =>
        withId({ ...c, octave: 4, startCount: i * 2, lengthCount: 2 }));
      sortTrack(tl, 'chord');
      render();
    }
  } catch (_) { /* ignore */ }
  sessionStorage.removeItem('composeIncomingPreset');
}
