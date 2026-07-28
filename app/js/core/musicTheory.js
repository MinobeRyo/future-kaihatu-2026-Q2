// ========================================
// musicTheory.js - 音楽理論エンジン（全ページ共通・唯一の実装）
// 旧アプリで chordCalculator.js / composeAudio.js / learnMain.js に
// 三重実装されていたロジックをここに統合。
// DOM・Audio に依存しない純粋ロジックのみ（Nodeでもテスト可能）。
// ========================================

export const NOTE_LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// コードタイプ → 半音間隔（ルート=0）
export const CHORD_INTERVALS = {
  none:  [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  '7':   [0, 4, 7, 10],
  maj7:  [0, 4, 7, 11],
  m7:    [0, 3, 7, 10],
  m7b5:  [0, 3, 6, 10],  // ハーフディミニッシュ（マイナーセブンスの5度を半音下げた形）
  mmaj7: [0, 3, 7, 11],  // マイナーメジャーセブンス
  sus4:  [0, 5, 7],
  sus2:  [0, 2, 7],
  '7sus4': [0, 5, 7, 10],
  dim:   [0, 3, 6],
  dim7:  [0, 3, 6, 9],   // フルディミニッシュ（全部を短3度で積む）
  aug:   [0, 4, 8]
};

export const CHORD_TYPE_LABELS = {
  none: '', major: '', minor: 'm', '7': '7', maj7: 'maj7',
  m7: 'm7', m7b5: 'm7♭5', mmaj7: 'mM7', sus4: 'sus4', sus2: 'sus2',
  '7sus4': '7sus4', dim: 'dim', dim7: 'dim7', aug: 'aug'
};

// テンション定義（②テンションコード操作機能用）
// interval: ルートからの半音数 / label: ボタン表示 / feel: 初心者向け一言解説
// implies7: 9th/11th/13thは理論上「7thの上に積む」テンションなので、
//           7thを含まないコードに付けた場合は短7度も一緒に足す。
//           add9・6thは三和音にそのまま1音足すだけ（7thは足さない）。
export const TENSIONS = {
  add9:  { interval: 14, label: 'add9', feel: '透明感・キラキラした響きが加わる（7thは足さない）' },
  '9':   { interval: 14, label: '9th',  feel: '7thと重なって、おしゃれで浮遊感のある大人の響きになる', implies7: true },
  '11':  { interval: 17, label: '11th', feel: '和風・浮遊感のある不思議な響きになる', implies7: true },
  '13':  { interval: 21, label: '13th', feel: '大人っぽく豊かな、ジャズ的な響きになる', implies7: true },
  '6':   { interval: 9,  label: '6th',  feel: '柔らかくレトロで安心感のある響きになる' }
};

// ---------- 音名・MIDI 変換 ----------

/**
 * 音名 → ピッチクラス(0-11)。'C','C#','Db','F#' などに対応。
 */
export function noteNameToPc(name) {
  let pc = NOTE_LETTERS.indexOf(name[0]);
  if (pc === -1) return -1;
  if (name.includes('#') || name.includes('♯')) pc = (pc + 1) % 12;
  if (name.includes('b') || name.includes('♭')) pc = (pc + 11) % 12;
  return pc;
}

/** ピッチクラス+オクターブ → MIDI番号（C4=60） */
export function pcToMidi(pc, octave) {
  return 12 * (octave + 1) + pc;
}

/**
 * MIDI番号 → 音名（例: 60 → 'C4'）
 * これは「内部用・音源に渡す用」の名前。必ず ASCII のシャープ表記になる
 * （soundfont-player の note-parser が読める形にしておく必要があるため）。
 * 画面に出す名前は midiDisplayName() を使うこと。
 */
export function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_LETTERS[midi % 12] + octave;
}

