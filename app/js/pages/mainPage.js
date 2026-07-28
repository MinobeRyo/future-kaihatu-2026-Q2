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
  buildChord, chordDisplayName, chordBreakdown, pcToMidi, noteRole,
  midiDisplayName, pcName, solfegeName, setDisplayKey, chordSpellingMap
} from '../core/musicTheory.js';
import { initAudio, loadInstrument, playNow } from '../core/audioEngine.js';
import { tensionCaption, VOICING_CAPTIONS, complexityLevel } from '../data/captions.js';

// 音名の文字 → ドレミ（固定ド）。変化記号はそのまま引き継ぐので
// 「ラ♯（B♭5）」のようにドレミと音名で食い違うことがない。
const SOLFEGE_OF = { C: 'ド', D: 'レ', E: 'ミ', F: 'ファ', G: 'ソ', A: 'ラ', B: 'シ' };

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
const chordNameEl = document.getElementById('chordName');
const towerBlocksEl = document.getElementById('towerBlocks');
const towerMeterEl = document.getElementById('towerMeter');
const towerFeelEl = document.getElementById('towerFeel');
const towerChipsEl = document.getElementById('towerChips');
const towerStageEl = document.getElementById('towerStage');
const stackAddBtn = document.getElementById('stackAddBtn');
const stackRemoveBtn = document.getElementById('stackRemoveBtn');

// --- 積み木スタック状態（デモ「音の積み木」の＋/−ボタン） ---
// stackN = 表示・再生する音数（低い方から数える）。null = 全部積む。
// コード選択（ルート/タイプ/ボイシング/オクターブ/テンション）を変えると全部積みに戻る。
let stackN = null;
// renderTowerで落下アニメを付けるブロックの開始index。
// 0=全ブロック落下（コード変更時）、Infinity=落下なし（再生時など）、n=n段目以降のみ（＋で積んだとき）
let dropFrom = 0;

// 再生時にステージへリング波紋＋積み木のウェーブを出す（v2デザイン・見た目のみ）
// pulseクラスは一定時間で外し、次の再生で再トリガーできるようにする。
let pulseTimer = null;
function pulseStage() {
  if (!towerStageEl) return;
  towerStageEl.classList.remove('pulse');
  void towerStageEl.offsetWidth; // アニメーション再スタート用のリフロー
  towerStageEl.classList.add('pulse');
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => towerStageEl.classList.remove('pulse'), 1600);
}

// コード名の登場アニメーションを再スタートさせる（v2デザイン・見た目のみ）
function replayNameAnim() {
  chordNameEl.style.animation = 'none';
  void chordNameEl.offsetWidth;
  chordNameEl.style.animation = '';
}

// 指定ブロックの中身を光らせる（音が鳴った瞬間の強調表示）
function flashInner(inner) {
  if (!inner) return;
  inner.classList.remove('hit');
  void inner.offsetWidth;
  inner.classList.add('hit');
}

// 全ブロックを一度だけ光らせる（コード全体を鳴らしたとき）
function flashAll() {
  towerBlocksEl.querySelectorAll('.blk-inner').forEach(flashInner);
}

