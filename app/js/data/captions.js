// ========================================
// captions.js - 初心者向けリアルタイム解説の文言データ（③）
// 「操作した結果、理論的に何が起きたか」をその場で言葉にして返す。
// UIロジックからは getCaption() で引くだけにし、文言はすべてここで管理する。
// ========================================

import { TENSIONS } from '../core/musicTheory.js';

// テンション追加時のキャプション（TENSIONS の feel を利用）
export function tensionCaption(tensionKey) {
  const t = TENSIONS[tensionKey];
  if (!t) return '';
  return `${t.label}を足すと、${t.feel}。`;
}

// コードの移り変わり（クオリティの変化）に対するキャプション
// key: '前のクオリティ→次のクオリティ'
const TRANSITION_CAPTIONS = {
  'M→m': '明るい響きから少し切ない響きへの、定番の移り変わりです。',
  'm→M': '切ない響きから明るい響きへ。景色が開けるような変化です。',
  'M→M': '明るい響き同士のつながり。安定感のある進行です。',
  'm→m': '切ない響き同士のつながり。しっとりした流れになります。'
};

export function transitionCaption(prevQuality, nextQuality) {
  return TRANSITION_CAPTIONS[`${prevQuality}→${nextQuality}`] ?? '';
}

// ボイシング変更時のキャプション
export const VOICING_CAPTIONS = {
  root: '基本形。ルート音が一番下にある、いちばん標準的な積み方です。',
  first: '第1転回形。同じコードでも一番下の音が変わると、響きの重心が変わります。',
  second: '第2転回形。浮ついた、次へ進みたくなる響きになります。',
  spread: '開離配置。音の間隔を広げると、ゆったり豊かな響きになります。'
};

// 響きの複雑さメーター（②）: 構成音数からレベルを返す
export function complexityLevel(noteCount) {
  if (noteCount <= 3) return { level: 1, label: 'シンプル' };
  if (noteCount === 4) return { level: 2, label: 'ちょっとリッチ' };
  if (noteCount === 5) return { level: 3, label: 'おしゃれ' };
  return { level: 4, label: 'かなり複雑' };
}