// ============================================================
// 表示用の音名（♯/♭の綴り分け）
// ============================================================
// これまで音名は NOTE_LETTERS のシャープ固定で、A♭ や B♭ を出せなかった。
// 正しい綴りは「キーの中で何度の音か」で決まる。たとえば同じ音(pc=8)でも、
// キーCでは b6 なので A♭、キーEでは #5 なので G♯ が正しい。
// ここでは度数から綴りを計算する。内部処理・音源は上の NOTE_LETTERS のまま。

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

// メジャーキーの主音表記（慣習に合わせ D♭/E♭/G♭/A♭/B♭ を採る）→ [文字index, 変化記号]
const KEY_TONIC = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
  [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]
];
// キーからの半音差 → 度数(1〜7)。b2,b3,#4,b6,b7 は隣の度数の変化音として扱う
const DEGREE_OF_OFF = [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7];

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** 表示モード。auto はキーから綴りを決める */
export const NOTATION_MODES = [
  { id: 'auto', label: '自動', desc: 'キーに合わせて正しい綴りを選びます（キーCなら A♭、キーDなら F♯）' },
  { id: 'sharp', label: '♯', desc: 'すべてシャープで表記します' },
  { id: 'flat', label: '♭', desc: 'すべてフラットで表記します' },
  { id: 'both', label: '両方', desc: '主表記のとなりに、もう一方の呼び方を小さく添えます' }
];

let notationMode = 'auto';
let displayKeyPc = 0;

export function setNotation(mode) {
  notationMode = NOTATION_MODES.some(m => m.id === mode) ? mode : 'auto';
}
export function getNotation() { return notationMode; }
/** 自動モードで綴りを決める基準になるキーを設定する（各ページがキー変更時に呼ぶ） */
export function setDisplayKey(pc) { displayKeyPc = ((pc % 12) + 12) % 12; }
export function getDisplayKey() { return displayKeyPc; }

/** キーの中での度数から、理論的に正しい綴りを組み立てる */
function spellByKey(pc, keyPc) {
  // 白鍵はそのまま文字で出す。理論上は キーB の #4 が E♯ になるが、
  // 初心者向けなので E と読める形を優先する（重変記号も同じ理由で避ける）
  const white = LETTER_PC.indexOf(pc);
  if (white !== -1) return LETTERS[white];

  const [tonicLetter] = KEY_TONIC[((keyPc % 12) + 12) % 12];
  const off = ((pc - keyPc) % 12 + 12) % 12;
  const li = (tonicLetter + DEGREE_OF_OFF[off] - 1) % 7;
  let acc = ((pc - LETTER_PC[li]) % 12 + 12) % 12;
  if (acc > 6) acc -= 12;                       // 上下どちらに近いかで符号を決める
  if (acc < -1 || acc > 1) return FLAT_NAMES[pc]; // 重変記号が要るなら諦めてフラット表記
  return LETTERS[li] + (acc > 0 ? '♯' : acc < 0 ? '♭' : '');
}

/**
 * ピッチクラス → 画面に出す音名。
 * @param {number} pc 0-11
 * @param {number} [keyPc] 綴りの基準になるキー（省略時は setDisplayKey で設定した値）
 */
export function pcName(pc, keyPc = displayKeyPc) {
  const p = ((pc % 12) + 12) % 12;
  switch (notationMode) {
    case 'sharp': return SHARP_NAMES[p];
    case 'flat': return FLAT_NAMES[p];
    // 「両方」も主表記は自動と同じ。もう一方は pcAltName() で別に取り、
    // UI側で小さく添える。名前の中に "/" を混ぜるとコード名が読みにくくなるため。
    default: return spellByKey(p, keyPc);
  }
}

/**
 * 異名同音のもう一方の呼び方。「両方」モードのときだけ返す。
 * 黒鍵の5音にしか別表記は無いので、白鍵と他モードでは null。
 */
export function pcAltName(pc, keyPc = displayKeyPc) {
  if (notationMode !== 'both') return null;
  const p = ((pc % 12) + 12) % 12;
  if (SHARP_NAMES[p] === FLAT_NAMES[p]) return null;
  const main = pcName(p, keyPc);
  return main === SHARP_NAMES[p] ? FLAT_NAMES[p] : SHARP_NAMES[p];
}

