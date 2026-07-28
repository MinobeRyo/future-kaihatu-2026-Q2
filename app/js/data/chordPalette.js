// ========================================
// chordPalette.js - 作曲モードのコードパレット定義
// 「＋足す」で出せるコードの一覧。キーからの半音オフセット(off)で持つので、
// キーを変えても同じ表が使い回せる（rootPc = (keyPc + off) % 12）。
//
// これまで composePage.js に DIATONIC 7個がハードコードされていて、
// musicTheory.js の CHORD_INTERVALS に14種類あるのに UI から出せなかった。
// ここに分類ごとの表を置き、パレットをタブで切り替えられるようにする。
// ========================================

/** パレットのタブ（表示順） */
export const PALETTE_TABS = [
  { id: 'diatonic', label: 'きほん',   desc: 'このキーの基本7コード。迷ったらここから' },
  { id: 'seventh',  label: '7th',      desc: '4つ目の音を重ねた、大人っぽい響き' },
  { id: 'color',    label: 'いろどり', desc: 'sus・aug — ふわっと浮いた、決まりきらない響き' },
  { id: 'spice',    label: 'スパイス', desc: 'キーの外から借りてくるコード。展開をドラマチックに' },
  { id: 'custom',   label: 'くわしく', desc: 'ルート・種類・テンションを自分で組み合わせます（A♭m7♭5 なども作れます）' }
];

// off: キーのルートからの半音数 / type: CHORD_INTERVALS のキー / tip: 初心者向けの一言
const DIATONIC = [
  { off: 0,  type: 'major', tip: 'いちばん安定。始まりと終わりに' },
  { off: 2,  type: 'minor', tip: 'Vへ進みたくなる。前ふり役' },
  { off: 4,  type: 'minor', tip: 'しっとり。Iの代わりにも使える' },
  { off: 5,  type: 'major', tip: 'ふわっと広がる。サビの入口に' },
  { off: 7,  type: 'major', tip: 'Iへ帰りたくなる力がいちばん強い' },
  { off: 9,  type: 'minor', tip: '切なさ担当。Iの代わりにも使える' },
  { off: 11, type: 'dim',   tip: '不安定。すぐIへ解決させたい' }
];

const SEVENTH = [
  { off: 0,  type: 'maj7', tip: 'おしゃれで浮遊感のある「I」' },
  { off: 2,  type: 'm7',   tip: 'IIm7→V7 はジャズの定番の入口' },
  { off: 4,  type: 'm7',   tip: '落ち着いた影のある響き' },
  { off: 5,  type: 'maj7', tip: '透明感のある広がり。イントロにも合う' },
  { off: 7,  type: '7',    tip: 'Iへ帰る力が最強。サビ前に' },
  { off: 9,  type: 'm7',   tip: '大人なせつなさ。使いやすい' },
  { off: 11, type: 'm7b5', tip: 'ハーフディミニッシュ。もやっと不安' }
];

const COLOR = [
  { off: 0,  type: 'sus4',   tip: '解決前の「ためる」響き。Iに戻すと気持ちいい' },
  { off: 0,  type: 'sus2',   tip: '明暗が決まらない、すっきりした響き' },
  { off: 5,  type: 'sus4',   tip: 'IVをさらに広く、浮かせた感じに' },
  { off: 7,  type: 'sus4',   tip: 'V7の直前に置くと盛り上がる' },
  { off: 7,  type: '7sus4',  tip: 'ふわっと進む。J-POPのサビ前によくある' },
  { off: 2,  type: 'sus2',   tip: '軽やかで抜けのいい響き' },
  { off: 0,  type: 'aug',    tip: '半音上がっていく不思議さ。Iの直後に' },
  { off: 7,  type: 'aug',    tip: 'Iへ帰る途中に緊張感を足す' }
];

const SPICE = [
  // セカンダリドミナント（「一時的にそのコードをトニック扱いする」ドミナント）
  { off: 9,  type: '7', tip: 'V7/II — Dm（IIm）へ強く進む', badge: 'V7/II' },
  { off: 11, type: '7', tip: 'V7/III — Em（IIIm）へ強く進む', badge: 'V7/III' },
  { off: 0,  type: '7', tip: 'V7/IV — F（IV）へ強く進む', badge: 'V7/IV' },
  { off: 2,  type: '7', tip: 'V7/V — G（V）へ強く進む。サビ前の定番', badge: 'V7/V' },
  { off: 4,  type: '7', tip: 'V7/VI — Am（VIm）へ強く進む。切なさ増し', badge: 'V7/VI' },
  // 同主調（マイナー）からの借用和音。badge は付けず degreeToRoman の表記（bVI 等）に任せる
  { off: 5,  type: 'minor', tip: '借用 — 「サブドミナントマイナー」。切なく陰る定番' },
  { off: 8,  type: 'major', tip: '借用 — ふっと別世界へ飛ぶ感じ' },
  { off: 10, type: 'major', tip: '借用 — 力強く広がる。ロック的な響き' },
  { off: 3,  type: 'major', tip: '借用 — 意外性のある転回。転調の足がかりにも' }
];

/** タブid → コード定義の配列 */
export const PALETTE_GROUPS = {
  diatonic: DIATONIC,
  seventh: SEVENTH,
  color: COLOR,
  spice: SPICE
};

/** タブidから、そのキーで実際に鳴らせるコード一覧（rootPc入り）を返す */
export function paletteChords(tabId, keyPc) {
  return (PALETTE_GROUPS[tabId] ?? DIATONIC).map(d => ({
    ...d,
    rootPc: ((keyPc + d.off) % 12 + 12) % 12
  }));
}
