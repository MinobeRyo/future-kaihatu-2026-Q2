// ========================================
// songs.js - 既存楽曲データベース＋逆引き検索（①-2）
// 曲名・アーティスト名・進行の対応（事実情報）のみを扱う。音源・歌詞・楽譜は使わない。
//
// ⚠️ 収録前チェックリスト:
//   ここの紐付けは「一般にそう紹介されている」レベルの情報。
//   アプリに載せる前に、必ず自分の耳＋コード譜サイトで該当セクションを確認すること。
//   確認済みにしたら verified: true にする。
// ========================================

import { matchProgressions } from '../core/musicTheory.js';
import { PROGRESSION_PRESETS } from './progressions.js';

// patternId は PROGRESSION_PRESETS の id に対応
export const SONGS = [
  // --- 王道進行 ---
  { title: '残酷な天使のテーゼ', artist: '高橋洋子', patternId: 'oudou', section: 'サビ', verified: false },
  { title: '愛をこめて花束を', artist: 'Superfly', patternId: 'oudou', section: 'サビ', verified: false },
  { title: '夜に駆ける', artist: 'YOASOBI', patternId: 'oudou', section: 'サビ', verified: false },

  // --- カノン進行 ---
  { title: 'チェリー', artist: 'スピッツ', patternId: 'canon', section: 'サビ', verified: false },
  { title: 'さくら(独唱)', artist: '森山直太朗', patternId: 'canon', section: 'Aメロ〜サビ', verified: false },
  { title: 'キセキ', artist: 'GReeeeN', patternId: 'canon', section: 'サビ', verified: false },

  // --- 小室進行 ---
  { title: 'Get Wild', artist: 'TM NETWORK', patternId: 'komuro', section: 'サビ', verified: false },
  { title: 'CAN YOU CELEBRATE?', artist: '安室奈美恵', patternId: 'komuro', section: 'サビ', verified: false },
  { title: 'Lemon', artist: '米津玄師', patternId: 'komuro', section: 'サビ', verified: false },

  // --- 丸サ進行 ---
  { title: '丸の内サディスティック', artist: '椎名林檎', patternId: 'marusa', section: '全編', verified: false },
  { title: 'Just the Two of Us', artist: 'Grover Washington Jr.', patternId: 'marusa', section: '全編', verified: false },
  { title: '死ぬのがいいわ', artist: '藤井風', patternId: 'marusa', section: 'サビ', verified: false }
];

/** 指定プリセット進行に紐づく楽曲リストを返す（①-2 (a) 紐付け表示用） */
export function songsForPattern(patternId) {
  return SONGS.filter(s => s.patternId === patternId);
}

/**
 * 逆引き検索（①-2 (b)）:
 * ユーザーが組んだ進行を全プリセットと照合し、類似度順に返す。
 * @param {Array<{rootPc: number, type: string}>} userChords
 * @param {number} threshold この類似度未満は候補から除外（既定0.5）
 * @returns {Array<{preset, score, exact, songs}>} score降順
 */
export function findSimilarProgressions(userChords, threshold = 0.5) {
  const results = [];
  for (const preset of PROGRESSION_PRESETS) {
    const { score } = matchProgressions(userChords, preset.degrees);
    if (score >= threshold) {
      results.push({
        preset,
        score,
        exact: score >= 0.999,
        songs: songsForPattern(preset.id)
      });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * 逆引き結果を初心者向けの日本語メッセージにする（③リアルタイム解説と連携）。
 * 例: 「あなたの進行は『Lemon』と同じ小室進行です！」
 */
export function matchMessage(result) {
  if (!result) return 'この進行はプリセットにない、あなただけの進行です！';
  const songPart = result.songs.length > 0 ? `『${result.songs[0].title}』と同じ` : '';
  if (result.exact) {
    return `あなたの進行は${songPart}${result.preset.name}です！`;
  }
  return `あなたの進行は${songPart}${result.preset.name}の変形です（一致度${Math.round(result.score * 100)}%）`;
}