/** MIDI番号 → 画面に出す音名（例: 68 → キーCなら 'A♭4'） */
export function midiDisplayName(midi, keyPc = displayKeyPc) {
  return pcName(((midi % 12) + 12) % 12, keyPc) + (Math.floor(midi / 12) - 1);
}

/** MIDI番号のもう一方の呼び方（「両方」モードのみ。無ければ null） */
export function midiAltName(midi, keyPc = displayKeyPc) {
  const alt = pcAltName(((midi % 12) + 12) % 12, keyPc);
  return alt ? alt + (Math.floor(midi / 12) - 1) : null;
}

// 固定ド（C=ド）のソルフェージュ。音名の綴りにそのまま追従させる——
// 「ラ♯（B♭5）」のように、ドレミと音名で変化記号が食い違うのを防ぐため。
const SOLFEGE_OF_LETTER = { C: 'ド', D: 'レ', E: 'ミ', F: 'ファ', G: 'ソ', A: 'ラ', B: 'シ' };

/** ピッチクラス → ドレミ表記（例: pc=8 は キーCなら 'ラ♭'、♯モードなら 'ソ♯'） */
export function solfegeName(pc, keyPc = displayKeyPc) {
  const n = pcName(pc, keyPc);
  return (SOLFEGE_OF_LETTER[n[0]] ?? '') + n.slice(1);
}

// ---------- コード構築 ----------

/**
 * コードの構成音を計算する。
 * @param {object} opts
 *   rootPc: ルートのピッチクラス(0-11)
 *   type: 'major' | 'minor' | ...（CHORD_INTERVALSのキー）
 *   octave: 基準オクターブ（既定4）
 *   tensions: 追加テンションの配列 例 ['9']（TENSIONSのキー）
 *   voicing: 'root' | 'first' | 'second' | 'spread'
 * @returns {{ midi: number[], noteNames: string[], addedByTension: number[] }}
 *   addedByTension はテンションで追加されたMIDI（UIで色分けハイライトに使う）
 */
export function buildChord({ rootPc, type = 'major', octave = 4, tensions = [], voicing = 'root' }) {
  const baseMidi = pcToMidi(rootPc, octave);
  const intervals = CHORD_INTERVALS[type] || CHORD_INTERVALS.none;
  let midi = intervals.map(i => baseMidi + i);

  midi = applyVoicing(midi, voicing);

  const addedByTension = [];
  const has7 = intervals.includes(10) || intervals.includes(11); // 元のコードに7thがあるか
  for (const t of tensions) {
    const def = TENSIONS[t];
    if (!def) continue;
    // 9th/11th/13thは7thの上に積むのが正しい形 → 7thが無ければ短7度も足す
    if (def.implies7 && !has7) {
      const seventh = baseMidi + 10;
      if (!midi.includes(seventh)) {
        midi.push(seventh);
        addedByTension.push(seventh);
      }
    }
    const note = baseMidi + def.interval;
    if (!midi.includes(note)) {
      midi.push(note);
      addedByTension.push(note);
    }
  }
  midi.sort((a, b) => a - b);

  return { midi, noteNames: midi.map(midiToNoteName), addedByTension };
}

/** ボイシング（転回形・開離）を適用 */
export function applyVoicing(midiArr, voicing) {
  const m = [...midiArr];
  if (m.length < 2) return m;
  switch (voicing) {
    case 'first': {           // 第1転回形
      const lowest = m.shift();
      m.push(lowest + 12);
      break;
    }
    case 'second': {           // 第2転回形
      if (m.length >= 3) {
        const a = m.shift(), b = m.shift();
        m.push(a + 12, b + 12);
      }
      break;
    }
    case 'spread':             // 開離（ルートを1オクターブ上にも重ねる）
      m.push(m[0] + 12);
      break;
  }
  return m.sort((a, b) => a - b);
}

// ---------- 音の役割（積み木UI用） ----------

