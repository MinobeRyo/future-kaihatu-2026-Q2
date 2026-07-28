// ========================================
// suggest.js - 「次はどの音を置く？」の提案ロジック
//
// ドレミボタンの「光る＝コードに合う音」は合う/合わないの2値しかなかった。
// ここでは カーソル位置のコード・直前の音・キー から、
// 「盛り上げたいならこの音」「締めたいならこの音」といった
// 役割つきの候補を数個返す。
//
// 各役割は「候補MIDIの優先順リスト」を持つ。先に採用された音とかぶった場合は
// 次点へ繰り下がるので、必ず役割ぶんの提案が出そろう。
//
// DOM・Audio に依存しない純粋ロジック（Nodeでテスト可能）。
// ========================================

import { CHORD_INTERVALS, midiDisplayName, chordDisplayName, degreeToRoman } from './musicTheory.js';
import { scalePcsOf } from './melodyGen.js';

const DOREMI_LABEL = { 0: 'ド', 2: 'レ', 4: 'ミ', 5: 'ファ', 7: 'ソ', 9: 'ラ', 11: 'シ' };

/** キーからの相対位置でドレミ名を返す（キー外の音は null） */
export function doremiOf(pc, keyPc) {
  const off = ((pc - keyPc) % 12 + 12) % 12;
  return DOREMI_LABEL[off] ?? null;
}

function chordTonePcs(ev) {
  if (!ev) return [];
  return [...new Set((CHORD_INTERVALS[ev.type] || [0]).map(i => (ev.rootPc + i) % 12))];
}

/**
 * 音域内にある「候補ピッチクラスのMIDI」を、target に近い順で列挙する。
 * dir: +1 なら target より上だけ / -1 なら下だけ / 0 なら両方
 */
function nearList(pcs, target, range, dir = 0) {
  const out = [];
  for (let m = range.low; m <= range.high; m++) {
    if (!pcs.includes(((m % 12) + 12) % 12)) continue;
    if (dir > 0 && m <= target) continue;
    if (dir < 0 && m >= target) continue;
    out.push(m);
  }
  return out.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
}

/** カウント位置にかかっているコードを返す */
export function chordAtCount(chords, count) {
  const sorted = [...(chords ?? [])].sort((a, b) => a.startCount - b.startCount);
  if (sorted.length === 0) return null;
  return sorted.find(c => count >= c.startCount && count < c.startCount + c.lengthCount)
    ?? sorted[sorted.length - 1];
}

/** 候補リストの先頭から、まだ使われていない音を1つ採用する */
function push(arr, meta, candidates) {
  const used = new Set(arr.map(a => a.midi));
  const midi = candidates.find(m => m != null && !used.has(m));
  if (midi == null) return;
  arr.push({ ...meta, midi });
}

function decorate(s, keyPc, tones) {
  const pc = ((s.midi % 12) + 12) % 12;
  return {
    ...s,
    noteName: midiDisplayName(s.midi, keyPc),
    doremi: doremiOf(pc, keyPc),
    isChordTone: tones.includes(pc)
  };
}

function isLastChord(chords, chord) {
  if (!chords || chords.length === 0) return false;
  const end = Math.max(...chords.map(c => c.startCount + c.lengthCount));
  return chord.startCount + chord.lengthCount >= end;
}

/**
 * メロディの「次の音」候補を提案する。
 * @param {object} opts
 *   chords:      コードトラック
 *   keyPc:       キーのピッチクラス
 *   cursorCount: 次に音を置く位置（カウント）
 *   prevMidi:    直前の音のMIDI（無ければ null）
 *   range:       音域 { low, high }
 * @returns [{ role, label, hint, midi, noteName, doremi, isChordTone }]
 */
