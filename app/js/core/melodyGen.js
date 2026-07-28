// ========================================
// melodyGen.js - 「おまかせメロディ」生成エンジン
//
// 旧実装（composePage.js の autoMelody）は
//   コードの構成音を通し番号で順番に取り出すだけの上昇アルペジオで、
//   ・乱数がないので毎回まったく同じ結果
//   ・全音符が1カウント固定でリズムがない
//   ・跳躍制御も終止感もない
// という状態だった。ここでは「型(style)」を選べるようにし、
// 同じ型でも押すたびに違う結果になるよう乱数を入れる。
//
// DOM・Audio に依存しない純粋ロジック（Nodeでテスト可能）。
// ========================================

import { CHORD_INTERVALS } from './musicTheory.js';

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

/** 選べる生成スタイル（UIのタブ表示にそのまま使う） */
export const MELODY_STYLES = [
  { id: 'repeat',   label: 'くりかえし', desc: '同じ形を繰り返す。覚えやすくてサビ向き' },
  { id: 'arc',      label: '起承転結',   desc: 'だんだん上がって、最後にすとんと着地する' },
  { id: 'smooth',   label: 'なめらか',   desc: 'となりの音へ少しずつ動く。歌いやすい' },
  { id: 'rhythmic', label: 'はずむ',     desc: '長短をまぜて、跳ねるように動く' }
];

// スタイルごとの設定
//   pool:         使う音符の長さ（カウント）の候補
//   chordToneProb: 拍の頭以外でもコード構成音を選ぶ確率（低いほど経過音が増える）
//   restProb:     休符になる確率
//   mode:         音高の決め方 'motif' | 'arc' | 'smooth' | 'leap'
const STYLE_CFG = {
  repeat:   { pool: [1, 1, 2, 0.5], chordToneProb: 0.75, restProb: 0.05, mode: 'motif' },
  arc:      { pool: [1, 1, 2],      chordToneProb: 0.55, restProb: 0.08, mode: 'arc' },
  smooth:   { pool: [1, 2, 2],      chordToneProb: 0.5,  restProb: 0.04, mode: 'smooth' },
  rhythmic: { pool: [0.5, 0.5, 1, 1, 1.5], chordToneProb: 0.65, restProb: 0.12, mode: 'leap' }
};

// ---------- 音階・音高のヘルパー ----------

/** キーのメジャースケールのピッチクラス配列 */
export function scalePcsOf(keyPc) {
  return MAJOR_SCALE.map(o => (keyPc + o) % 12);
}

/** コードの構成音ピッチクラス */
function chordTonePcs(ev) {
  return [...new Set((CHORD_INTERVALS[ev.type] || [0]).map(i => (ev.rootPc + i) % 12))];
}

/** スケール上の通し番号 → MIDI（index 0 = キーのルートの C4 相当オクターブ） */
function fromScaleIndex(i, keyPc) {
  const oct = Math.floor(i / 7);
  const deg = ((i % 7) + 7) % 7;
  return keyPc + 12 * (oct + 5) + MAJOR_SCALE[deg];
}

