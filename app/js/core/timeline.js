// ========================================
// timeline.js - 作曲タイムラインの状態ロジック（④基盤・Step1）
// chord / melody / bass の3トラックを純粋データとして管理する。
// DOM・Audioに依存しない（Nodeでテスト可能）。描画は ui/pianoRoll.js が担当。
// ========================================

import { buildChord, pcToMidi } from './musicTheory.js';

export const TRACKS = ['chord', 'melody', 'bass'];
export const TRACK_LABELS = { chord: 'コード', melody: 'メロディ', bass: 'ベース' };
export const DEFAULT_OCTAVE = { chord: 4, melody: 5, bass: 2 };

/** 空のタイムラインを作る */
export function createTimeline() {
  return { chord: [], melody: [], bass: [] };
}

/** トラックの終端カウント（次のイベントの自動配置位置） */
export function trackEnd(events) {
  return events.reduce((m, e) => Math.max(m, e.startCount + e.lengthCount), 0);
}

/** タイムライン全体の終端カウント */
export function timelineEnd(tl) {
  return Math.max(...TRACKS.map(t => trackEnd(tl[t])));
}

// イベントの一意なid採番（配列の並び替えに影響されない選択・参照のため）
let nextEventId = 1;

/**
 * イベントを追加する。startCount 省略時はトラック終端に自動配置。
 * chordトラック: { rootPc, type, octave, startCount, lengthCount }
 * melody/bass:  単音。type は 'none' 固定
 */
export function addEvent(tl, track, { rootPc, type = 'none', octave, startCount, lengthCount = 2, tensions = [], voicing = 'root', isRest = false }) {
  const ev = {
    id: nextEventId++,
    rootPc,
    type: track === 'chord' ? type : 'none',
    // 休符（無音で時間だけ占める）。コードトラックのみ。
    isRest: track === 'chord' ? !!isRest : false,
    // テンション（add9/9th等）は chord トラックのみ保持。単音トラックは常に空。
    tensions: track === 'chord' ? [...tensions] : [],
    // ボイシング（転回形・開離）も chord トラックのみ
    voicing: track === 'chord' ? voicing : 'root',
    octave: octave ?? DEFAULT_OCTAVE[track],
    startCount: startCount ?? trackEnd(tl[track]),
    lengthCount
  };
  tl[track].push(ev);
  return ev;
}

/** 既存のイベント風オブジェクトにidを付与する（プリセット読み込みなど addEvent を経由しない場合用） */
export function withId(ev) {
  return { id: nextEventId++, ...ev };
}

/** idからイベントを探す */
export function findEvent(tl, track, id) {
  return tl[track].find(e => e.id === id);
}

/** idでイベントを削除する */
export function removeEvent(tl, track, id) {
  const i = tl[track].findIndex(e => e.id === id);
  if (i >= 0) tl[track].splice(i, 1);
}

/** トラック内のイベントを開始位置（左から）順に並べ替える。表示・判定を常に時系列に保つため。 */
export function sortTrack(tl, track) {
  tl[track].sort((a, b) => a.startCount - b.startCount);
}

/** 休符かどうか。休符は「鳴らない・和音として数えない」が、長さぶんの時間は占める。 */
export function isRest(ev) {
  return ev?.isRest === true;
}

/** 休符を除いた、実際に鳴るコードだけを返す（解析・提案・ベース生成はこちらを使う） */
export function soundingChords(tl) {
  return tl.chord.filter(ev => !isRest(ev));
}

/**
 * コードトラックを「配列の並び順どおりに、隙間なく」並べ直す。
 * 長さ変更・並び替え・休符の挿入/削除のあとは必ずこれを通す。
 * startCount を配列順から機械的に決めるので、重なりや隙間が原理的に発生しない。
 * @returns {number} 並べ終わった位置（＝コードトラックの終端カウント）
 */
export function relayoutChords(tl, startAt = 0) {
  let t = startAt;
  for (const ev of tl.chord) {
    ev.startCount = t;
    t += ev.lengthCount;
  }
  return t;
}

/**
 * トラック内のイベントを配列上の別の位置へ動かす（並び替え）。
 * 位置そのもの（startCount）は変えないので、コードトラックでは
 * このあと relayoutChords() を呼んで並べ直すこと。
 * @returns {boolean} 実際に動いたか
 */