// ルートからの半音数 → 役割ラベル・キー（色分けに使う）。
// キーはCSS変数 --role-* / --tension-* と対応させる。
const ROLE_TABLE = [
  { iv: 0,  key: 'root',    label: 'ルート' },
  { iv: 2,  key: 'ninth',   label: '2nd/sus2' },
  { iv: 3,  key: 'third',   label: '3度（短）' },
  { iv: 4,  key: 'third',   label: '3度（長）' },
  { iv: 5,  key: 'fourth',  label: '4度/sus4' },
  { iv: 6,  key: 'fifth',   label: '♭5' },
  { iv: 7,  key: 'fifth',   label: '5度' },
  { iv: 8,  key: 'fifth',   label: '#5' },
  { iv: 9,  key: 'sixth',   label: '6th' },
  { iv: 10, key: 'seventh', label: '♭7th' },
  { iv: 11, key: 'seventh', label: '7th' },
  { iv: 14, key: 'ninth',   label: '9th' },
  { iv: 17, key: 'eleventh', label: '11th' },
  { iv: 21, key: 'thirteenth', label: '13th' }
];

/**
 * ルートからの半音数(0以上、オクターブ超えも可)から音の役割を判定する。
 * 積み木タワーUI・鍵盤ハイライトの色分けに使う（②のテンション色統一ルールの土台）。
 * @returns {{ key: string, label: string }}
 */
export function noteRole(intervalFromRoot) {
  const iv = ((intervalFromRoot % 12) + 12) % 12;
  // 12以上（9th/11th/13th等の拡張域）は元の値で判定し、それ以外はオクターブ内で判定
  const exact = ROLE_TABLE.find(r => r.iv === intervalFromRoot);
  if (exact) return { key: exact.key, label: exact.label };
  const byMod = ROLE_TABLE.find(r => r.iv === iv);
  return byMod ? { key: byMod.key, label: byMod.label } : { key: 'other', label: '' };
}

// ---------- 度数（ディグリー）解析 ----------
// 「進行はキーに依存しない」を体感させる度数モード、および
// ①-2 既存楽曲との逆引きマッチングの土台。

const ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

/**
 * キーからのオフセット(半音0-11)＋クオリティ → ローマ数字表記
 * 例: (5,'major') → 'IV' / (9,'minor') → 'VIm'
 */
export function degreeToRoman(offset, quality) {
  const base = ROMAN[((offset % 12) + 12) % 12];
  const suffix = CHORD_TYPE_LABELS[quality] ?? '';
  // マイナー系は小文字表記も一般的だが、初心者向けに「VIm」形式で統一
  return base + suffix;
}

/**
 * コード進行（[{rootPc, type}]）をキー非依存の「相対シグネチャ」に正規化する。
 * 先頭コードのルートを0とした半音オフセット＋クオリティ（メジャー系/マイナー系に単純化）の列。
 */
export function normalizeProgression(chords) {
  if (!chords.length) return [];
  const first = chords[0].rootPc;
  return chords.map(c => ({
    off: ((c.rootPc - first) % 12 + 12) % 12,
    q: simplifyQuality(c.type)
  }));
}

/** コードタイプを 'M'（メジャー系）/'m'（マイナー系）に単純化（逆引きはトライアド単位で照合） */
export function simplifyQuality(type) {
  return ['minor', 'm7', 'dim', 'm7b5', 'mmaj7', 'dim7'].includes(type) ? 'm' : 'M';
}

/**
 * 2つの進行の類似度を計算する（巡回一致対応）。
 * 進行はループするので、回転させながら最も一致する位置を探す。
 * @returns {{ score: number, rotation: number }} score は 0〜1
 */
