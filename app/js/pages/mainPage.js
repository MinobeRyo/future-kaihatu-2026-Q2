// ========================================
// mainPage.js - 練習モード（index.html）のUIロジック
// core/musicTheory・core/audioEngine・data/captions を呼ぶだけの薄い層。
// バグ修正:
//   - 鍵盤がC4〜B5固定だったため、オクターブ3や高いテンション（13th等）の音が
//     鍵盤の外に出て表示されなくなっていた → 選択オクターブから3オクターブ分を描画
//   - 「A: 元のコード」のハイライトが押した後もずっと残っていた
//     → 試聴が終わったら現在の設定表示に自動で戻す
// ========================================

import {
  NOTE_LETTERS, CHORD_INTERVALS, CHORD_TYPE_LABELS, TENSIONS,
  buildChord, chordDisplayName
} from '../core/musicTheory.js';
import { initAudio, loadInstrument, playNow } from '../core/audioEngine.js';
import { tensionCaption, VOICING_CAPTIONS, complexityLevel } from '../data/captions.js';

const rootSelect = document.getElementById('rootSelect');
const typeSelect = document.getElementById('typeSelect');
const voicingSelect = document.getElementById('voicingSelect');
const octaveSelect = document.getElementById('octaveSelect');
const tensionButtons = document.getElementById('tensionButtons');
const playBtn = document.getElementById('playBtn');
const arpBtn = document.getElementById('arpBtn');
const abOrigBtn = document.getElementById('abOrigBtn');
const abTensionBtn = document.getElementById('abTensionBtn');
const keyboardEl = document.getElementById('keyboard');
const captionEl = document.getElementById('caption');
const complexityEl = document.getElementById('complexityMeter');
const chordNameEl = document.getElementById('chordName');

// 選択中ルート
NOTE_LETTERS.forEach((n, i) => {
  const opt = document.createElement('option');
  opt.value = i; opt.textContent = n;
  if (i === 0) opt.selected = true;
  rootSelect.appendChild(opt);
});

Object.keys(CHORD_INTERVALS).filter(t => t !== 'none').forEach(t => {
  const opt = document.createElement('option');
  opt.value = t; opt.textContent = `${CHORD_TYPE_LABELS[t] || t}（${t}）`;
  typeSelect.appendChild(opt);
});
typeSelect.value = 'major';

const activeTensions = new Set();
Object.entries(TENSIONS).forEach(([key, def]) => {
  const btn = document.createElement('button');
  btn.className = 'toggle small';
  btn.textContent = `${def.label}`;
  btn.title = def.feel;
  btn.addEventListener('click', () => {
    if (activeTensions.has(key)) { activeTensions.delete(key); btn.classList.remove('on'); }
    else { activeTensions.add(key); btn.classList.add('on'); }
    setCaption(activeTensions.has(key)
      ? tensionCaption(key)
      : `${def.label}を外しました。元の響きと聴き比べてみましょう。`);
    render();
  });
  tensionButtons.appendChild(btn);
});

// --- 鍵盤描画 ---
// 選択オクターブを起点に3オクターブ分を描画する。
// （13thはルート+21半音なので、2オクターブだと表示しきれないことがある）
const OCTAVES = 3;
function renderKeyboardBase(startOctave) {
  keyboardEl.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'keyboard-inner';

  const whitePattern = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B のピッチクラス
  const blackAfter = new Set([0, 1, 3, 4, 5]); // white index → 直後に黒鍵がある
  let whiteIndex = 0;
  for (let o = 0; o < OCTAVES; o++) {
    whitePattern.forEach((pc, i) => {
      const midi = 12 * (startOctave + o + 1) + pc;
      const div = document.createElement('div');
      div.className = 'key white';
      div.style.left = `${whiteIndex * 40}px`;
      div.dataset.midi = midi;
      inner.appendChild(div);
      if (blackAfter.has(i)) {
        const bDiv = document.createElement('div');
        bDiv.className = 'key black';
        bDiv.style.left = `${(whiteIndex + 1) * 40 - 13}px`;
        bDiv.dataset.midi = midi + 1;
        inner.appendChild(bDiv);
      }
      whiteIndex++;
    });
  }
  inner.style.width = `${whiteIndex * 40}px`;
  keyboardEl.appendChild(inner);
}
renderKeyboardBase(Number(octaveSelect.value));

