// ========================================
// tutorialPage.js - 入門チュートリアル（tutorial.html）
// 「音の後に言葉」: 各STEPのデモを鳴らし、鍵盤で光らせてから解説を読ませる。
// 描画は ui/keyboard.js、音は core/audioEngine.js。
// ========================================

import { NOTE_LETTERS, midiToNoteName } from '../core/musicTheory.js';
import { initAudio, loadInstrument, playNow } from '../core/audioEngine.js';
import { createKeyboard } from '../ui/keyboard.js';

// --- 鍵盤（STEPごとに1つ） ---
const kb1 = createKeyboard(document.getElementById('kb1'), { startOctave: 4, octaves: 1 });
const kb2 = createKeyboard(document.getElementById('kb2'), { startOctave: 4, octaves: 2 });
const kb3 = createKeyboard(document.getElementById('kb3'), { startOctave: 4, octaves: 1 });
const kb4 = createKeyboard(document.getElementById('kb4'), { startOctave: 4, octaves: 2 });
const kb5 = createKeyboard(document.getElementById('kb5'), { startOctave: 4, octaves: 1 });
const kb6 = createKeyboard(document.getElementById('kb6'), { startOctave: 3, octaves: 2 });

// --- 音の準備 ---
let ready = false;
async function ensureAudio() {
  initAudio();
  if (!ready) { await loadInstrument('acoustic_grand_piano'); ready = true; }
}

// デモ再生ヘルパー: [{ midi, at(ms), dur(秒) }] を順に鳴らす
function seq(steps) {
  for (const s of steps) {
    setTimeout(() => playNow(s.midi, { duration: s.dur ?? 0.9 }), s.at);
  }
}

function demo(id, fn) {
  document.getElementById(id).addEventListener('click', async () => {
    await ensureAudio();
    fn();
  });
}

// MIDIメモ: C4=60, C#=61, D=62, D#=63, E=64, F=65, G=67, A=69, B=71

// --- STEP 1: 半音と全音 ---
demo('halfBtn', () => {
  kb1.highlight([60, 61], new Set([61]));
  seq([{ midi: [60], at: 0 }, { midi: [61], at: 500 }]);
});
demo('wholeBtn', () => {
  kb1.highlight([60, 62], new Set([62]));
  seq([{ midi: [60], at: 0 }, { midi: [62], at: 500 }]);
});

// --- STEP 2: 長3度と短3度（ルートを選んで1段ずつ数え上げる） ---
// 「Cだから4つ」ではなく「どこから数えても4段＝長3度」を体感させる
const countLabel = document.getElementById('countLabel');
const countRootSelect = document.getElementById('countRootSelect');
NOTE_LETTERS.forEach((n, i) => countRootSelect.appendChild(new Option(n, i)));

/** ルートから半音を1段ずつ光らせて数え、最後に2音を同時に鳴らす */
function countUpDemo(kb, root, steps, resultText) {
  kb.highlight([root]);
  countLabel.textContent = 'ルート（ここから数える）';
  playNow([root], { duration: 0.8 });
  for (let i = 1; i <= steps; i++) {
    setTimeout(() => {
      const path = Array.from({ length: i + 1 }, (_, k) => root + k); // 通ってきた段も光らせる
      kb.highlight(path, new Set([root + i]));
      playNow([root + i], { duration: 0.5 });
      countLabel.textContent = `半音 ${i} つめ…`;
    }, i * 550);
  }
  setTimeout(() => {
    kb.highlight([root, root + steps], new Set([root + steps]));
    playNow([root, root + steps], { duration: 1.5 });
    countLabel.textContent = resultText;
  }, steps * 550 + 700);
}

demo('majThirdBtn', () => {
  const root = 60 + Number(countRootSelect.value);
  countUpDemo(kb2, root, 4,
    `半音4つ ＝ 長3度！（${midiToNoteName(root)} → ${midiToNoteName(root + 4)}）`);
});
demo('minThirdBtn', () => {
  const root = 60 + Number(countRootSelect.value);
  countUpDemo(kb2, root, 3,
    `半音3つ ＝ 短3度！（${midiToNoteName(root)} → ${midiToNoteName(root + 3)}）`);
});

// --- STEP 3: 三和音（3度の音を強調表示） ---
demo('cMajorBtn', () => {
  kb3.highlight([60, 64, 67], new Set([64]));
  seq([
    { midi: [60], at: 0 }, { midi: [64], at: 400 }, { midi: [67], at: 800 },
    { midi: [60, 64, 67], at: 1400, dur: 1.6 }
  ]);
});
demo('cMinorBtn', () => {
  kb3.highlight([60, 63, 67], new Set([63]));
  seq([
    { midi: [60], at: 0 }, { midi: [63], at: 400 }, { midi: [67], at: 800 },
    { midi: [60, 63, 67], at: 1400, dur: 1.6 }
  ]);
});
demo('cDimBtn', () => { // 短3度＋短3度
  kb3.highlight([60, 63, 66], new Set([63, 66]));
  seq([
    { midi: [60], at: 0 }, { midi: [63], at: 400 }, { midi: [66], at: 800 },
    { midi: [60, 63, 66], at: 1400, dur: 1.6 }
  ]);
});
demo('cAugBtn', () => { // 長3度＋長3度
  kb3.highlight([60, 64, 68], new Set([64, 68]));
  seq([
    { midi: [60], at: 0 }, { midi: [64], at: 400 }, { midi: [68], at: 800 },
    { midi: [60, 64, 68], at: 1400, dur: 1.6 }
  ]);
});