export function matchProgressions(userChords, patternDegrees) {
  const user = normalizeProgression(userChords);
  if (user.length === 0 || patternDegrees.length === 0) return { score: 0, rotation: 0 };

  let best = { score: 0, rotation: 0 };
  const n = patternDegrees.length;

  for (let rot = 0; rot < n; rot++) {
    // パターンを rot 回転して先頭基準に正規化
    const rotated = patternDegrees.map((_, i) => patternDegrees[(i + rot) % n]);
    const base = rotated[0].off;
    const normPattern = rotated.map(d => ({
      off: ((d.off - base) % 12 + 12) % 12,
      q: d.q
    }));

    const len = Math.min(user.length, normPattern.length);
    let hit = 0;
    for (let i = 0; i < len; i++) {
      if (user[i].off === normPattern[i].off && user[i].q === normPattern[i].q) hit++;
      else if (user[i].off === normPattern[i].off) hit += 0.5; // ルートは同じでクオリティ違い
    }
    const score = hit / Math.max(user.length, normPattern.length);
    if (score > best.score) best = { score, rotation: rot };
  }
  return best;
}

// ---------- 移調 ----------

/** 進行全体を semitones 半音だけ移調する */
export function transposeProgression(chords, semitones) {
  return chords.map(c => ({ ...c, rootPc: ((c.rootPc + semitones) % 12 + 12) % 12 }));
}

/**
 * コード表示名を作る 例: (rootPc=5,'m7') → 'Fm7'
 * テンションは慣習に合わせて整理する:
 *   - 9/11/13は「下のテンションを含む」前提で最大の数字だけを代表にする（D13 など）
 *   - 13thと6thは同じ音なので13th優先で6thは省略
 *   - 6thとadd9の同時押しは「シックスナインス」C6/9 と表記
 *   - 7thを持つコードではadd9も9thと同じ扱い（Cmaj7+add9 → Cmaj9）
 */
export function chordDisplayName(rootPc, type, tensions = [], keyPc = undefined) {
  const root = pcName(rootPc, keyPc ?? getDisplayKey());
  const base = CHORD_TYPE_LABELS[type] ?? '';
  if (tensions.length === 0) return root + base;

  const t = new Set(tensions);
  const typeHas7 = (CHORD_INTERVALS[type] || []).some(i => i === 10 || i === 11);
  if (typeHas7 && t.has('add9')) { t.delete('add9'); t.add('9'); }

  // 代表になる拡張数字（9 < 11 < 13 の最大）
  let ext = null;
  if (t.has('13')) ext = '13';
  else if (t.has('11')) ext = '11';
  else if (t.has('9')) ext = '9';
  ['9', '11', '13'].forEach(k => t.delete(k));
  if (ext === '13') t.delete('6'); // 6thと13thは同じ音

  let name;
  if (ext) {
    if (type === 'major' || type === '7') name = root + ext;              // C9, D13
    else if (type === 'maj7') name = `${root}maj${ext}`;                  // Cmaj9
    else if (type === 'minor' || type === 'm7') name = `${root}m${ext}`;  // Cm9
    else if (type === 'm7b5') name = `${root}m${ext}♭5`;                  // Cm9♭5
    else if (type === 'mmaj7') name = `${root}mM${ext}`;                  // CmM9
    else name = `${root}${base}(${ext})`;                                 // sus4/dim等は併記
  } else {
    name = root + base;
  }

  const has6 = t.delete('6');
  const hasAdd9 = t.delete('add9');
  if (has6 && hasAdd9 && !ext) {
    // シックスナインス。ただし直前が数字なら「Csus46/9」になるので括弧でくくる
    name += /\d$/.test(name) ? '(6/9)' : '6/9';
  } else {
    // 直前が数字で終わっていると「m76」のように読めなくなるので括弧でくくる
    if (has6) name += (ext || /\d$/.test(name)) ? '(6)' : '6';
    if (hasAdd9) name += (type === 'minor' ? '(add9)' : 'add9');
  }

  // 将来のテンション追加用フォールバック
  if (t.size) name += `(${[...t].map(x => TENSIONS[x]?.label ?? x).join(',')})`;
  return name;
}

/**
 * コード名の「もう一方の呼び方」。「両方」モードのときだけ返す。
 * ルートの綴りだけを差し替える（A♭m7♭5 ↔ G♯m7♭5）。
 */