function highlightKeyboard(chord) {
  keyboardEl.querySelectorAll('.key').forEach(k => {
    k.classList.remove('chord-tone', 'tension-tone');
  });
  const tensionSet = new Set(chord.addedByTension);
  chord.midi.forEach(m => {
    const el = keyboardEl.querySelector(`.key[data-midi="${m}"]`);
    if (!el) return;
    el.classList.add(tensionSet.has(m) ? 'tension-tone' : 'chord-tone');
  });
}

function currentChordOpts() {
  return {
    rootPc: Number(rootSelect.value),
    type: typeSelect.value,
    octave: Number(octaveSelect.value),
    voicing: voicingSelect.value,
    tensions: Array.from(activeTensions)
  };
}

function setCaption(html) {
  captionEl.innerHTML = `${html} <a class="more" href="learn.html">もっと詳しく →</a>`;
}

function render() {
  const opts = currentChordOpts();
  const chord = buildChord(opts);
  highlightKeyboard(chord);
  chordNameEl.textContent = chordDisplayName(opts.rootPc, opts.type, opts.tensions);

  const level = complexityLevel(chord.midi.length);
  complexityEl.innerHTML = `<span>響きの複雑さ: ${level.label}</span>` +
    Array.from({ length: 4 }, (_, i) =>
      `<span class="dot${i < level.level ? ' filled' : ''}"></span>`).join('');

  if (activeTensions.size === 0) {
    setCaption(VOICING_CAPTIONS[opts.voicing] ?? '');
  }
  return chord;
}

[rootSelect, typeSelect, voicingSelect].forEach(el =>
  el.addEventListener('change', render));

// オクターブ変更時は鍵盤の描画範囲ごと作り直す
octaveSelect.addEventListener('change', () => {
  renderKeyboardBase(Number(octaveSelect.value));
  render();
});

let ready = false;
async function ensureAudio() {
  initAudio();
  if (!ready) {
    playBtn.textContent = '読み込み中…';
    await loadInstrument('acoustic_grand_piano');
    ready = true;
    playBtn.textContent = '弾く ▶';
  }
}

playBtn.addEventListener('click', async () => {
  await ensureAudio();
  const chord = render();
  playNow(chord.midi, { duration: 1.5 });
});

arpBtn.addEventListener('click', async () => {
  await ensureAudio();
  const chord = render();
  // ① 1音ずつ積む再生 → 最後に全音同時
  chord.midi.forEach((m, i) => {
    setTimeout(() => playNow([m], { duration: 0.6 }), i * 300);
  });
  setTimeout(() => playNow(chord.midi, { duration: 1.5 }), chord.midi.length * 300 + 150);
});

// A/B試聴: 一時的に元のコードを表示・再生し、終わったら現在の設定表示へ自動で戻す
// （以前は押した後のハイライトが残り続け、表示とボタン状態がずれていた）
let abRestoreTimer = null;
abOrigBtn.addEventListener('click', async () => {
  await ensureAudio();
  const opts = currentChordOpts();
  const orig = buildChord({ ...opts, tensions: [] });
  highlightKeyboard(orig);
  chordNameEl.textContent = chordDisplayName(opts.rootPc, opts.type);
  playNow(orig.midi, { duration: 1.3 });
  setCaption('テンションを外した「元のコード」です。');
  clearTimeout(abRestoreTimer);
  abRestoreTimer = setTimeout(render, 1400);
});

abTensionBtn.addEventListener('click', async () => {
  await ensureAudio();
  clearTimeout(abRestoreTimer);
  const chord = render();
  playNow(chord.midi, { duration: 1.3 });
  if (activeTensions.size > 0) {
    const feels = Array.from(activeTensions).map(k => TENSIONS[k].feel).join(' / ');
    setCaption(`テンション追加後: ${feels}`);
  } else {
    setCaption('テンションを追加すると、ここでA/B聴き比べができます。');
  }
});

render();