/** MIDI → いちばん近いスケール上の通し番号 */
function toScaleIndex(midi, keyPc) {
  let best = 0, bd = Infinity;
  for (let i = -21; i <= 21; i++) {
    const d = Math.abs(fromScaleIndex(i, keyPc) - midi);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** 候補ピッチクラスのうち、target にいちばん近い MIDI を音域内から選ぶ */
function pickNear(pcs, target, range) {
  let best = null, bd = Infinity;
  for (const pc of pcs) {
    for (let m = range.low; m <= range.high; m++) {
      if (((m % 12) + 12) % 12 !== pc) continue;
      const d = Math.abs(m - target);
      if (d < bd) { bd = d; best = m; }
    }
  }
  return best ?? clamp(target, range);
}

function clamp(m, range) { return Math.max(range.low, Math.min(range.high, m)); }

// ---------- リズム ----------

/** 長さ L カウントを、pool の音価で埋めるリズムを作る */
function makeRhythm(L, pool, rng) {
  const out = [];
  let rest = round(L);
  let guard = 0;
  while (rest > 0.001 && guard++ < 64) {
    const opts = pool.filter(d => d <= rest + 0.001);
    const d = opts.length ? opts[Math.floor(rng() * opts.length)] : rest;
    out.push(round(d));
    rest = round(rest - d);
  }
  return out.length ? out : [round(L)];
}

/** できあがったリズムを、別の長さ L に当てはめ直す（くりかえし用） */
function fitRhythm(base, L) {
  const out = [];
  let s = 0, i = 0, guard = 0;
  while (s < L - 0.001 && guard++ < 64) {
    let d = base[i % base.length];
    if (s + d > L) d = round(L - s);
    out.push(round(d));
    s = round(s + d);
    i++;
  }
  return out.length ? out : [round(L)];
}

const round = (n) => Math.round(n * 1000) / 1000;

// ---------- 本体 ----------

/**
 * コード進行にのせるメロディを生成する。
 * @param {object} opts
 *   chords: [{ rootPc, type, startCount, lengthCount }]  コードトラック
 *   keyPc:  キーのピッチクラス
 *   style:  MELODY_STYLES の id
 *   rng:    乱数関数（既定 Math.random。テストでは固定値を渡せる）
 *   range:  メロディの音域 { low, high }（MIDI）
 * @returns [{ rootPc, octave, startCount, lengthCount }] — そのまま addEvent に渡せる形
 */
export function generateMelody({
  chords, keyPc = 0, style = 'arc', rng = Math.random,
  range = { low: 64, high: 84 }
} = {}) {
  if (!chords || chords.length === 0) return [];
  const cfg = STYLE_CFG[style] ?? STYLE_CFG.arc;
  const sorted = [...chords].sort((a, b) => a.startCount - b.startCount);
  const scale = scalePcsOf(keyPc);

  // --- 1) リズムを決める ---
  const rhythms = [];
  sorted.forEach((c, i) => {
    if (cfg.mode === 'motif' && i > 0) rhythms.push(fitRhythm(rhythms[0], c.lengthCount));
    else rhythms.push(makeRhythm(c.lengthCount, cfg.pool, rng));
  });

  // --- 2) 音を置くスロットに展開する ---
  const slots = [];
  sorted.forEach((c, ci) => {
    let t = c.startCount;
    rhythms[ci].forEach((len, k) => {
      slots.push({ chord: c, ci, k, start: round(t), len });
      t = round(t + len);
    });
  });
  if (slots.length === 0) return [];

  // --- 3) 音高を決める ---
  const midis = cfg.mode === 'motif'
    ? motifPitches(slots, scale, keyPc, range, rng, cfg)
    : freePitches(slots, scale, keyPc, range, rng, cfg);

  // --- 4) 終止：最後の音はキーのトニックに着地させる（「終わった感」を出す） ---
  const lastIdx = slots.length - 1;
  midis[lastIdx] = pickNear([keyPc], midis[lastIdx > 0 ? lastIdx - 1 : 0] - 1, range);

  // --- 5) 休符を間引く（最初と最後は必ず残す） ---
  const out = [];
  slots.forEach((s, i) => {
    const isEdge = i === 0 || i === lastIdx;
    if (!isEdge && rng() < cfg.restProb) return;
    const m = clamp(midis[i], range);
    out.push({
      rootPc: ((m % 12) + 12) % 12,
      octave: Math.floor(m / 12) - 1,
      startCount: s.start,
      lengthCount: s.len
    });
  });
  return out;
}

/** 起承転結／なめらか／はずむ の音高決定 */
function freePitches(slots, scale, keyPc, range, rng, cfg) {
  const midis = [];
  const span = range.high - range.low;
  let prev = null;

  slots.forEach((s, i) => {
    const tones = chordTonePcs(s.chord);
    // 拍の頭・コードの頭はコード構成音を優先し、それ以外は確率でスケール音（経過音）を混ぜる
    const onChordHead = s.k === 0;
    const useChordTone = onChordHead || rng() < cfg.chordToneProb;
    const pool = useChordTone ? tones : scale;

    let target;
    if (cfg.mode === 'arc') {
      // 全体を通して、ゆるやかに上がって下りてくる弧を描く
      const prog = slots.length > 1 ? i / (slots.length - 1) : 0;
      const shape = Math.sin(Math.PI * Math.min(1, prog * 1.12));
      const jitter = (rng() - 0.5) * 3;
      target = range.low + 3 + shape * (span - 7) + jitter;
    } else if (cfg.mode === 'smooth') {
      // 直前の音のとなりへ。跳んでも3半音まで
      const step = (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 3));
      target = (prev ?? (range.low + span / 2)) + step;
    } else { // leap
      // 跳ねる：2〜7半音の跳躍。音域の端では内側へ折り返す
      const base = prev ?? (range.low + span / 2);
      let dir = rng() < 0.5 ? -1 : 1;
      if (base > range.high - 4) dir = -1;
      if (base < range.low + 4) dir = 1;
      target = base + dir * (2 + Math.floor(rng() * 6));
    }

    let m = pickNear(pool, clamp(target, range), range);
    // 同じ音が3回続いたら、となりのスケール音へずらして単調さを避ける
    if (i >= 2 && m === midis[i - 1] && m === midis[i - 2]) {
      m = pickNear(scale, m + (rng() < 0.5 ? -2 : 2), range);
    }
    midis.push(m);
    prev = m;
  });
  return midis;
}

/** くりかえし：最初のコードで作った「形」を、以降のコードにも当てはめる */
function motifPitches(slots, scale, keyPc, range, rng, cfg) {
  // 最初のコードぶんのスロット
  const first = slots.filter(s => s.ci === slots[0].ci);
  const seed = freePitches(first, scale, keyPc, range, rng, { ...cfg, mode: 'smooth' });

  // 形を「スケール上の段差」として取り出す（キー内なので移調しても崩れない）
  const idx = seed.map(m => toScaleIndex(m, keyPc));
  const deltas = idx.slice(1).map((v, i) => v - idx[i]);

  const midis = [];
  let ci = null, cur = 0;
  slots.forEach((s, i) => {
    if (s.ci !== ci) {
      // コードが変わったら、そのコードの構成音から仕切り直す（形は保ったまま音は和音に合わせる）
      ci = s.ci;
      const anchor = pickNear(chordTonePcs(s.chord), midis.length ? midis[midis.length - 1] : range.low + 10, range);
      cur = toScaleIndex(anchor, keyPc);
      midis.push(clamp(anchor, range));
      return;
    }
    const d = deltas[(i - 1) % Math.max(1, deltas.length)] ?? 1;
    cur += d;
    midis.push(clamp(fromScaleIndex(cur, keyPc), range));
  });
  return midis;
}