export function suggestMelodyNotes({
  chords, keyPc = 0, cursorCount = 0, prevMidi = null, range = { low: 64, high: 84 }
} = {}) {
  const chord = chordAtCount(chords, cursorCount);
  if (!chord) return [];
  const tones = chordTonePcs(chord);
  const scale = scalePcsOf(keyPc);
  const ref = prevMidi ?? (range.low + 8);
  const last = isLastChord(chords, chord);
  const out = [];

  // ① 盛り上げる：直前より上のコード構成音 → 届かなければ9th → それも無ければ上のスケール音
  push(out, {
    role: 'lift',
    label: '盛り上げたいなら',
    hint: '直前より高いコードの音。ここから上へ開いていく感じになります'
  }, [
    ...nearList(tones, ref, range, +1),
    ...nearList([(chord.rootPc + 2) % 12], ref, range, +1),
    ...nearList(scale, ref, range, +1)
  ]);

  // ② 締める：キーのトニック。低めに取るほど「終わった」感じが強い
  push(out, {
    role: 'settle',
    label: '締めたいなら',
    hint: last
      ? 'キーのド。最後の音にすると、きれいに終わります'
      : 'キーのド。いったん落ち着かせたいときに'
  }, [
    ...nearList([keyPc], ref, range, -1),
    ...nearList([keyPc], ref, range),
    ...nearList([chord.rootPc], ref, range)
  ]);

  // ③ なめらか：直前のとなりのスケール音。コード構成音になるものを優先
  const steps = nearList(scale, ref, range).filter(m => m !== ref && Math.abs(m - ref) <= 2);
  steps.sort((a, b) => {
    const ta = tones.includes(((a % 12) + 12) % 12) ? 0 : 1;
    const tb = tones.includes(((b % 12) + 12) % 12) ? 0 : 1;
    return ta - tb || Math.abs(a - ref) - Math.abs(b - ref);
  });
  push(out, {
    role: 'step',
    label: 'なめらかにつなぐなら',
    hint: 'となりの音へ動くだけ。いちばん歌いやすく、外しにくい選択です'
  }, [...steps, ...nearList(scale, ref, range)]);

  // ④ 意外性：スケール内だがコードに含まれない音（テンション・経過音）
  const colorPcs = scale.filter(pc => !tones.includes(pc));
  push(out, {
    role: 'color',
    label: '意外性がほしいなら',
    hint: 'コードには入っていないキー内の音。少し引っかかる、味のある響きになります'
  }, [...nearList(colorPcs, ref, range), ...nearList(scale, ref, range)]);

  return out.map(s => decorate(s, keyPc, tones));
}

/**
 * ベースの「次の音」候補を提案する（レイヤーがベースのとき用）。
 */
export function suggestBassNotes({
  chords, keyPc = 0, cursorCount = 0, prevMidi = null, range = { low: 40, high: 60 }
} = {}) {
  const sorted = [...(chords ?? [])].sort((a, b) => a.startCount - b.startCount);
  const chord = chordAtCount(sorted, cursorCount);
  if (!chord) return [];
  const tones = chordTonePcs(chord);
  const ref = prevMidi ?? (range.low + 8);
  const next = sorted.find(c => c.startCount > cursorCount);
  const out = [];

  // ① ルート：ベースの基本
  push(out, {
    role: 'settle',
    label: '安定させるなら',
    hint: 'コードのルート。ベースの基本はこれ。迷ったらルートで大丈夫です'
  }, [...nearList([chord.rootPc], ref, range)]);

  // ② 5度：ルートと交互に置くと前へ進む
  push(out, {
    role: 'lift',
    label: '力強くするなら',
    hint: 'コードの5度。ルートと交互に置くと、どっしり前へ進みます'
  }, [...nearList([(chord.rootPc + 7) % 12], ref, range), ...nearList(tones, ref, range)]);

  // ③ 次のコードへのアプローチノート（半音下からすべり込む）
  if (next) {
    push(out, {
      role: 'color',
      label: '次へつなぐなら',
      hint: '次のコードのルートの半音下。すべり込むように次のコードへ入れます'
    }, [
      ...nearList([(next.rootPc + 11) % 12], ref, range),
      ...nearList([(next.rootPc + 1) % 12], ref, range)
    ]);
  }

  // ④ 3度：ベースが歌い出す
  push(out, {
    role: 'step',
    label: '動きを出すなら',
    hint: 'コードの3度。ベースが歌い出して、進行がなめらかになります'
  }, [...nearList([tones[1] ?? chord.rootPc], ref, range), ...nearList(tones, ref, range)]);

  return out.map(s => decorate(s, keyPc, tones));
}

// ============================================================
// 次の「コード」の提案
// ============================================================
// メロディと同じ考え方をコード進行にも適用する。
// 機能和声（トニック/サブドミナント/ドミナント）の定番の流れを表で持ち、
// 「自然につなぐ／盛り上げる／締める／意外性」の4役割で候補を出す。

/** メジャーキーのダイアトニック：キーからの半音オフセット → クオリティ */
const DIATONIC_MAP = { 0: 'major', 2: 'minor', 4: 'minor', 5: 'major', 7: 'major', 9: 'minor', 11: 'dim' };

/** 定番の進行先（左から順に「よくある」順）。キーはキーからの半音オフセット */
const NEXT_TABLE = {
  0:  [[5, 'major'], [7, 'major'], [9, 'minor'], [2, 'minor']],   // I  → IV V VIm IIm
  2:  [[7, 'major'], [0, 'major'], [11, 'dim']],                  // IIm→ V I VIIdim
  4:  [[9, 'minor'], [5, 'major'], [2, 'minor']],                 // IIIm→ VIm IV IIm
  5:  [[7, 'major'], [0, 'major'], [2, 'minor'], [9, 'minor']],   // IV → V I IIm VIm
  7:  [[0, 'major'], [9, 'minor'], [5, 'major']],                 // V  → I VIm(偽終止) IV
  9:  [[5, 'major'], [2, 'minor'], [7, 'major'], [0, 'major']],   // VIm→ IV IIm V I
  11: [[0, 'major'], [4, 'minor']]                                // VIIdim→ I IIIm
};

