// ========================================
// learnPage.js - 解説モード（learn.html）簡易実装版
// ========================================

import { CHORD_INTERVALS, CHORD_TYPE_LABELS, TENSIONS, buildChord, chordDisplayName } from '../core/musicTheory.js';
import { initAudio, loadInstrument, playNow } from '../core/audioEngine.js';
import { PROGRESSION_PRESETS, presetToChords } from '../data/progressions.js';
import { songsForPattern } from '../data/songs.js';

const CHORD_DESCRIPTIONS = {
  major: '明るく安定した響き。多くの曲の基本になるコード。',
  minor: '切ない・落ち着いた響き。メジャーの3度を半音下げたもの。',
  '7': 'ブルージーで少し緊張感のある響き。次のコードに進みたくなる。',
  maj7: 'おしゃれで浮遊感のある響き。メジャーに長7度を足したもの。',
  m7: 'マイナーより少し柔らかい、こなれた響き。',
  m7b5: 'ハーフディミニッシュ。m7の5度を半音下げた、切なく緊張感のある響き。マイナーキーのツーファイブ（IIm7♭5→V7）でよく使われる。',
  mmaj7: 'マイナーメジャーセブンス。切ないマイナーに鋭い長7度が乗る、ドラマチックで映画音楽的な響き。',
  sus2: '3度を2度に置き換えた、透明で澄んだ響き。sus4の兄弟分。',
  '7sus4': '7thとsus4を合わせた、おおらかで解決を待つ響き。V7の代わりによく使われる。',
  dim7: 'フルディミニッシュ。全部を短3度で積んだ、ミステリアスで強い緊張感。半音上のコードへの橋渡しによく使われる。',
  sus4: '3度を4度に置き換えた、宙ぶらりんな響き。メジャーに解決したくなる。',
  dim: '不安定で緊張感の強い響き。半音ずつの積み重ね。',
  aug: '浮遊感・不思議な響き。3度を積み上げた対称的な構造。'
};

const chordTypeList = document.getElementById('chordTypeList');
const tensionTable = document.getElementById('tensionTableBody');
const progressionList = document.getElementById('progressionList');

let ready = false;
async function ensureAudio() {
  initAudio();
  if (!ready) { await loadInstrument('acoustic_grand_piano'); ready = true; }
}

// --- コードタイプ一覧 ---
Object.keys(CHORD_INTERVALS).filter(t => t !== 'none').forEach(type => {
  const row = document.createElement('div');
  row.className = 'progression-card';
  row.innerHTML = `
    <h3>C${CHORD_TYPE_LABELS[type] || ''} <span class="tag">${type}</span></h3>
    <p class="mood">${CHORD_DESCRIPTIONS[type] ?? ''}</p>
    <button class="small">試聴 ▶</button>
  `;
  row.querySelector('button').addEventListener('click', async () => {
    await ensureAudio();
    playNow(buildChord({ rootPc: 0, type }).midi, { duration: 1.4 });
  });
  chordTypeList.appendChild(row);
});

// --- テンション一覧（表） ---
Object.entries(TENSIONS).forEach(([key, def]) => {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${def.label}</td><td>${def.feel}</td><td></td>`;
  const btn = document.createElement('button');
  btn.className = 'small';
  btn.textContent = '試聴 ▶';
  btn.addEventListener('click', async () => {
    await ensureAudio();
    playNow(buildChord({ rootPc: 0, type: 'major', tensions: [key] }).midi, { duration: 1.5 });
  });
  tr.lastElementChild.appendChild(btn);
  tensionTable.appendChild(tr);
});

// --- 進行プリセット一覧 ---
PROGRESSION_PRESETS.forEach(preset => {
  const card = document.createElement('div');
  card.className = 'progression-card';
  const songs = songsForPattern(preset.id);
  card.innerHTML = `
    <h3>${preset.name} <span class="tag">${preset.romanLabel}</span></h3>
    <p class="mood">${preset.mood}</p>
    <div class="row">${preset.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
    <div class="row" style="margin-top:8px;">
      <button class="small playBtn">進行を試聴 ▶</button>
      <a href="compose.html"><button class="small" type="button">作曲モードで開く</button></a>
    </div>
    <p style="margin:10px 0 2px; color:var(--muted); font-size:13px;">この進行が使われていると紹介される楽曲（学習用の参考情報。音源・歌詞は使用していません）:</p>
    <ul class="song-list">
      ${songs.map(s => `<li>${s.title} / ${s.artist}${s.verified ? '' : '（未検証）'}</li>`).join('') || '<li>（収録準備中）</li>'}
    </ul>
  `;
  card.querySelector('.playBtn').addEventListener('click', async () => {
    await ensureAudio();
    const chords = presetToChords(preset, 0);
    chords.forEach((c, i) => {
      setTimeout(() => playNow(buildChord(c).midi, { duration: 1.1 }), i * 900);
    });
  });
  card.querySelector('a').addEventListener('click', () => {
    sessionStorage.setItem('composeIncomingPreset', JSON.stringify({ presetId: preset.id, keyPc: 0 }));
  });
  progressionList.appendChild(card);
});
