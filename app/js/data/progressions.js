// ========================================
// progressions.js - コード進行プリセット（①）
// 進行は「キーからの半音オフセット + クオリティ」の度数ベースで定義する。
// → 同じデータで 移調 / 度数表示モード / 逆引きマッチング を実現できる。
// off: キーの主音からの半音数（C基準なら C=0, F=5, G=7, Am=9...）
// q:   'M' メジャー系 / 'm' マイナー系（照合用）
// type: 実際に鳴らすコードタイプ
// tensions: 乗せるテンション（省略可）。9th や ♭13 などを含む進行のため
//
// プリセットに keyPc を持たせると、読み込んだときにそのキーへ自動で合わせる。
// 原曲のキーがある進行（採譜したものなど）で、譜面どおりの響きを再現するため。
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
  },
  {
    id: 'otameshi',
    name: 'お試しコード',
    romanLabel: 'IIm7 → V7 → IM7 → IVM7 → VIIm7♭5 → III7 → VIM7',
    mood: 'ツーファイブワンで一度着地してから、もう一度ツーファイブで転調する重たくジャジーな響き',
    tags: ['おしゃれ', 'ジャジー', '転調'],
    keyPc: 6,   // 原曲キーは G♭
    // ベースラインは「キーの主音（BASS_BASE_OCTAVE の高さ）からの半音差」で持つ。
    // 度数と同じくキー非依存なので、移調しても同じ形のまま動く。
    // ここでは 5度下がって4度上がる王道の動き（G♭キーで A♭2→D♭2→G♭2→C♭2→F2→B♭1→E♭2）
    bass: [2, -5, 0, -7, -1, -8, -3],
    degrees: [
      // --- G♭ へのツーファイブワン ---
      { off: 2,  q: 'm', type: 'm7',   tensions: ['9'] },          // A♭m7(9)
      { off: 7,  q: 'M', type: '7',    tensions: ['13'] },         // D♭7(13)
      { off: 0,  q: 'M', type: 'maj7' },                           // G♭maj7
      { off: 5,  q: 'M', type: 'maj7' },                           // C♭maj7
      // --- ここから E♭（VI）へ転調するツーファイブワン ---
      { off: 11, q: 'm', type: 'm7b5' },                           // Fm7♭5
      { off: 4,  q: 'M', type: '7',    tensions: ['b13'] },        // B♭7(♭13)
      { off: 9,  q: 'M', type: 'maj7' }                            // E♭maj7
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
    type: d.type,
    tensions: [...(d.tensions ?? [])]
  }));
}

/** プリセットが原曲キーを持っていればそれを返す（無ければ今のキーのまま） */
export function presetKeyPc(preset, fallback = 0) {
  return typeof preset?.keyPc === 'number' ? preset.keyPc : fallback;
}

/** ベースラインの基準になるオクターブ（この高さの主音を 0 とする） */
export const BASS_BASE_OCTAVE = 2;

/**
 * プリセットのベースラインを実際の音に変換する。
 * @returns {Array<{rootPc:number, octave:number}>} 無ければ null
 */
export function presetToBass(preset, keyPc = 0) {
  if (!preset?.bass?.length) return null;
  const base = 12 * (BASS_BASE_OCTAVE + 1) + (((keyPc % 12) + 12) % 12);
  return preset.bass.map(semi => {
    const midi = base + semi;
    return { rootPc: ((midi % 12) + 12) % 12, octave: Math.floor(midi / 12) - 1 };
  });
}