export function reorderEvent(tl, track, id, newIndex) {
  const arr = tl[track];
  const from = arr.findIndex(e => e.id === id);
  if (from < 0) return false;
  const to = Math.max(0, Math.min(newIndex, arr.length - 1));
  if (from === to) return false;
  const [ev] = arr.splice(from, 1);
  arr.splice(to, 0, ev);
  return true;
}

/** イベントの長さを直接指定する（最小0.5カウント） */
export function setEventLength(ev, lengthCount) {
  ev.lengthCount = Math.max(0.5, lengthCount);
  return ev.lengthCount;
}

/** イベントの構成音（MIDI配列）を返す。休符は音を持たないので空配列。 */
export function eventMidi(track, ev) {
  if (isRest(ev)) return [];
  if (track === 'chord') {
    return buildChord({
      rootPc: ev.rootPc, type: ev.type, octave: ev.octave,
      tensions: ev.tensions ?? [], voicing: ev.voicing ?? 'root'
    }).midi;
  }
  return [pcToMidi(ev.rootPc, ev.octave)];
}

/** イベントを semitones 半音だけ移調する（オクターブ繰り上がり/下がり対応） */
export function transposeEvent(ev, semitones) {
  const m = pcToMidi(ev.rootPc, ev.octave) + semitones;
  ev.rootPc = ((m % 12) + 12) % 12;
  ev.octave = Math.floor(m / 12) - 1;
}

/** イベントの開始位置を deltaCount ずらす（0未満にはならない） */
export function moveEvent(ev, deltaCount) {
  ev.startCount = Math.max(0, ev.startCount + deltaCount);
}

/** イベントの長さを deltaCount 増減させる（最小0.5カウント） */
export function resizeEvent(ev, deltaCount) {
  ev.lengthCount = Math.max(0.5, ev.lengthCount + deltaCount);
}

/** イベントの左端（開始位置）をdeltaCountだけ動かし、長さを逆方向に調整する（0未満・0.5未満にはならない） */
export function trimStart(ev, deltaCount) {
  const maxTrim = ev.lengthCount - 0.5;   // これ以上右に削ると長さが0.5を割る
  const minTrim = -ev.startCount;         // これ以上左に削ると開始位置が0を割る
  const clamped = Math.max(minTrim, Math.min(deltaCount, maxTrim));
  ev.startCount += clamped;
  ev.lengthCount -= clamped;
}

/**
 * audioEngine.playTracks() にそのまま渡せる形式へ変換する（Step1の核）。
 * 空トラックは除外。instruments = { chord, melody, bass } で音色を指定。
 */
export function toPlayableTracks(tl, instruments = {}) {
  return TRACKS.filter(t => tl[t].length > 0).map(t => ({
    instrument: instruments[t] ?? 'acoustic_grand_piano',
    gain: t === 'bass' ? 1.15 : t === 'chord' ? 0.9 : 1,
    // 休符は midi が空になるので、再生イベントからは落とす（時間だけは既に確保済み）
    events: tl[t].map(ev => ({
      midi: eventMidi(t, ev),
      startCount: ev.startCount,
      lengthCount: ev.lengthCount
    })).filter(e => e.midi.length > 0)
  })).filter(tr => tr.events.length > 0);
}

/**
 * ピアノロール表示用の固定音域（88鍵ピアノに合わせてA0(21)〜C8(108)）。
 * ノート内容に応じて表示範囲が変わる（pitchRange）と、コードを追加するたびに
 * 既存ノートの行位置ごと動いて画面がズレて見えるため、描画にはこちらの
 * データに依存しない固定範囲を使う。
 */
export function fixedPitchRange() {
  return { low: 21, high: 108 };
}

/** （現在ピアノロール描画では未使用・後方互換のため残置）ノート内容から音高範囲（MIDI）を計算する */
export function pitchRange(tl, pad = 2) {
  let lo = Infinity, hi = -Infinity;
  for (const t of TRACKS) {
    for (const ev of tl[t]) {
      for (const m of eventMidi(t, ev)) {
        if (m < lo) lo = m;
        if (m > hi) hi = m;
      }
    }
  }
  if (lo === Infinity) return { low: 48, high: 83 }; // 空ならC3〜B5
  lo -= pad; hi += pad;
  while (hi - lo < 48) { lo--; hi++; } // 最低でも4オクターブ分は確保（少数の音でギュッと縮まないように）
  return { low: lo, high: hi };
}
