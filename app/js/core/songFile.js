// ========================================
// songFile.js - 曲データの保存形式（シリアライズ）と入出力
//
// いまは「JSONファイルに書き出す／読み込む」だけの仮実装だが、
// 将来 DB 保存に差し替えることを前提に、次の2層に分けてある。
//
//   ① serializeSong / deserializeSong ... DOM も fetch も使わない純粋関数。
//      「アプリの状態 ⇄ 保存用のプレーンなオブジェクト」の変換だけを担当する。
//      DB化しても、この2つはそのまま使える（POST する中身がこれになるだけ）。
//   ② downloadSong / readSongFile   ... ブラウザのファイル入出力。
//      DB化のときはここだけ saveSongToServer / loadSongFromServer に置き換わる。
//
// 保存形式にバージョン番号を持たせているのは、あとから項目が増えたときに
// 「古いファイルをどう読むか」を判断できるようにするため。
// ========================================

import { TRACKS, createTimeline, withId, relayoutChords } from './timeline.js';

/** 保存形式のバージョン。項目の意味を変えるときは必ず上げる。 */
export const SONG_FORMAT_VERSION = 1;

/** ファイルの種類を見分けるための目印（他のJSONを読み込んだときに弾ける） */
export const SONG_FILE_KIND = 'tsumine.song';

/** 1イベントとして保存する項目。ここに無いもの（id など）は保存しない。 */
const EVENT_KEYS = ['rootPc', 'type', 'tensions', 'voicing', 'octave', 'startCount', 'lengthCount', 'isRest'];

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * アプリの状態 → 保存用のプレーンなオブジェクト。
 * id は保存しない（読み込み時に振り直す。他の曲と id がぶつからないようにするため）。
 */
export function serializeSong({
  tl, keyPc = 0, bpm = 100, title = '', ringMode = 'normal',
  chordInstrument = 'acoustic_grand_piano', melStyle = 'arc',
  bassMode = 'auto', notation, chordStyle
} = {}) {
  const tracks = {};
  for (const t of TRACKS) {
    tracks[t] = (tl?.[t] ?? []).map(ev => {
      const out = {};
      for (const k of EVENT_KEYS) {
        if (ev[k] === undefined) continue;
        out[k] = Array.isArray(ev[k]) ? [...ev[k]] : ev[k];
      }
      return out;
    });
  }
  return {
    kind: SONG_FILE_KIND,
    version: SONG_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    title,
    keyPc, bpm, ringMode, chordInstrument, melStyle, bassMode,
    ...(notation ? { notation } : {}),
    ...(chordStyle ? { chordStyle } : {}),
    tracks
  };
}

/**
 * 保存用オブジェクト → アプリの状態。
 * 壊れたファイル・別のJSONを読ませても落ちないよう、値は必ず検証してから使う。
 * @throws {Error} 積み音の曲ファイルとして読めないとき
 */
export function deserializeSong(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('ファイルの中身が空か、JSONではありません');
  if (raw.kind !== SONG_FILE_KIND) throw new Error('積み音の曲ファイルではないようです');
  if (num(raw.version, 0) > SONG_FORMAT_VERSION) {
    throw new Error('新しいバージョンで保存されたファイルです。アプリを更新してください');
  }

  const tl = createTimeline();
  for (const t of TRACKS) {
    const src = Array.isArray(raw.tracks?.[t]) ? raw.tracks[t] : [];
    tl[t] = src.map(e => withId(normalizeEvent(e, t)));
  }
  // コードは「並び順＝曲の並び」。保存側が壊れていても、ここで必ず整合させる。
  relayoutChords(tl);

  return {
    tl,
    title: typeof raw.title === 'string' ? raw.title : '',
    keyPc: ((num(raw.keyPc, 0) % 12) + 12) % 12,
    bpm: Math.min(300, Math.max(30, Math.round(num(raw.bpm, 100)))),
    ringMode: typeof raw.ringMode === 'string' ? raw.ringMode : 'normal',
    chordInstrument: typeof raw.chordInstrument === 'string' ? raw.chordInstrument : 'acoustic_grand_piano',
    melStyle: typeof raw.melStyle === 'string' ? raw.melStyle : 'arc',
    bassMode: raw.bassMode === 'manual' ? 'manual' : 'auto',
    notation: typeof raw.notation === 'string' ? raw.notation : null,
    chordStyle: typeof raw.chordStyle === 'string' ? raw.chordStyle : null,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : null
  };
}

/** 1イベントぶんの値を安全な範囲に丸める */
function normalizeEvent(e, track) {
  const isRest = track === 'chord' && e?.isRest === true;
  return {
    rootPc: ((Math.round(num(e?.rootPc, 0)) % 12) + 12) % 12,
    type: track === 'chord' ? (typeof e?.type === 'string' ? e.type : 'major') : 'none',
    tensions: track === 'chord' && Array.isArray(e?.tensions) ? e.tensions.filter(x => typeof x === 'string') : [],
    voicing: track === 'chord' && typeof e?.voicing === 'string' ? e.voicing : 'root',
    octave: Math.min(8, Math.max(0, Math.round(num(e?.octave, track === 'bass' ? 2 : track === 'melody' ? 5 : 4)))),
    startCount: Math.max(0, num(e?.startCount, 0)),
    lengthCount: Math.max(0.5, num(e?.lengthCount, 2)),
    isRest
  };
}

// ------------------------------------------------------------
// ここから下はブラウザ専用（DB保存に移すときに置き換わる層）
// ------------------------------------------------------------

/** ファイル名に使えない文字を落とす */
export function safeFileName(title) {
  const base = (title || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `${base || '積み音'}_${stamp}.tsumine.json`;
}

/** 保存用オブジェクトを .json ファイルとしてダウンロードさせる */
export function downloadSong(doc, filename = safeFileName(doc?.title)) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 解放が早すぎるとSafariでダウンロードが失敗するので、少し待ってから捨てる
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** <input type="file"> で選ばれたファイルを読んで、アプリの状態に戻す */
export async function readSongFile(file) {
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); }
  catch (_) { throw new Error('JSONとして読めませんでした'); }
  return deserializeSong(raw);
}
