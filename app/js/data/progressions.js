// ========================================
// progressions.js - コード進行プリセット（①）
// 進行は「キーからの半音オフセット + クオリティ」の度数ベースで定義する。
// → 同じデータで 移調 / 度数表示モード / 逆引きマッチング を実現できる。
// off: キーの主音からの半音数（C基準なら C=0, F=5, G=7, Am=9...）
// q:   'M' メジャー系 / 'm' マイナー系（照合用）
// type: 実際に鳴らすコードタイプ
// ========================================

export const PROGRESSION_PRESETS = [
  {
    id: 'oudou',
    name: '王道進行',
    romanLabel: 'IV → V → iii → vi',
    mood: '切なさと爽やかさが同居する、Jポップ王道の響き',
    tags: ['切ない', '爽やか'],
    degrees: [
      { off: 5, q: 'M', type: 'major' },  // IV
      { off: 7, q: 'M', type: 'major' },  // V
      { off: 4, q: 'm', type: 'minor' },  // iii
      { off: 9, q: 'm', type: 'minor' }   // vi
    ]
  },
  {
    id: 'canon',
    name: 'カノン進行',
    romanLabel: 'I → V → vi → iii → IV → I → IV → V',
    mood: '壮大で感動的な、定番バラードの響き',
    tags: ['感動', '壮大'],
    degrees: [
      { off: 0, q: 'M', type: 'major' },  // I
      { off: 7, q: 'M', type: 'major' },  // V
      { off: 9, q: 'm', type: 'minor' },  // vi
      { off: 4, q: 'm', type: 'minor' },  // iii
      { off: 5, q: 'M', type: 'major' },  // IV
      { off: 0, q: 'M', type: 'major' },  // I
      { off: 5, q: 'M', type: 'major' },  // IV
      { off: 7, q: 'M', type: 'major' }   // V
    ]
  },
  {
    id: 'komuro',
    name: '小室進行',
    romanLabel: 'vi → IV → V → I',
    mood: '90年代J-POPに多い、疾走感のある響き',
    tags: ['疾走感', '切ない'],
    degrees: [
      { off: 9, q: 'm', type: 'minor' },  // vi
      { off: 5, q: 'M', type: 'major' },  // IV
      { off: 7, q: 'M', type: 'major' },  // V
      { off: 0, q: 'M', type: 'major' }   // I
    ]
  },
  {
    id: 'marusa',
    name: '丸サ進行',
    romanLabel: 'IVM7 → III7 → VIm7 → I7',
    mood: 'オシャレでジャジーな、都会的な響き',
    tags: ['おしゃれ', '都会的'],
    degrees: [
      { off: 5, q: 'M', type: 'maj7' },   // IVM7
      { off: 4, q: 'M', type: '7' },      // III7
      { off: 9, q: 'm', type: 'm7' },     // VIm7
      { off: 0, q: 'M', type: '7' }       // I7
    ]
  }
];

/**
 * プリセットを実際のキーのコード列に変換する。
 * @param {object} preset PROGRESSION_PRESETS の要素
 * @param {number} keyPc キーの主音のピッチクラス（C=0）
 * @returns {Array<{rootPc: number, type: string}>} musicTheory.buildChord にそのまま渡せる形
 */
export function presetToChords(preset, keyPc = 0) {
  return preset.degrees.map(d => ({
    rootPc: ((keyPc + d.off) % 12 + 12) % 12,
    type: d.type
  }));
}