// --- STEP 4: 同じ形をずらす（C→D→Eメジャー） ---
demo('shapeBtn', () => {
  const shapes = [
    [60, 64, 67], // C
    [62, 66, 69], // D
    [64, 68, 71]  // E
  ];
  shapes.forEach((midi, i) => {
    setTimeout(() => {
      kb4.highlight(midi);
      playNow(midi, { duration: 1.0 });
    }, i * 1000);
  });
});

// --- STEP 5: セブンス（追加された7thを強調表示） ---
demo('maj7Btn', () => {
  kb5.highlight([60, 64, 67, 71], new Set([71]));
  seq([{ midi: [60, 64, 67], at: 0, dur: 1.0 }, { midi: [60, 64, 67, 71], at: 1100, dur: 1.6 }]);
});
demo('dom7Btn', () => {
  kb5.highlight([60, 64, 67, 70], new Set([70]));
  seq([{ midi: [60, 64, 67], at: 0, dur: 1.0 }, { midi: [60, 64, 67, 70], at: 1100, dur: 1.6 }]);
});
demo('m7Btn', () => {
  kb5.highlight([60, 63, 67, 70], new Set([70]));
  seq([{ midi: [60, 63, 67], at: 0, dur: 1.0 }, { midi: [60, 63, 67, 70], at: 1100, dur: 1.6 }]);
});

// --- STEP 6: 同じ4音でもルートで名前が変わる（C6 = Am7） ---
const FOUR_NOTES = [60, 64, 67, 69]; // ド・ミ・ソ・ラ
demo('notesOnlyBtn', () => {
  kb6.highlight(FOUR_NOTES);
  playNow(FOUR_NOTES, { duration: 1.6 });
});
demo('cBassBtn', () => {
  kb6.highlight([48, ...FOUR_NOTES], new Set([48])); // C3をベースに
  seq([{ midi: [48], at: 0, dur: 1.8 }, { midi: FOUR_NOTES, at: 200, dur: 1.6 }]);
});
demo('aBassBtn', () => {
  kb6.highlight([57, ...FOUR_NOTES], new Set([57])); // A3をベースに
  seq([{ midi: [57], at: 0, dur: 1.8 }, { midi: FOUR_NOTES, at: 200, dur: 1.6 }]);
});

// ========================================
// ステップ通しUI: 1画面1ステップ表示＋上部フローバー（クリックで直接ジャンプ＝スキップ操作を兼ねる）
// ========================================
const STEPS = [
  { icon: '🎵', title: '半音' },
  { icon: '📏', title: '3度' },
  { icon: '🎹', title: '三和音' },
  { icon: '🔁', title: '形' },
  { icon: '🧱', title: 'セブンス' },
  { icon: '🔗', title: '名前' },
  { icon: '🏁', title: 'GOAL' }
];

const panels = Array.from(document.querySelectorAll('.step-panel'));
const stepFlow = document.getElementById('stepFlow');
const progressFill = document.getElementById('stepProgressFill');
const prevBtn = document.getElementById('stepPrevBtn');
const nextBtn = document.getElementById('stepNextBtn');
const counterEl = document.getElementById('stepCounter');

let current = 0;

STEPS.forEach((s, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'step-flow-item';
  btn.innerHTML = `<span class="n">${s.icon}</span>${s.title}`;
  btn.addEventListener('click', () => goTo(i));
  stepFlow.appendChild(btn);
});
const flowItems = Array.from(stepFlow.children);

function goTo(i) {
  current = Math.max(0, Math.min(panels.length - 1, i));
  panels.forEach((p, idx) => p.classList.toggle('active', idx === current));
  flowItems.forEach((el, idx) => {
    el.classList.toggle('active', idx === current);
    el.classList.toggle('done', idx < current);
  });
  progressFill.style.width = `${Math.round((current / (panels.length - 1)) * 100)}%`;
  prevBtn.disabled = current === 0;
  const isLast = current === panels.length - 1;
  nextBtn.disabled = isLast;
  nextBtn.textContent = current === panels.length - 2 ? 'できた！ →' : 'つぎへ →';
  counterEl.textContent = isLast ? 'GOAL' : `STEP ${current + 1} / ${panels.length - 1}`;
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
}

prevBtn.addEventListener('click', () => goTo(current - 1));
nextBtn.addEventListener('click', () => goTo(current + 1));

goTo(0);