// 選択中ルート
NOTE_LETTERS.forEach((n, i) => {
  const opt = document.createElement('option');
  opt.value = i; opt.textContent = pcName(i);
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
    stackN = null; // テンションを変えたら全部積みに戻す
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

// 役割キー → CSS変数名
function roleVar(key) { return `var(--role-${key}, var(--muted))`; }

// 積み木タワーと同じ役割色（--role-*）を鍵盤にも使う（②のテンション色統一ルール）。
function highlightKeyboard(chord, baseMidi) {
  keyboardEl.querySelectorAll('.key').forEach(k => {
    k.classList.remove('chord-tone', 'tension-tone');
    k.style.background = '';
    k.style.boxShadow = '';
  });
  chord.midi.forEach(m => {
    const el = keyboardEl.querySelector(`.key[data-midi="${m}"]`);
    if (!el) return;
    const role = noteRole(m - baseMidi);
    el.classList.add('chord-tone');
    el.style.background = roleVar(role.key);
    el.style.boxShadow = `0 0 16px ${roleVar(role.key)}`;
  });
}

// コードの構成音を役割ごとに色分けした積み木として、低い音を下に積み上げて表示する。
// 固定デモではなく、左パネルで選んだ基礎音・コードタイプ・テンションから毎回動的に生成する（仮デザインの音の積み木.htmlを移植）。
function renderTower(chord, baseMidi) {
  towerBlocksEl.innerHTML = '';
  towerChipsEl.innerHTML = '';
  // 音名は「このコードの中で何度か」で綴る（Cdim の第3音は F♯ ではなく G♭）
  const spell = chordSpellingMap(
    Number(rootSelect.value), typeSelect.value, Array.from(activeTensions));
  const nameOf = (m) => (spell.get(((m % 12) + 12) % 12)?.name ?? pcName(m % 12))
    + (Math.floor(m / 12) - 1);
  const doOf = (m) => {
    const n = spell.get(((m % 12) + 12) % 12)?.name;
    return n ? (SOLFEGE_OF[n[0]] ?? '') + n.slice(1) : solfegeName(m % 12);
  };
  const sorted = [...chord.midi].sort((a, b) => a - b);
  const df = dropFrom;
  dropFrom = 0; // 消費したら既定（全ブロック落下）に戻す

  if (sorted.length === 0) {
    towerBlocksEl.innerHTML = '<div class="tower-empty">ここに音が積まれます</div>';
    towerMeterEl.innerHTML = '';
    towerFeelEl.textContent = '';
    towerStageEl?.style.removeProperty('--stage-glow');
    return;
  }

  // 一番上に積まれた音の役割色を、コード名とステージの光に反映（v2デザイン）
  const topColor = roleVar(noteRole(sorted[sorted.length - 1] - baseMidi).key);
  towerStageEl?.style.setProperty('--stage-glow', topColor);

  sorted.forEach((m, i) => {
    const role = noteRole(m - baseMidi);
    const v = roleVar(role.key);
    const gradient = `linear-gradient(175deg, color-mix(in srgb, ${v} 78%, #fff), color-mix(in srgb, ${v} 62%, #120e16))`;

    const block = document.createElement('button');
    block.type = 'button';
    block.className = 'tower-block';
    block.style.background = gradient;
    block.style.width = `${232 + i * 8}px`; // 下ほど幅広く＝積み木らしいピラミッド型
    block.style.setProperty('--i', Math.max(0, i - df)); // 落下の時間差用（dfより下の段は落とさない）
    if (i < df) block.style.animation = 'none'; // すでに積んであった段は動かさない
    block.dataset.midi = m; // 「1音ずつ積んで聴く」の音同期用
    // .blk-inner: 強調発光を担当する層（外側は落下を担当）
    block.innerHTML = `<span class="blk-inner"><span>${doOf(m)}（${nameOf(m)}）</span><span class="role">${role.label || '—'}</span></span>`;
    block.addEventListener('click', async () => {
      flashInner(block.firstElementChild);
      await ensureAudio();
      playNow([m], { duration: 0.9 });
    });
    towerBlocksEl.appendChild(block);

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tower-chip';
    chip.style.setProperty('--i', Math.max(0, i - df));
    if (i < df) chip.style.animation = 'none'; // ブロックが落ちないときはチップもポップインさせない
    chip.style.borderColor = `color-mix(in srgb, ${v} 60%, transparent)`;
    chip.style.background = `color-mix(in srgb, ${v} 30%, transparent)`;
    chip.textContent = `${doOf(m)} ${role.label || ''}`.trim();
    chip.addEventListener('click', async () => {
      await ensureAudio();
      playNow([m], { duration: 0.9 });
    });
    towerChipsEl.appendChild(chip);
  });

  const MAX_SEGMENTS = 7; // ルート・3度・5度・7th・9th・11th・13thの目安
  towerMeterEl.innerHTML = Array.from({ length: MAX_SEGMENTS }, (_, i) => {
    if (i < sorted.length) {
      const v = roleVar(noteRole(sorted[i] - baseMidi).key);
      return `<span class="seg" style="background:${v}; box-shadow:0 0 10px color-mix(in srgb, ${v} 60%, transparent);"></span>`;
    }
    return '<span class="seg"></span>';
  }).join('');

  const level = complexityLevel(chord.midi.length);
  const sparkle = '✨'.repeat(Math.max(0, level.level - 1));
  // m7 に 9th を足すと慣習表記は Am9 になり、名前から 7 が消えたように見える。
  // 何に何を足した形なのかを添えて、消えたわけではないことを示す。
  const breakdown = chordBreakdown(
    Number(rootSelect.value), typeSelect.value, Array.from(activeTensions));
  towerFeelEl.textContent = `${level.label}な響き ${sparkle}（音${chord.midi.length}個）`
    + (breakdown ? `　＝ ${breakdown}` : '');
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

// ＋/−ボタンの押せる/押せない見た目を更新
function updateStackButtons(total) {
  if (!stackAddBtn || !stackRemoveBtn) return;
  const cur = stackN ?? total;
  stackAddBtn.classList.toggle('off', cur >= total);
  stackRemoveBtn.classList.toggle('off', cur <= 0);
}

function render() {
  const opts = currentChordOpts();
  const chord = buildChord(opts);
  // このページは「1つのコードを見る」画面なので、音名の綴りはコードのルートを基準にする。
  // （キーC固定だと A♭m7 の♭7thが G♭ ではなく F♯ と表示されてしまう）
  setDisplayKey(opts.rootPc);
  const baseMidi = pcToMidi(opts.rootPc, opts.octave);
  const sorted = [...chord.midi].sort((a, b) => a - b);
  // stackNが設定されていれば、低い方からその数だけ表示・ハイライトする
  const shown = stackN == null ? sorted : sorted.slice(0, stackN);
  const view = { midi: shown };
  highlightKeyboard(view, baseMidi);
  renderTower(view, baseMidi);
  const name = chordDisplayName(opts.rootPc, opts.type, opts.tensions);
  if (chordNameEl.textContent !== name) {
    chordNameEl.textContent = name;
    replayNameAnim();
  }
  updateStackButtons(sorted.length);

  if (activeTensions.size === 0) {
    setCaption(VOICING_CAPTIONS[opts.voicing] ?? '');
  }
  return chord;
}

// コード選択が変わったら積み木は全部積みに戻す
[rootSelect, typeSelect, voicingSelect].forEach(el =>
  el.addEventListener('change', () => { stackN = null; render(); }));

// オクターブ変更時は鍵盤の描画範囲ごと作り直す
octaveSelect.addEventListener('change', () => {
  stackN = null;
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
  stackN = null;       // 全部積みに戻して鳴らす
  dropFrom = Infinity; // タワーは落下し直さず、光らせるだけ
  const chord = render();
  playNow(chord.midi, { duration: 1.5 });
  flashAll();
  pulseStage();
});

arpBtn.addEventListener('click', async () => {
  await ensureAudio();
  stackN = null;
  dropFrom = Infinity; // まず全ブロックを作り、いったん見えなくする
  const chord = render();
  const blocks = new Map(
    Array.from(towerBlocksEl.querySelectorAll('.tower-block')).map(b => [Number(b.dataset.midi), b])
  );
  blocks.forEach(b => b.classList.add('pending'));

  // ① 1音ずつ再生。音が鳴った瞬間に、そのブロックが落ちてきて光る
  chord.midi.forEach((m, i) => {
    setTimeout(() => {
      playNow([m], { duration: 0.6 });
      const b = blocks.get(m);
      if (b) {
        b.style.animation = ''; // インラインの animation:none を解除して drop-now を効かせる
        b.classList.remove('pending');
        b.classList.add('drop-now');
        flashInner(b.firstElementChild);
      }
    }, i * 300);
  });

  // 最後に全音同時 → 全ブロックが光る
  setTimeout(() => {
    playNow(chord.midi, { duration: 1.5 });
    blocks.forEach(b => b.classList.remove('pending')); // 念のため全部表示に戻す
    flashAll();
    pulseStage();
  }, chord.midi.length * 300 + 150);
});

// --- ＋音をつむ / −ひとつ外す（デモ「音の積み木」のコントロール） ---
if (stackAddBtn && stackRemoveBtn) {
  stackAddBtn.addEventListener('click', async () => {
    await ensureAudio();
    const opts = currentChordOpts();
    const sorted = [...buildChord(opts).midi].sort((a, b) => a - b);
    const total = sorted.length;
    const cur = stackN ?? total;
    if (cur >= total) return;
    const next = cur + 1;
    stackN = next >= total ? null : next;
    dropFrom = next - 1; // 新しく積んだ1個だけ落とす
    render();
    const baseMidi = pcToMidi(opts.rootPc, opts.octave);
    const added = sorted[next - 1];
    playNow(sorted.slice(0, next), { duration: 1.3 });
    const role = noteRole(added - baseMidi);
    setCaption(`${solfegeName(added % 12)}（${role.label || '音'}）を積みました。響きの変化を聴いてみて。`);
  });

  stackRemoveBtn.addEventListener('click', async () => {
    await ensureAudio();
    const opts = currentChordOpts();
    const sorted = [...buildChord(opts).midi].sort((a, b) => a - b);
    const total = sorted.length;
    const cur = stackN ?? total;
    if (cur <= 0) return;
    stackN = cur - 1;
    dropFrom = Infinity; // 外すときは残りを落下し直さない
    render();
    if (stackN > 0) {
      playNow(sorted.slice(0, stackN), { duration: 1.2 });
      flashAll();
      setCaption(`上の音をひとつ外しました（${stackN}/${total}音）。＋で積み直せます。`);
    } else {
      setCaption('全部くずしました。＋で1音ずつ積み上げてみましょう。');
    }
  });
}

// A/B試聴: 一時的に元のコードを表示・再生し、終わったら現在の設定表示へ自動で戻す
// （以前は押した後のハイライトが残り続け、表示とボタン状態がずれていた）
let abRestoreTimer = null;
abOrigBtn.addEventListener('click', async () => {
  await ensureAudio();
  const opts = currentChordOpts();
  const orig = buildChord({ ...opts, tensions: [] });
  const baseMidi = pcToMidi(opts.rootPc, opts.octave);
  dropFrom = Infinity; // 一時表示では落下させない
  highlightKeyboard(orig, baseMidi);
  renderTower(orig, baseMidi);
  chordNameEl.textContent = chordDisplayName(opts.rootPc, opts.type);
  playNow(orig.midi, { duration: 1.3 });
  flashAll();
  pulseStage();
  setCaption('テンションを外した「元のコード」です。');
  clearTimeout(abRestoreTimer);
  abRestoreTimer = setTimeout(() => { dropFrom = Infinity; render(); }, 1400); // 復帰時も落下し直さない
});

abTensionBtn.addEventListener('click', async () => {
  await ensureAudio();
  clearTimeout(abRestoreTimer);
  stackN = null;
  dropFrom = Infinity; // 落下し直さず光らせるだけ
  const chord = render();
  playNow(chord.midi, { duration: 1.3 });
  flashAll();
  pulseStage();
  if (activeTensions.size > 0) {
    const feels = Array.from(activeTensions).map(k => TENSIONS[k].feel).join(' / ');
    setCaption(`テンション追加後: ${feels}`);
  } else {
    setCaption('テンションを追加すると、ここでA/B聴き比べができます。');
  }
});

render();

// 音名表記（♯/♭）が切り替わったら、音名を出している所を描き直す
document.addEventListener('notationchange', () => {
  rootSelect.querySelectorAll('option').forEach((o, i) => { o.textContent = pcName(i); });
  render();
});