export function chordAltName(rootPc, type, tensions = [], keyPc = undefined) {
  const k = keyPc ?? getDisplayKey();
  const alt = pcAltName(rootPc, k);
  if (!alt) return null;
  const main = pcName(rootPc, k);
  return alt + chordDisplayName(rootPc, type, tensions, k).slice(main.length);
}

/**
 * 表示名が元のコードタイプを隠してしまうときに、「何に何を足した形か」を返す。
 * 例: m7 に 9th を足すと慣習表記は Cm9 になり、名前から 7 が消えて見える。
 * 隠れておらず、暗黙の7thも足されていない場合は null。
 */
export function chordBreakdown(rootPc, type, tensions = [], keyPc = undefined) {
  if (!tensions || tensions.length === 0) return null;
  const bare = chordDisplayName(rootPc, type, [], keyPc);
  const full = chordDisplayName(rootPc, type, tensions, keyPc);
  const labels = tensions.map(x => TENSIONS[x]?.label ?? x).join(' + ');
  const has7 = (CHORD_INTERVALS[type] || []).some(i => i === 10 || i === 11);
  // 9th/11th/13thは7thの上に積むテンションなので、7thの無いコードに付けると♭7thも増える
  const adds7 = !has7 && tensions.some(x => TENSIONS[x]?.implies7);
  const hidden = !full.startsWith(bare);
  if (!hidden && !adds7) return null;
  let s = `${bare} に ${labels} を足した形`;
  if (adds7) s += '（9th以上は7thの上に積むので、♭7thも一緒に入ります）';
  return s;
}

// ============================================================
// コード構成音の綴り（度数ベース）
// ============================================================
// コードの綴りは「キーの中で何度か」ではなく「そのコードの中で何度か」で決まる。
// 例: Cdim の第3音は Cから数えて5番目の文字 G を半音下げた G♭ であって、
//     F♯ ではない（F♯ と書くと4度に見えてしまい、和音の形が読めなくなる）。
// キー基準の綴りだけで組み立てていたため、156通り中56通りで音程が読めない
// 綴りになっていた（Cdim→C E♭ F♯ / Caug→C E A♭ / Dm7♭5→D F G♯ C）。

/** コードタイプ → 各構成音の度数（CHORD_INTERVALS と同じ並び） */
const CHORD_DEGREES = {
  none: [1], major: [1, 3, 5], minor: [1, 3, 5], '7': [1, 3, 5, 7], maj7: [1, 3, 5, 7],
  m7: [1, 3, 5, 7], m7b5: [1, 3, 5, 7], mmaj7: [1, 3, 5, 7], sus4: [1, 4, 5], sus2: [1, 2, 5],
  '7sus4': [1, 4, 5, 7], dim: [1, 3, 5], dim7: [1, 3, 5, 7], aug: [1, 3, 5]
};
const TENSION_DEGREE = { add9: 9, '9': 9, '11': 11, '13': 13, '6': 6 };
/** 度数 → メジャースケール上の半音数（度数ラベルの♯♭を決める基準） */
const MAJOR_INTERVAL = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 };

const accSign = (a) => a > 0 ? '♯'.repeat(a) : a < 0 ? '♭'.repeat(-a) : '';

/**
 * コードの構成音を、度数にもとづいて綴る。
 * @returns [{ pc, interval, name, degree, degreeLabel, simplified }]
 *   name:        画面に出す音名（重変記号が要る音は読みやすい表記に落とす）
 *   degreeLabel: '1' '♭3' '♭5' '♭♭7' など。落とした音でも理論上の度数はここに残る
 *   simplified:  読みやすい表記に落としたかどうか
 */
