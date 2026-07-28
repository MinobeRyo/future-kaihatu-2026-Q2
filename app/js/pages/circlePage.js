// ========================================
// circlePage.js - 音楽の魔法陣（魔法陣.html）
// 描画は ui/magicCircle.js（旧MusicMagicCircle.jsの移植版）。
// このファイルはボタン配線と audioEngine の接続のみ。
// 旧版で未実装だった再生を実際に鳴るようにした。
// ========================================

import { NOTE_LETTERS, pcName, buildChord, chordDisplayName } from '../core/musicTheory.js';
import { initAudio, loadInstrument, playNow, playTracks, stop } from '../core/audioEngine.js';
import { PROGRESSION_PRESETS, presetToChords } from '../data/progressions.js';
import { MagicCircle } from '../ui/magicCircle.js';

// 和音ボタン → コード定義（旧: 単音/三和音/四和音/五和音）
const CHORD_MODES = {
  single: { type: 'none', tensions: [], suffix: '' },
  triad:  { type: 'major', tensions: [], suffix: '' },
  four:   { type: 'maj7', tensions: [], suffix: 'maj7' },
  five:   { type: 'maj7', tensions: ['9'], suffix: 'maj7(9)' }
};
let chordMode = 'single';

// --- 魔法陣の初期化 ---
const circle = new MagicCircle(document.getElementById('magicCircle'), {
  onRootSelect: () => {     // クリック選択・回転確定 → ラベル更新＋試聴
    updateChordLabel();
    playCurrentChord();
  },
  onRootChange: () => {     // 回転中 → ラベルだけ追従（音は確定時に鳴らす）
    updateChordLabel();
  }
});

function currentChordOpts() {
  const mode = CHORD_MODES[chordMode];
  return { rootPc: circle.getRoot(), type: mode.type, octave: 4, tensions: mode.tensions };
}

function updateChordLabel() {
  const mode = CHORD_MODES[chordMode];
  circle.setChordLabel(pcName(circle.getRoot()) + mode.suffix);
}
updateChordLabel();

// --- 音の準備 ---
let ready = false;
async function ensureAudio() {
  initAudio();
  if (!ready) { await loadInstrument('acoustic_grand_piano'); ready = true; }
}

async function playCurrentChord() {
  await ensureAudio();
  playNow(buildChord(currentChordOpts()).midi, { duration: 1.4 });
}

// --- 表示トグルボタン（旧実装と同じ3種） ---
function wireToggle(id, fn) {
  const btn = document.getElementById(id);
  btn.addEventListener('click', () => {
    const isOn = btn.classList.toggle('on');
    fn(isOn);
  });
}
wireToggle('btnCircle', (on) => circle.toggleCircleOfFifths(on));
wireToggle('btnScale', (on) => circle.toggleDiatonicScale(on));
wireToggle('btnTriangle', (on) => circle.toggleChordTriangle(on));

// --- 和音ボタン（排他選択） ---
const chordButtons = [
  ['btnChord1', 'single'],
  ['btnChord3', 'triad'],
  ['btnChord4', 'four'],
  ['btnChord5', 'five']
];
for (const [id, mode] of chordButtons) {
  document.getElementById(id).addEventListener('click', (e) => {
    chordButtons.forEach(([bid]) => document.getElementById(bid).classList.remove('on'));
    e.target.classList.add('on');
    chordMode = mode;
    updateChordLabel();
    playCurrentChord();
  });
}

// --- 選択中コードの再生 ---
document.getElementById('btnPlay').addEventListener('click', playCurrentChord);

// --- 進行再生＋連動ハイライト ---
const presetSelect = document.getElementById('presetSelect');
const playProgBtn = document.getElementById('playProgBtn');
const stopBtn = document.getElementById('stopBtn');
const currentChordEl = document.getElementById('currentChord');

PROGRESSION_PRESETS.forEach(p =>
  presetSelect.appendChild(new Option(`${p.name}（${p.romanLabel}）`, p.id)));

playProgBtn.addEventListener('click', async () => {
  const preset = PROGRESSION_PRESETS.find(p => p.id === presetSelect.value);
  if (!preset) return;
  await ensureAudio();
  const chords = presetToChords(preset, 0);
  const events = chords.map((c, i) => ({
    midi: buildChord({ ...c, octave: 4 }).midi,
    startCount: i * 2,
    lengthCount: 1.8
  }));
  playTracks([{ instrument: 'acoustic_grand_piano', events }], {
    bpm: 100,
    onCount: (count) => {
      const idx = Math.min(chords.length - 1, Math.floor(count / 2));
      circle.setRoot(chords[idx].rootPc);
      updateChordLabel();
      currentChordEl.textContent = `再生中: ${chordDisplayName(chords[idx].rootPc, chords[idx].type)}`;
    },
    onComplete: () => { currentChordEl.textContent = '再生終了'; }
  });
});

stopBtn.addEventListener('click', () => {
  stop();
  currentChordEl.textContent = '';
});

// 音名表記（♯/♭）が切り替わったら、円周の音名とコード名を描き直す
document.addEventListener('notationchange', () => {
  circle.draw?.();
  updateChordLabel();
});
