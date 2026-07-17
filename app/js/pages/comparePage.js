// ========================================
// comparePage.js - 進行聴き比べ（新規ページ・①-3）簡易実装版
// 2つの進行を同じキー・BPMでループ再生し、ワンタップで切り替える。
// 「テンポを止めずに」は簡易実装では次ループ開始時に切り替える方式にしている。
// ========================================

import { NOTE_LETTERS, buildChord, chordDisplayName } from '../core/musicTheory.js';
import { initAudio, loadInstrument, playTracks, stop } from '../core/audioEngine.js';
import { PROGRESSION_PRESETS, presetToChords } from '../data/progressions.js';
import { songsForPattern } from '../data/songs.js';

const presetASelect = document.getElementById('presetA');
const presetBSelect = document.getElementById('presetB');
const keySelect = document.getElementById('keySelect');
const bpmRange = document.getElementById('bpmRange');
const bpmLabel = document.getElementById('bpmLabel');
const loopBtn = document.getElementById('loopBtn');
const stopBtn = document.getElementById('stopBtn');
const switchBtn = document.getElementById('switchBtn');
const activeLabel = document.getElementById('activeLabel');
const cardA = document.getElementById('cardA');
const cardB = document.getElementById('cardB');

NOTE_LETTERS.forEach((n, i) => keySelect.appendChild(new Option(n, i)));
PROGRESSION_PRESETS.forEach(p => {
  presetASelect.appendChild(new Option(`${p.name}（${p.romanLabel}）`, p.id));
  presetBSelect.appendChild(new Option(`${p.name}（${p.romanLabel}）`, p.id));
});
presetASelect.value = 'oudou';
presetBSelect.value = 'komuro';

let activeSide = 'A';
let looping = false;

function buildCard(el, presetId, keyPc, diffSet) {
  const preset = PROGRESSION_PRESETS.find(p => p.id === presetId);
  const chords = presetToChords(preset, keyPc);
  const songs = songsForPattern(presetId);
  el.innerHTML = `
    <h3>${preset.name} <span class="tag">${preset.romanLabel}</span></h3>
    <p class="mood">${preset.mood}</p>
    <div class="timeline">
      ${chords.map((c, i) => `<div class="chord-block${['minor', 'm7', 'dim'].includes(c.type) ? ' minor-q' : ''}${diffSet.has(i) ? ' diff' : ''}">
        <span class="idx">${i + 1}</span>${chordDisplayName(c.rootPc, c.type)}
      </div>`).join('')}
    </div>
    <ul class="song-list">${songs.map(s => `<li>${s.title} / ${s.artist}</li>`).join('') || '<li>（収録準備中）</li>'}</ul>
    <button class="small openComposeBtn">この進行を作曲モードで開く</button>
  `;
  el.querySelector('.openComposeBtn').addEventListener('click', () => {
    sessionStorage.setItem('composeIncomingPreset', JSON.stringify({ presetId, keyPc }));
    window.location.href = 'compose.html';
  });
  return chords;
}

function diffIndices(chordsA, chordsB) {
  const len = Math.min(chordsA.length, chordsB.length);
  const diff = new Set();
  for (let i = 0; i < len; i++) {
    if (chordsA[i].rootPc !== chordsB[i].rootPc || chordsA[i].type !== chordsB[i].type) diff.add(i);
  }
  return diff;
}

let chordsA = [], chordsB = [];
function renderBoth() {
  const keyPc = Number(keySelect.value);
  const rawA = presetToChords(PROGRESSION_PRESETS.find(p => p.id === presetASelect.value), keyPc);
  const rawB = presetToChords(PROGRESSION_PRESETS.find(p => p.id === presetBSelect.value), keyPc);
  const diff = diffIndices(rawA, rawB);
  chordsA = buildCard(cardA, presetASelect.value, keyPc, diff);
  chordsB = buildCard(cardB, presetBSelect.value, keyPc, diff);
}
[presetASelect, presetBSelect, keySelect].forEach(el => el.addEventListener('change', renderBoth));
renderBoth();

let ready = false;
async function ensureAudio() {
  initAudio();
  if (!ready) { await loadInstrument('acoustic_grand_piano'); ready = true; }
}

function playActiveLoop() {
  const chords = activeSide === 'A' ? chordsA : chordsB;
  activeLabel.textContent = `再生中: ${activeSide === 'A' ? 'A' : 'B'}`;
  const events = chords.map((c, i) => ({
    midi: buildChord(c).midi,
    startCount: i * 2,
    lengthCount: 1.8
  }));
  playTracks([{ instrument: 'acoustic_grand_piano', events }], {
    bpm: Number(bpmRange.value),
    onComplete: () => { if (looping) playActiveLoop(); }
  });
}

loopBtn.addEventListener('click', async () => {
  await ensureAudio();
  looping = true;
  playActiveLoop();
});

stopBtn.addEventListener('click', () => {
  looping = false;
  stop();
  activeLabel.textContent = '';
});

switchBtn.addEventListener('click', () => {
  activeSide = activeSide === 'A' ? 'B' : 'A';
  if (looping) playActiveLoop();
  else activeLabel.textContent = `選択中: ${activeSide}`;
});

bpmRange.addEventListener('input', () => { bpmLabel.textContent = bpmRange.value; });