export function chordSpelling(rootPc, type = 'major', tensions = [], keyPc = undefined) {
  const k = keyPc ?? displayKeyPc;
  const rootLi = LETTERS.indexOf(pcName(rootPc, k)[0]);
  const ivs = CHORD_INTERVALS[type] || CHORD_INTERVALS.none;
  const degs = CHORD_DEGREES[type] || CHORD_DEGREES.none;
  const pairs = ivs.map((iv, i) => [iv, degs[i] ?? 1]);

  // buildChord と同じ順序でテンションを足す（9th以上は7thの上に積む）
  const has7 = ivs.some(i => i === 10 || i === 11);
  for (const t of tensions) {
    const def = TENSIONS[t];
    if (!def) continue;
    if (def.implies7 && !has7 && !pairs.some(([iv]) => iv === 10)) pairs.push([10, 7]);
    if (!pairs.some(([iv]) => iv === def.interval)) pairs.push([def.interval, TENSION_DEGREE[t] ?? 9]);
  }
  pairs.sort((a, b) => a[0] - b[0]);

  return pairs.map(([iv, deg]) => {
    const pc = ((rootPc + iv) % 12 + 12) % 12;
    const li = (rootLi + deg - 1) % 7;
    let acc = ((pc - LETTER_PC[li]) % 12 + 12) % 12;
    if (acc > 6) acc -= 12;
    // 重変記号（B♭♭ など）が必要なら音名は読みやすい方に落とす。
    // 理論上の度数は degreeLabel に残るので、情報は失われない。
    const simplified = Math.abs(acc) > 1;
    const name = simplified ? pcName(pc, k) : LETTERS[li] + accSign(acc);
    const d = iv - (MAJOR_INTERVAL[deg] ?? 0);
    return { pc, interval: iv, name, degree: deg, degreeLabel: accSign(d) + deg, simplified };
  });
}

/** ピッチクラス → そのコードでの綴り、を引ける Map にする */
export function chordSpellingMap(rootPc, type, tensions = [], keyPc = undefined) {
  const m = new Map();
  for (const s of chordSpelling(rootPc, type, tensions, keyPc)) {
    if (!m.has(s.pc)) m.set(s.pc, s);
  }
  return m;
}

// 度数ラベル → 初心者向けの日本語。
// 「♭7 と書くなら、なんで 6 じゃないの？」に答えるための説明文。
// 度数は半音の数ではなく「ドレミファソラシの何番目か」なので、
// 同じ鍵盤でも文字が違えば別の度数になる、という所を必ず言葉にする。
const DEGREE_MEANING = {
  '1':  'ルート。コードの土台になる音',
  '2':  '2番目の音。sus2 の「ふわっと」を作る',
  '♭3': '3番目の音を半音下げた音。マイナーの「せつなさ」の正体',
  '3':  '3番目の音。メジャーの「あかるさ」の正体',
  '4':  '4番目の音。sus4 の「決まりきらない感じ」を作る',
  '♭5': '5番目の音を半音下げた音。安定を崩して不安にする',
  '5':  '5番目の音。コードをどっしり安定させる',
  '♯5': '5番目の音を半音上げた音。ふしぎな浮遊感が出る',
  '6':  '6番目の音。やわらかくレトロな感じになる',
  '♭7': '7番目の音を半音下げた音。次のコードへ進みたくなる力が出る',
  '7':  '7番目の音。おしゃれで落ち着いた響きになる',
  '♭♭7': '7番目の音を半音2つ下げた音。鍵盤は6番目と同じだが、7番目を下げたものとして数える',
  '9':  '1オクターブ上の2番目の音。透明感が加わる',
  '11': '1オクターブ上の4番目の音。浮遊感のある不思議さ',
  '13': '1オクターブ上の6番目の音。大人っぽく豊かになる'
};

/** 度数ラベル（'♭3' など）→ 日本語の意味。未知のものは空文字 */
export function degreeMeaning(label) {
  return DEGREE_MEANING[label] ?? '';
}

/** 度数の並びをまとめて日本語にする（ツールチップ用） */
export function degreeMeaningList(rootPc, type, tensions = [], keyPc = undefined) {
  return chordSpelling(rootPc, type, tensions, keyPc)
    .map(s => `${s.name}（${s.degreeLabel}）… ${degreeMeaning(s.degreeLabel)}`)
    .join('\n');
}
