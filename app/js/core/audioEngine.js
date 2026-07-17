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
export function playNow(midiNotes, { duration = 1.5, instrument = 'acoustic_grand_piano', gain = 1 } = {}) {
  const inst = instruments.get(instrument);
  if (!inst) return;
  const t = audioContext.currentTime;
  for (const midi of midiNotes) {
    const node = inst.play(midiToNoteName(midi), t, { duration, gain });
    activeNodes.push(node);
  }
}

/**
 * 複数トラックを同時に再生する。
 * @param {Array<{instrument?: string, gain?: number, events: Array<{midi: number[], startCount: number, lengthCount: number}>}>} tracks
 * @param {object} opts { bpm, onCount(count), onComplete() }
 *   onCount は再生位置のUI表示（ピアノロールの再生ヘッド等）に使う。
 */
export function playTracks(tracks, { bpm = 120, onCount, onComplete } = {}) {
  if (!audioContext) return;
  stop(); // 二重再生防止

  const secPerCount = 60 / bpm;
  const t0 = audioContext.currentTime + 0.05; // わずかに先の時刻から開始
  let totalCounts = 0;

  // 全イベントを AudioContext の時刻で事前スケジュール
  for (const track of tracks) {
    const inst = instruments.get(track.instrument ?? 'acoustic_grand_piano');
    if (!inst) continue;
    for (const ev of track.events) {
      const start = t0 + ev.startCount * secPerCount;
      const duration = ev.lengthCount * secPerCount;
      totalCounts = Math.max(totalCounts, ev.startCount + ev.lengthCount);
      for (const midi of ev.midi) {
        const node = inst.play(midiToNoteName(midi), start, { duration, gain: track.gain ?? 1 });
        activeNodes.push(node);
      }
    }
  }

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

/** 再生を確実に停止する（予約済みの音も含めてすべて止める） */
export function stop() {
  playing = false;
  if (playbackTimer) {
    cancelAnimationFrame(playbackTimer);
    playbackTimer = null;
  }
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
