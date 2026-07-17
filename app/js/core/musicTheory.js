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

/** MIDI番号 → 音名（例: 60 → 'C4'） */
export function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_LETTERS[midi % 12] + octave;
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
export function chordDisplayName(rootPc, type, tensions = []) {
  const root = NOTE_LETTERS[rootPc];
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
    if (type === 'major' || type === '7') name = root + ext;             // C9, D13
    else if (type === 'maj7') name = `${root}maj${ext}`;                 // Cmaj9
    else if (type === 'minor' || type === 'm7') name = `${root}m${ext}`; // Cm9
    else name = `${root}${base}(${ext}th)`;                              // sus4等はそのまま併記
  } else {
    name = root + base;
  }

  const has6 = t.delete('6');
  const hasAdd9 = t.delete('add9');
  if (has6 && hasAdd9 && !ext) {
    name += '6/9'; // シックスナインス
  } else {
    if (has6) name += ext ? '(6)' : '6';
    if (hasAdd9) name += (type === 'minor' ? '(add9)' : 'add9');
  }

  // 将来のテンション追加用フォールバック
  if (t.size) name += `(${[...t].map(x => TENSIONS[x]?.label ?? x).join(',')})`;
  return name;
}