/** 借用和音（同主短調から借りる）— 意外性担当 */
const BORROWED = [
  [5, 'minor', 'サブドミナントマイナー。ふっと影が差して、切なさが出ます'],
  [10, 'major', 'bVII。キー外だけど明るく力強い。ロックでよく使われます'],
  [8, 'major', 'bVI。別の世界へ飛ぶような、ドラマチックな響きです'],
  [3, 'major', 'bIII。意外性が強く、転調のきっかけにもなります']
];

const DOM_LIKE = new Set(['7', '7sus4']);

/**
 * どの役割でも最後に使える予備の候補（ダイアトニックをよく使う順に）。
 * 上位候補が「同じコード」「堂々めぐり」で弾かれても、
 * 提案が空にならないようにするための受け皿。
 */
const FALLBACK = [
  [5, 'major', 'IV。明るく広がるサブドミナント。どこからでも自然に入れます'],
  [7, 'major', 'V。Iへ帰りたい力を持つドミナント。次への推進力が出ます'],
  [9, 'minor', 'VIm。Iと似た安定感なのに、影のある響きになります'],
  [2, 'minor', 'IIm。Vの前によく置かれる、やわらかいサブドミナントです'],
  [0, 'major', 'I。キーの「家」。いったん落ち着かせられます'],
  [4, 'minor', 'IIIm。少し切なく、次への渡りに使いやすいコードです']
];

function toOff(rootPc, keyPc) { return ((rootPc - keyPc) % 12 + 12) % 12; }
const sameChord = (a, b) => !!a && !!b && a.rootPc === b.rootPc && a.type === b.type;

/**
 * その候補を「次のコード」として出してはいけないか判定する。
 * 提案ボタンを押し続けたときに行き止まりにならないための歯止め。
 *   ① 今鳴っているコードと同じルート → 進んでいないので「次」ではない
 *      （7th/9thを足したいときは、カードを選んでトグルで足す導線がある）
 *   ② 直前3つが A-B-A のときに B を出す → A-B-A-B の堂々めぐりになる
 */
function isBlocked(sorted, last, rootPc, type) {
  if (last && rootPc === last.rootPc) return true;
  const n = sorted.length;
  if (n >= 3) {
    const [a, b, c] = [sorted[n - 3], sorted[n - 2], sorted[n - 1]];
    if (sameChord(a, c) && b.rootPc === rootPc && b.type === type) return true;
  }
  return false;
}

/**
 * 候補から、まだ採用していないものを1つ選んで積む。
 * 候補は [off, type, hint] の三つ組。説明(hint)は候補ごとに持たせる——
 * 第1候補が他の役割とかぶって次点に繰り下がったとき、
 * 説明文だけ第1候補のまま残ってしまう食い違いを防ぐため。
 */
function pushChord(arr, meta, candidates, keyPc, ctx = {}) {
  const { sorted = [], last = null } = ctx;
  const used = new Set(arr.map(a => `${a.rootPc}:${a.type}`));
  for (const c of candidates) {
    if (!c) continue;
    const [off, type, hint] = c;
    const rootPc = ((keyPc + off) % 12 + 12) % 12;
    if (used.has(`${rootPc}:${type}`)) continue;
    if (isBlocked(sorted, last, rootPc, type)) continue;
    arr.push({
      ...meta,
      hint: hint ?? meta.hint ?? '',
      rootPc,
      type,
      degree: degreeToRoman(off, type),
      name: chordDisplayName(rootPc, type)
    });
    return;
  }
}

/**
 * 次に置くコードの候補を提案する。
 * @param {object} opts
 *   chords: コードトラック（空なら「出だし」の提案を返す）
 *   keyPc:  キーのピッチクラス
 * @returns [{ role, label, hint, rootPc, type, degree, name }]
 */
