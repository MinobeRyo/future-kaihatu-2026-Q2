// ========================================
// audioEngine.js - 再生エンジン（全ページ共通・唯一の実装）
// 旧アプリの問題への対策:
//   - stopPlayback が効かない → 発音ノードを保持して確実に stop()
//   - setTimeout ベースでテンポが揺れる → AudioContext.currentTime 基準で事前スケジュール
//   - 1トラックしか再生できない → 複数トラック同時スケジュールを標準化
// Soundfont(soundfont-player CDN) がグローバルにある前提。ブラウザ専用モジュール。
// ========================================

import { midiToNoteName } from './musicTheory.js';

let audioContext = null;
const instruments = new Map();   // 音色名 → ロード済みインスタンス
let activeNodes = [];            // 再生中/予約済みの発音ノード
let playbackTimer = null;        // UIコールバック用タイマー
let playing = false;

// ---------- 音の「のび」（余韻）----------
// sample-player は play() に duration を渡すと when+duration でサンプルを止め、
// そのあとは release（既定 0.3秒）で急速に減衰させる。
// つまりピアノのサンプルがまだ鳴っているのに、エンジン側が短く刈り取っていた
// ＝「音が伸びない」の正体。ここで release と余韻(tail)を明示的に持たせる。
//   durationScale: 音符の長さに対する発音時間の倍率（1未満で歯切れよく）
//   tail:          発音時間に足す秒数（次の音へ少し重なる）
//   release:       発音終了後、指数的に減衰しながら鳴り続ける秒数
export const RING_MODES = [
  { id: 'short', label: 'みじかく', durationScale: 0.55, tail: 0, release: 0.2 },
  { id: 'normal', label: 'ふつう', durationScale: 1, tail: 0.1, release: 0.7 },
  { id: 'long', label: 'のばす', durationScale: 1, tail: 0.35, release: 1.5 }
];
export function ringModeOf(id) {
  return RING_MODES.find(r => r.id === id) ?? RING_MODES[1];
}
/** 音符の長さ(カウント)とBPMから、実際の発音秒数を求める */
export function noteDuration(lengthCount, bpm, ring = 'normal') {
  const r = ringModeOf(ring);
  return Math.max(0.05, lengthCount * (60 / bpm) * r.durationScale + r.tail);
}

/** AudioContext を初期化（最初のユーザー操作時に呼ぶ） */
export function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

/**
 * 楽器音源をロードする（ロード済みならキャッシュを返す）。
 * ⑤楽器音源の追加は、この関数に音色名を渡すだけで対応できる。
 */
export async function loadInstrument(name = 'acoustic_grand_piano') {
  initAudio();
  if (instruments.has(name)) return instruments.get(name);
  const inst = await Soundfont.instrument(audioContext, name);
  instruments.set(name, inst);
  return inst;
}

/**
 * 単発でコード/音を鳴らす（プレビュー・A/B試聴用）。
 * @param {number[]} midiNotes
 */
export function playNow(midiNotes, { duration = 1.5, instrument = 'acoustic_grand_piano', gain = 1, ring = 'normal' } = {}) {
  const inst = instruments.get(instrument);
  if (!inst) return;
  const r = ringModeOf(ring);
  const t = audioContext.currentTime;
  for (const midi of midiNotes) {
    const node = inst.play(midiToNoteName(midi), t, { duration, gain, release: r.release });
    activeNodes.push(node);
  }
}

/**
 * 複数トラックを同時に再生する。
 * @param {Array<{instrument?: string, gain?: number, events: Array<{midi: number[], startCount: number, lengthCount: number}>}>} tracks
 * @param {object} opts { bpm, onCount(count), onComplete() }
 *   onCount は再生位置のUI表示（ピアノロールの再生ヘッド等）に使う。
 */
export function playTracks(tracks, { bpm = 120, ring = 'normal', onCount, onComplete, keepTails = false } = {}) {
  if (!audioContext) return;
  // くりかえし再生のつなぎ目では、前の周の余韻を切らずに残す（keepTails）。
  // 各ノードは既に自分の終了時刻を予約済みなので、放っておいても自然に消える。
  if (keepTails) cancelTimer();
  else stop(); // 二重再生防止

  const r = ringModeOf(ring);
  const secPerCount = 60 / bpm;
  const t0 = audioContext.currentTime + 0.05; // わずかに先の時刻から開始
  let totalCounts = 0;

  // 全イベントを AudioContext の時刻で事前スケジュール
  for (const track of tracks) {
    const inst = instruments.get(track.instrument ?? 'acoustic_grand_piano');
    if (!inst) continue;
    for (const ev of track.events) {
      const start = t0 + ev.startCount * secPerCount;
      const duration = noteDuration(ev.lengthCount, bpm, ring);
      totalCounts = Math.max(totalCounts, ev.startCount + ev.lengthCount);
      for (const midi of ev.midi) {
        const node = inst.play(midiToNoteName(midi), start, {
          duration, gain: track.gain ?? 1, release: r.release
        });
        activeNodes.push(node);
      }
    }
  }
  // 予約済みノードが際限なく溜まらないよう、古いものから間引く
  if (activeNodes.length > 600) activeNodes = activeNodes.slice(-400);

  playing = true;

  // UI用のカウント通知と完了通知（音のタイミング自体はWeb Audio側で正確に管理済み）
  const tick = () => {
    if (!playing) return;
    const elapsed = audioContext.currentTime - t0;
    const count = Math.floor(elapsed / secPerCount);
    if (onCount && count >= 0) onCount(count);
    if (elapsed >= totalCounts * secPerCount) {
      playing = false;
      if (onComplete) onComplete();
      return;
    }
    playbackTimer = requestAnimationFrame(tick);
  };
  playbackTimer = requestAnimationFrame(tick);
}

function cancelTimer() {
  if (playbackTimer) {
    cancelAnimationFrame(playbackTimer);
    playbackTimer = null;
  }
}

/** 再生を確実に停止する（予約済みの音も含めてすべて止める） */
export function stop() {
  playing = false;
  cancelTimer();
  for (const node of activeNodes) {
    try { node.stop(); } catch (_) { /* 既に停止済みは無視 */ }
  }
  activeNodes = [];
}

export function isPlaying() {
  return playing;
}

export function getAudioContext() {
  return audioContext;
}