export function suggestNextChords({ chords, keyPc = 0 } = {}) {
  const sorted = [...(chords ?? [])].sort((a, b) => a.startCount - b.startCount);
  const last = sorted[sorted.length - 1];
  const out = [];

  // --- コードがまだ無い場合は「出だし」の提案 ---
  if (!last) {
    pushChord(out, {
      role: 'flow', label: 'まずはここから',
      hint: 'キーのI。いちばん安定していて、曲の「家」になるコードです'
    }, [[0, 'major']], keyPc);
    pushChord(out, {
      role: 'color', label: 'せつなく始めるなら',
      hint: 'VIm。Iと同じ音を多く含むのに、影のある響きで始められます'
    }, [[9, 'minor']], keyPc);
    pushChord(out, {
      role: 'lift', label: 'ふわっと始めるなら',
      hint: 'IV。宙に浮いたまま始まる感じ。サビ始まりの曲に多い形です'
    }, [[5, 'major']], keyPc);
    pushChord(out, {
      role: 'settle', label: 'おしゃれに始めるなら',
      hint: 'Imaj7。Iに4つ目の音を重ねた、やわらかく都会的な響きです'
    }, [[0, 'maj7']], keyPc);
    return out;
  }

  const off = toOff(last.rootPc, keyPc);
  const lastName = chordDisplayName(last.rootPc, last.type, last.tensions);
  const lastDeg = degreeToRoman(off, last.type);
  const isDom = DOM_LIKE.has(last.type);
  // ドミナント7thは「4度上へ進む」力がいちばん強い（セカンダリドミナントもこの規則）
  const resolveOff = (off + 5) % 12;
  const resolveType = DIATONIC_MAP[resolveOff] ?? 'major';
  const table = NEXT_TABLE[off] ?? [[0, 'major'], [5, 'major'], [7, 'major']];
  // 進行表の候補には「◯◯ → ◯◯ は定番」という説明を自動で付ける
  const flowTable = table.map(([o, t]) =>
    [o, t, `${lastDeg} → ${degreeToRoman(o, t)}。${lastDeg} のあとによくある定番の流れです`]);
  const ctx = { sorted, last };

  // ① 自然につなぐ：定番の進行表（ドミナント7thなら4度上への解決を最優先）
  pushChord(out, { role: 'flow', label: '自然につなぐなら' }, isDom
    ? [[resolveOff, resolveType,
        `${lastName} はドミナント7th。4度上の ${chordDisplayName((last.rootPc + 5) % 12, resolveType)} へ進むと、いちばん気持ちよく決まります`],
       ...flowTable, ...FALLBACK]
    : [...flowTable, ...FALLBACK], keyPc, ctx);

  // ② 盛り上げる：Iへ帰る力の強いV7。すでにV上なら偽終止のVImで期待を裏切る
  pushChord(out, { role: 'lift', label: '盛り上げたいなら' }, (off === 7
    ? [[9, 'minor', 'VIm。Iへ行くと思わせて外す「偽終止」。曲がまだ続く感じになります'],
       [5, 'major', 'IV。Vから戻って、もう一度盛り上がりを作り直せます'],
       [4, '7', 'V7/VI。VImへ強く引っぱって、切なさを足しながら展開できます']]
    : [[7, '7', 'V7。Iへ帰りたい力がいちばん強いコード。サビ前に置くと効きます'],
       [7, 'major', 'V。Iへ帰りたい力が強く、次への期待を作ります'],
       [2, '7', 'V7/V。Vの直前に置くと、そこからサビへ一気に持ち上がります'],
       [4, '7', 'V7/VI。VImへ強く引っぱって、切なさを足しながら展開できます']]
  ).concat(FALLBACK), keyPc, ctx);

  // ③ 締める：トニックI。すでにI上なら、IVから戻る「アーメン終止」を提案
  pushChord(out, { role: 'settle', label: '締めたいなら' }, (off === 0
    ? [[5, 'major', 'IV。ここからIへ戻すと、賛美歌のように穏やかに終われます'],
       [9, 'minor', 'VIm。明るく終わりきらず、少し切ない余韻を残せます'],
       [2, 'minor', 'IIm。いったん力を抜いて、次のひと区切りに向かえます']]
    : [[0, 'major', 'I。キーの「家」に帰ります。曲の終わりや、ひと区切りに'],
       [9, 'minor', 'VIm。完全には終わらせず、余韻を残したいときに'],
       [5, 'major', 'IV。Iへ戻る一歩手前。穏やかに着地できます']]
  ).concat(FALLBACK), keyPc, ctx);

  // ④ 意外性：借用和音、またはセカンダリドミナント
  const secondary = [];
  for (const [nOff] of table) {
    if (DIATONIC_MAP[nOff] === undefined) continue;
    const domOff = (nOff + 7) % 12;          // その行き先の5度上＝セカンダリドミナント
    secondary.push([domOff, '7',
      `セカンダリドミナント。${degreeToRoman(nOff, DIATONIC_MAP[nOff])} へ強引に引っぱって、展開を作ります`]);
  }
  pushChord(out, { role: 'color', label: '意外性がほしいなら' },
    [...BORROWED, ...secondary, ...FALLBACK], keyPc, ctx);

  return out;
}
