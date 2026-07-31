// ========================================
// selftest.mjs - core/data ロジックのセルフテスト
// 実行: node tests/selftest.mjs （appディレクトリで）
// ========================================

import {
  buildChord, midiToNoteName, noteNameToPc, degreeToRoman,
  transposeProgression, chordDisplayName, matchProgressions, noteRole
} from '../js/core/musicTheory.js';
import {
  PROGRESSION_PRESETS, presetToChords, presetKeyPc, presetToBass, BASS_BASE_OCTAVE
} from '../js/data/progressions.js';
import {
  createTimeline, addEvent, eventMidi, transposeEvent, moveEvent,
  toPlayableTracks, timelineEnd, pitchRange
} from '../js/core/timeline.js';
import { findSimilarProgressions, matchMessage, songsForPattern } from '../js/data/songs.js';
import { getMagicCircleRootRadius } from '../js/ui/magicCircle.js';
import { PALETTE_TABS, paletteChords } from '../js/data/chordPalette.js';
import { MELODY_STYLES, generateMelody } from '../js/core/melodyGen.js';
import { suggestMelodyNotes, suggestBassNotes, suggestNextChords, doremiOf } from '../js/core/suggest.js';
import { RING_MODES, ringModeOf, noteDuration } from '../js/core/audioEngine.js';
import {
  pcName, pcAltName, midiDisplayName, setNotation, getNotation, setDisplayKey,
  NOTATION_MODES, chordAltName, chordBreakdown, solfegeName, CHORD_TYPE_LABELS, degreeMeaning,
  chordSpelling, chordSpellingMap, CHORD_INTERVALS,
  CHORD_STYLES, setChordStyle, getChordStyle, TENSIONS, noteRole as _nr
} from '../js/core/musicTheory.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}\n     expected: ${e}\n     actual:   ${a}`); }
}

console.log('--- 音名・MIDI変換 ---');
check('C4 = MIDI 60', buildChord({ rootPc: 0, type: 'none', octave: 4 }).midi, [60]);
check('midiToNoteName(60)', midiToNoteName(60), 'C4');
check("noteNameToPc('F#')", noteNameToPc('F#'), 6);
check("noteNameToPc('Db')", noteNameToPc('Db'), 1);

console.log('--- コード構築 ---');
check('Cメジャー', buildChord({ rootPc: 0, type: 'major', octave: 4 }).noteNames, ['C4', 'E4', 'G4']);
check('Aマイナー', buildChord({ rootPc: 9, type: 'minor', octave: 4 }).noteNames, ['A4', 'C5', 'E5']);
check('FM7', buildChord({ rootPc: 5, type: 'maj7', octave: 4 }).noteNames, ['F4', 'A4', 'C5', 'E5']);

console.log('--- テンション（②） ---');
// 9th は「7thの上に積む」テンション → 三和音に付けると短7度(A#4)も一緒に足される
const c9 = buildChord({ rootPc: 0, type: 'major', octave: 4, tensions: ['9'] });
check('C9 構成音（7thも足される）', c9.noteNames, ['C4', 'E4', 'G4', 'A#4', 'D5']);
check('C9 追加音ハイライト', c9.addedByTension.map(midiToNoteName), ['A#4', 'D5']);
// add9 は7thを足さず、レ(D5)だけ加える
const cAdd9 = buildChord({ rootPc: 0, type: 'major', octave: 4, tensions: ['add9'] });
check('Cadd9 構成音（7thなし）', cAdd9.noteNames, ['C4', 'E4', 'G4', 'D5']);
check('Cadd9 追加音ハイライト', cAdd9.addedByTension.map(midiToNoteName), ['D5']);

console.log('--- 音の役割（積み木タワー用） ---');
check('ルート', noteRole(0), { key: 'root', label: 'ルート' });
check('長3度', noteRole(4), { key: 'third', label: '3度（長）' });
check('短3度', noteRole(3), { key: 'third', label: '3度（短）' });
check('5度', noteRole(7), { key: 'fifth', label: '5度' });
check('短7度', noteRole(10), { key: 'seventh', label: '♭7th' });
check('9th（オクターブ超え）', noteRole(14), { key: 'ninth', label: '9th' });
check('11th', noteRole(17), { key: 'eleventh', label: '11th' });
check('13th', noteRole(21), { key: 'thirteenth', label: '13th' });
// 既に7thを持つコードには9thだけが足される
const cmaj9 = buildChord({ rootPc: 0, type: 'maj7', octave: 4, tensions: ['9'] });
check('Cmaj7(9) は7thを重複追加しない', cmaj9.noteNames, ['C4', 'E4', 'G4', 'B4', 'D5']);

console.log('--- 魔法陣の座標計算 ---');
check('ルートハイライトは既定で外周の0.8倍', getMagicCircleRootRadius(240), 192);
check('スケール表示時も音名の位置（0.8倍）に置く', getMagicCircleRootRadius(240, { showDiatonicScale: true }), 192);
check('コード三角形表示時は内側に寄せる', getMagicCircleRootRadius(240, { showChordTriangle: true }), 134);

console.log('--- コード表示名（慣習に合わせた整理） ---');
check('D 9+11+13+6 → D13', chordDisplayName(2, 'major', ['13', '11', '9', '6']), 'D13');
check('C major+9 → C9', chordDisplayName(0, 'major', ['9']), 'C9');
check('C major+add9 → Cadd9', chordDisplayName(0, 'major', ['add9']), 'Cadd9');
check('C 6+add9 → C6/9', chordDisplayName(0, 'major', ['6', 'add9']), 'C6/9');
check('C minor+9 → Cm9', chordDisplayName(0, 'minor', ['9']), 'Cm9');
check('C maj7+9 → Cmaj9', chordDisplayName(0, 'maj7', ['9']), 'Cmaj9');
check('A m7+add9 → Am9（7th持ちはadd9=9扱い）', chordDisplayName(9, 'm7', ['add9']), 'Am9');
check('C major+6 → C6', chordDisplayName(0, 'major', ['6']), 'C6');

console.log('--- ハーフディミニッシュ（m7♭5）と追加コードタイプ ---');
check('Dm7♭5 構成音', buildChord({ rootPc: 2, type: 'm7b5', octave: 4 }).noteNames, ['D4', 'F4', 'G#4', 'C5']);
check('Dm7♭5 表示名', chordDisplayName(2, 'm7b5'), 'Dm7♭5');
check('Cdim7 構成音（短3度の積み重ね）', buildChord({ rootPc: 0, type: 'dim7', octave: 4 }).noteNames, ['C4', 'D#4', 'F#4', 'A4']);
check('Csus2 構成音', buildChord({ rootPc: 0, type: 'sus2', octave: 4 }).noteNames, ['C4', 'D4', 'G4']);
check('CmM7 構成音', buildChord({ rootPc: 0, type: 'mmaj7', octave: 4 }).noteNames, ['C4', 'D#4', 'G4', 'B4']);
check('G7sus4 構成音', buildChord({ rootPc: 7, type: '7sus4', octave: 4 }).noteNames, ['G4', 'C5', 'D5', 'F5']);
check('mM7 表示名', chordDisplayName(0, 'mmaj7'), 'CmM7');

console.log('--- ボイシング ---');
check('C 第1転回', buildChord({ rootPc: 0, type: 'major', octave: 4, voicing: 'first' }).noteNames, ['E4', 'G4', 'C5']);

console.log('--- 度数表示（度数モード用） ---');
check('IV', degreeToRoman(5, 'major'), 'IV');
check('VIm', degreeToRoman(9, 'minor'), 'VIm');

console.log('--- プリセット→コード列（①） ---');
const oudou = PROGRESSION_PRESETS.find(p => p.id === 'oudou');
const oudouInC = presetToChords(oudou, 0);
check('王道進行 Key=C', oudouInC.map(c => chordDisplayName(c.rootPc, c.type)), ['F', 'G', 'Em', 'Am']);
const oudouInD = presetToChords(oudou, 2); // 移調（トランスポーズ）
check('王道進行 Key=D', oudouInD.map(c => chordDisplayName(c.rootPc, c.type)), ['G', 'A', 'F♯m', 'Bm']);

console.log('--- 移調 ---');
check('移調(+2)がプリセットKey=Dと一致',
  transposeProgression(oudouInC, 2).map(c => chordDisplayName(c.rootPc, c.type)),
  oudouInD.map(c => chordDisplayName(c.rootPc, c.type)));

console.log('--- 逆引きマッチング（①-2） ---');
// Key=Gの王道進行（C→D→Bm→Em）でもキー非依存で一致するか
const oudouInG = presetToChords(oudou, 7);
const m1 = findSimilarProgressions(oudouInG);
check('別キーの王道進行を検出', m1[0]?.preset.id, 'oudou');
check('完全一致判定', m1[0]?.exact, true);

// 小室進行（Am→F→G→C）
const komuroInC = presetToChords(PROGRESSION_PRESETS.find(p => p.id === 'komuro'), 0);
const m2 = findSimilarProgressions(komuroInC);
check('小室進行を検出', m2[0]?.preset.id, 'komuro');
console.log(`  💬 メッセージ例: ${matchMessage(m2[0])}`);

// 変形進行（王道の4つ目を変えた F→G→Em→A）→ 王道の変形として部分一致するか
const henkei = [
  { rootPc: 5, type: 'major' }, { rootPc: 7, type: 'major' },
  { rootPc: 4, type: 'minor' }, { rootPc: 9, type: 'major' } // Am→A に変形
];
const m3 = findSimilarProgressions(henkei);
check('変形進行は完全一致ではない', m3[0]?.exact ?? false, false);
console.log(`  💬 メッセージ例: ${matchMessage(m3[0])}`);

console.log('--- タイムライン（④基盤・フェーズ1） ---');
const tl = createTimeline();
addEvent(tl, 'chord', { rootPc: 5, type: 'major', lengthCount: 2 });
addEvent(tl, 'chord', { rootPc: 7, type: 'major', lengthCount: 2 });
check('コードはトラック終端に自動配置', tl.chord[1].startCount, 2);
addEvent(tl, 'bass', { rootPc: 5, lengthCount: 2 });
check('ベースの既定はオクターブ2（F2=41）', eventMidi('bass', tl.bass[0]), [41]);
addEvent(tl, 'melody', { rootPc: 0, lengthCount: 1 });
check('メロディの既定はオクターブ5（C5=72）', eventMidi('melody', tl.melody[0]), [72]);
check('タイムライン終端', timelineEnd(tl), 4);

const playable = toPlayableTracks(tl, { chord: 'piano', melody: 'piano', bass: 'acoustic_bass' });
check('3トラックがplayTracks形式に変換される', playable.length, 3);
check('コードイベントは構成音がMIDI配列になる', playable[0].events[0].midi, [65, 69, 72]); // F4,A4,C5

const ev = { rootPc: 11, octave: 4, type: 'none', startCount: 1, lengthCount: 1 };
transposeEvent(ev, 2); // B4 + 2半音 = C#5
check('移調でオクターブが繰り上がる', [ev.rootPc, ev.octave], [1, 5]);
moveEvent(ev, -5);
check('開始位置は0未満にならない', ev.startCount, 0);

const emptyRange = pitchRange(createTimeline());
check('空タイムラインの表示範囲はC3〜B5', [emptyRange.low, emptyRange.high], [48, 83]);

console.log('--- 楽曲DB ---');
check('丸サ進行の紐付け楽曲数', songsForPattern('marusa').length, 3);

// ============================================================
// コードパレット（タブ式）
// ============================================================
console.log('--- コードパレット ---');
check('タブは5分類（自由組み立ての「くわしく」を含む）', PALETTE_TABS.map(t => t.id),
  ['diatonic', 'seventh', 'color', 'spice', 'custom']);
check('きほんはダイアトニック7個', paletteChords('diatonic', 0).map(c => chordDisplayName(c.rootPc, c.type)),
  ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
check('7thタブのVは属七（G7）', chordDisplayName(...pick(paletteChords('seventh', 0), 4)), 'G7');
check('スパイスにセカンダリドミナントD7がある',
  paletteChords('spice', 0).some(c => c.rootPc === 2 && c.type === '7'), true);
check('スパイスに借用和音Fm（IVm）がある',
  paletteChords('spice', 0).some(c => c.rootPc === 5 && c.type === 'minor'), true);
check('キーGでも表がずれない（IVはC）', chordDisplayName(...pick(paletteChords('diatonic', 7), 3)), 'C');
check('全タブのrootPcが0-11に収まる',
  PALETTE_TABS.every(t => paletteChords(t.id, 11).every(c => c.rootPc >= 0 && c.rootPc < 12)), true);
function pick(list, i) { return [list[i].rootPc, list[i].type]; }

// ============================================================
// おまかせメロディ生成
// ============================================================
console.log('--- おまかせメロディ ---');
const prog = [
  { rootPc: 5, type: 'major', startCount: 0, lengthCount: 2 },   // F
  { rootPc: 7, type: 'major', startCount: 2, lengthCount: 2 },   // G
  { rootPc: 4, type: 'minor', startCount: 4, lengthCount: 2 },   // Em
  { rootPc: 9, type: 'minor', startCount: 6, lengthCount: 2 }    // Am
];
const MEL_RANGE = { low: 64, high: 86 };
check('スタイルは4種類', MELODY_STYLES.map(s => s.id), ['repeat', 'arc', 'smooth', 'rhythmic']);
check('コードが空なら空配列', generateMelody({ chords: [], keyPc: 0 }), []);

for (const s of MELODY_STYLES) {
  const runs = Array.from({ length: 30 }, () =>
    generateMelody({ chords: prog, keyPc: 0, style: s.id, range: MEL_RANGE }));
  check(`${s.label}: 音が生成される`, runs.every(r => r.length > 0), true);
  check(`${s.label}: 進行の長さ(8カウント)を超えない`,
    runs.every(r => r.every(n => n.startCount + n.lengthCount <= 8.001)), true);
  check(`${s.label}: 開始位置が時系列順`,
    runs.every(r => r.every((n, i) => i === 0 || n.startCount >= r[i - 1].startCount)), true);
  check(`${s.label}: 音域からはみ出さない`,
    runs.every(r => r.every(n => {
      const m = n.rootPc + 12 * (n.octave + 1);
      return m >= MEL_RANGE.low - 4 && m <= MEL_RANGE.high + 4;
    })), true);
  check(`${s.label}: 最後はキーのトニックに着地する`,
    runs.every(r => r[r.length - 1].rootPc === 0), true);
  check(`${s.label}: 押すたび結果が変わる（乱数が効いている）`,
    new Set(runs.map(r => JSON.stringify(r))).size > 1, true);
  check(`${s.label}: リズムに長短の変化がある`,
    runs.some(r => new Set(r.map(n => n.lengthCount)).size > 1), true);
}

// ============================================================
// 次の音の提案
// ============================================================
console.log('--- 次の音の提案 ---');
// カーソル=2カウント目（Gコード上）、直前の音はC5(72)
const sg = suggestMelodyNotes({ chords: prog, keyPc: 0, cursorCount: 2, prevMidi: 72, range: MEL_RANGE });
check('メロディは4つの役割を提案する', sg.map(s => s.role), ['lift', 'settle', 'step', 'color']);
check('提案が重複しない', new Set(sg.map(s => s.midi)).size, 4);
check('「盛り上げ」は直前より高い', sg.find(s => s.role === 'lift').midi > 72, true);
check('「締め」はキーのトニック', sg.find(s => s.role === 'settle').midi % 12, 0);
check('「なめらか」は全音以内の動き', Math.abs(sg.find(s => s.role === 'step').midi - 72) <= 2, true);
check('「意外性」はコード構成音ではない', sg.find(s => s.role === 'color').isChordTone, false);
check('直前の音が無くても提案できる',
  suggestMelodyNotes({ chords: prog, keyPc: 0, cursorCount: 0, prevMidi: null }).length, 4);
check('コードが無ければ提案しない', suggestMelodyNotes({ chords: [], keyPc: 0 }), []);
check('ドレミ表記（キーC のG）', doremiOf(7, 0), 'ソ');
check('ドレミ表記（キーG のG＝ド）', doremiOf(7, 7), 'ド');
check('キー外の音にはドレミが付かない', doremiOf(6, 0), null);

const BASS_RANGE = { low: 40, high: 60 };
const sb = suggestBassNotes({ chords: prog, keyPc: 0, cursorCount: 2, prevMidi: 48, range: BASS_RANGE });
check('ベースは「安定＝ルート」を提案する', sb.find(s => s.role === 'settle').midi % 12, 7); // Gコードのルート
check('ベースは次コードへのアプローチ音を提案する',
  sb.find(s => s.role === 'color').midi % 12, 3); // 次はEm → Eの半音下 = D#
check('ベース提案が音域内', sb.every(s => s.midi >= BASS_RANGE.low && s.midi <= BASS_RANGE.high), true);
check('最後のコード上ではアプローチ音を出さない',
  suggestBassNotes({ chords: prog, keyPc: 0, cursorCount: 6, prevMidi: 48, range: BASS_RANGE })
    .some(s => s.role === 'color'), false);

// ============================================================
// 次のコードの提案
// ============================================================
console.log('--- 次のコードの提案 ---');
const cAt = (rootPc, type, i) => ({ rootPc, type, startCount: i * 2, lengthCount: 2 });
const nameOf = (s) => s.name;
const roleOf = (list, role) => list.find(s => s.role === role);

const start = suggestNextChords({ chords: [], keyPc: 0 });
check('コードが無いときは出だしを4つ提案', start.length, 4);
check('出だしの第一候補はI（C）', start[0].name, 'C');

// C（I）のあと
const afterI = suggestNextChords({ chords: [cAt(0, 'major', 0)], keyPc: 0 });
check('Iの4役割がそろう', afterI.map(s => s.role), ['flow', 'lift', 'settle', 'color']);
check('I → 自然につなぐのはIV（F）', roleOf(afterI, 'flow').name, 'F');
check('I → 盛り上げはV7（G7）', roleOf(afterI, 'lift').name, 'G7');
check('I → 意外性は借用のIVm（Fm）', roleOf(afterI, 'color').name, 'Fm');
check('提案が重複しない', new Set(afterI.map(s => s.name)).size, 4);
// 「締め」の第1候補IVは flow に取られるので VIm へ繰り下がる。
// このとき説明文も繰り下がった側に合っていること（説明と実物の食い違い防止）
check('I → 締めは重複を避けてVImに繰り下がる', roleOf(afterI, 'settle').degree, 'VIm');
check('繰り下がっても説明文が実際のコードと一致する',
  roleOf(afterI, 'settle').hint.startsWith('VIm'), true);

// --- 提案ボタンを押し続けたときの堂々めぐり対策 ---
// ①「今鳴っているコード」をそのまま次に出さない
//    （Cのあとに Cmaj7 を出す等。7th/9thはカード側のトグルで足す導線がある）
check('今と同じルートのコードは提案しない',
  suggestNextChords({ chords: [cAt(5, 'minor', 0)], keyPc: 0 })
    .every(s => s.rootPc !== 5), true);
// ② A-B-A ときたあとに B を出すと A-B-A-B の往復になるので避ける
check('A-B-A のあとに B を出して往復しない',
  suggestNextChords({ chords: [cAt(7, 'major', 0), cAt(9, 'minor', 1), cAt(7, 'major', 2)], keyPc: 0 })
    .every(s => !(s.rootPc === 9 && s.type === 'minor')), true);

// 出発点と役割の全組み合わせで、押し続けても行き止まり・往復にならないこと
let deadEnd = 0, pingPong = 0, repeatSame = 0;
for (const startPc of [0, 2, 4, 5, 7, 9]) {
  for (const startType of ['major', 'minor', '7', 'maj7']) {
    for (const role of ['flow', 'lift', 'settle', 'color']) {
      const seq = [{ rootPc: startPc, type: startType, startCount: 0, lengthCount: 2 }];
      for (let i = 0; i < 12; i++) {
        const s = roleOf(suggestNextChords({ chords: seq, keyPc: 0 }), role);
        if (!s) { deadEnd++; break; }
        seq.push({ rootPc: s.rootPc, type: s.type, startCount: seq.length * 2, lengthCount: 2 });
      }
      for (let i = 1; i < seq.length; i++) {
        if (seq[i].rootPc === seq[i - 1].rootPc) { repeatSame++; break; }
      }
      for (let i = 3; i < seq.length; i++) {
        const [a, b, c, d2] = [seq[i - 3], seq[i - 2], seq[i - 1], seq[i]];
        if (a.rootPc === c.rootPc && a.type === c.type &&
            b.rootPc === d2.rootPc && b.type === d2.type) { pingPong++; break; }
      }
    }
  }
}
check('96パターン×12回押しても候補が尽きない', deadEnd, 0);
check('96パターン×12回押しても同じコードが連続しない', repeatSame, 0);
check('96パターン×12回押しても2つの間で往復しない', pingPong, 0);

// G（V）のあと：偽終止を提案できるか
const afterV = suggestNextChords({ chords: [cAt(7, 'major', 0)], keyPc: 0 });
check('V → 自然につなぐのはI（C）', roleOf(afterV, 'flow').name, 'C');
check('V → 盛り上げは偽終止のVIm（Am）', roleOf(afterV, 'lift').name, 'Am');

// セカンダリドミナント E7 のあと：4度上の Am へ解決するか
const afterE7 = suggestNextChords({ chords: [cAt(4, '7', 0)], keyPc: 0 });
check('E7 → 4度上のAmへ解決を提案', roleOf(afterE7, 'flow').name, 'Am');
check('E7 の解決の説明にドミナント7thと出る',
  roleOf(afterE7, 'flow').hint.includes('ドミナント7th'), true);
const afterD7 = suggestNextChords({ chords: [cAt(2, '7', 0)], keyPc: 0 });
check('D7 → 4度上のG（V）へ解決を提案', roleOf(afterD7, 'flow').name, 'G');

// キーを変えても度数関係が保たれる
const inG = suggestNextChords({ chords: [cAt(7, 'major', 0)], keyPc: 7 }); // キーG の I=G
check('キーGでも I → IV（C）', roleOf(inG, 'flow').name, 'C');
check('キーGでも 盛り上げはV7（D7）', roleOf(inG, 'lift').name, 'D7');

// 王道進行の途中
const afterFGEm = suggestNextChords({
  chords: [cAt(5, 'major', 0), cAt(7, 'major', 1), cAt(4, 'minor', 2)], keyPc: 0
});
check('IIImのあとはVIm（Am）へ', roleOf(afterFGEm, 'flow').name, 'Am');
check('すべての提案に度数表記がある', afterFGEm.every(s => s.degree && s.name), true);

// ============================================================
// 音の「のび」（再生エンジン）
// ============================================================
console.log('--- 音ののび ---');
check('のびは3段階', RING_MODES.map(r => r.id), ['short', 'normal', 'long']);
check('既定（ふつう）の余韻は0.3秒より長い', ringModeOf('normal').release > 0.3, true);
check('のばすは、ふつうより余韻が長い',
  ringModeOf('long').release > ringModeOf('normal').release, true);
check('未知のIDはふつうにフォールバック', ringModeOf('なにこれ').id, 'normal');
// BPM100・2カウント = 1.2秒ぶんの発音（ふつう＝等倍＋わずかな重なり）
check('ふつう: 2カウント@BPM100 は約1.3秒', Math.round(noteDuration(2, 100, 'normal') * 100) / 100, 1.3);
check('みじかく: 同じ音符でも短くなる', noteDuration(2, 100, 'short') < noteDuration(2, 100, 'normal'), true);
check('音符が長いほど発音も長い', noteDuration(4, 100, 'normal') > noteDuration(1, 100, 'normal'), true);
check('BPMが速いほど発音は短い', noteDuration(2, 160, 'normal') < noteDuration(2, 60, 'normal'), true);
check('発音秒数は必ず正', noteDuration(0, 100, 'short') > 0, true);


// ============================================================
// 音名の表記（♯/♭の綴り分け）
// ============================================================
console.log('--- 音名の表記 ---');
check('モードは4種類', NOTATION_MODES.map(m => m.id), ['auto', 'sharp', 'flat', 'both']);

setNotation('auto');
// 自動モード：キーの中で何度の音かで綴りが決まる
check('キーC の b6 は A♭', pcName(8, 0), 'A♭');
check('キーE の #5 は G♯（同じ音でもキーで変わる）', pcName(8, 4), 'G♯');
check('キーC の #4 は F♯', pcName(6, 0), 'F♯');
check('キーF の b7 は B♭', pcName(10, 5), 'B♭');
check('キーD♭ の #4 は G♭', pcName(6, 1), 'G♭');

// 各キーのメジャースケールが「7文字が1回ずつ」になること（＝綴りが理論的に正しい）
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
let scaleNg = [];
for (let k = 0; k < 12; k++) {
  const letters = MAJOR.map(o => pcName((k + o) % 12, k)[0]);
  if (new Set(letters).size !== 7) scaleNg.push(k);
}
// 白鍵にも変化記号を許したので、全12キーで文字が7つ揃う（G♭ の IV は C♭ になる）
check('全12キーのスケールで音名の文字が重複しない', scaleNg, []);
// 重変記号（♯♯ / ♭♭）が出ないこと
let heavy = [];
for (let k = 0; k < 12; k++) {
  for (let pc = 0; pc < 12; pc++) {
    const n = pcName(pc, k);
    if (n.length > 2) heavy.push(`key${k}:pc${pc}=${n}`);
  }
}
check('全144通りで重変記号が出ない', heavy, []);

// 固定モード
setNotation('sharp');
check('♯固定', [pcName(1), pcName(3), pcName(6), pcName(8), pcName(10)], ['C♯', 'D♯', 'F♯', 'G♯', 'A♯']);
setNotation('flat');
check('♭固定', [pcName(1), pcName(3), pcName(6), pcName(8), pcName(10)], ['D♭', 'E♭', 'G♭', 'A♭', 'B♭']);
setNotation('both');
// 「両方」でも主表記は自動と同じ。もう一方は別に取り、UI側で小さく添える。
// 名前の中に "/" を混ぜるとコード名が読みにくくなるため。
setDisplayKey(0);
check('両方でも主表記にスラッシュを混ぜない', pcName(8), 'A♭');
check('両方のもう一方の呼び方', pcAltName(8), 'G♯');
check('白鍵には別表記が無い', pcAltName(9), null);
check('コード名にもスラッシュを混ぜない', chordDisplayName(8, 'm7b5'), 'A♭m7♭5');
check('コード名のもう一方はルートだけ差し替わる', chordAltName(8, 'm7b5'), 'G♯m7♭5');
check('自動モードでは別表記を出さない',
  (setNotation('auto'), [pcAltName(8), chordAltName(8, 'm7')]), [null, null]);
check('どのモードでも主表記にスラッシュが出ない',
  ['auto', 'sharp', 'flat', 'both'].every(m => {
    setNotation(m);
    return [...Array(12).keys()].every(pc => !pcName(pc).includes('/'));
  }), true);
setNotation('both');

// 内部用の名前は変えない（soundfont-player に渡すため ASCII のままである必要がある）
setNotation('flat');
check('音源に渡す名前はASCIIのシャープ表記のまま', midiToNoteName(68), 'G#4');
check('画面に出す名前だけが切り替わる', midiDisplayName(68), 'A♭4');
check('内部名に Unicode の記号が混じらない',
  [...Array(128).keys()].every(m => /^[A-G]#?-?\d+$/.test(midiToNoteName(m))), true);

// コード名もキーに追従する
setNotation('auto');
setDisplayKey(0);
check('キーCでの借用和音', [[5, 'minor'], [8, 'major'], [10, 'major']]
  .map(([r, t]) => chordDisplayName(r, t)), ['Fm', 'A♭', 'B♭']);
setDisplayKey(2);
check('キーDでは♯側の綴りになる', [[6, 'major'], [1, 'minor']]
  .map(([r, t]) => chordDisplayName(r, t)), ['F♯', 'C♯m']);
check('引数でキーを明示すればそちらが優先', chordDisplayName(8, 'major', [], 0), 'A♭');
setDisplayKey(0);
check('モードは取得できる', getNotation(), 'auto');


// ============================================================
// コード名の読みやすさ / ドレミとの整合
// ============================================================
console.log('--- コード名の読みやすさ ---');
setNotation('auto'); setDisplayKey(8);
// 数字が連結して「A♭m76」のように読めなくなっていた
check('m7 + 6th は括弧でくくる', chordDisplayName(8, 'm7', ['6']), 'A♭m7(6)');
// フォールバックの「(9th)」ではなく、慣習表記になるようにした
check('m7♭5 + 9th', chordDisplayName(8, 'm7b5', ['9']), 'A♭m9♭5');
check('mM7 + 9th', chordDisplayName(8, 'mmaj7', ['9']), 'A♭mM9');
check('sus4 + 9th は括弧併記', chordDisplayName(8, 'sus4', ['9']), 'A♭sus4(9)');
check('コード名に "th" が混ざらない',
  Object.keys(CHORD_TYPE_LABELS).filter(t => t !== 'none')
    .every(t => !chordDisplayName(0, t, ['9']).includes('th')), true);
// 6th/add9 は型のラベル末尾の数字とくっつきやすいので、括弧でくくれているか全型で確認
//（C11 / C13 のような2桁のテンション数字は正しい表記なので対象外）
let glued = [];
for (const t of Object.keys(CHORD_TYPE_LABELS)) {
  if (t === 'none') continue;
  for (const tn of [['6'], ['6', 'add9'], ['add9']]) {
    const n = chordDisplayName(0, t, tn);
    if (/\d\d/.test(n.replace(/\(.*?\)/g, ''))) glued.push(`${t}+${tn}=${n}`);
  }
}
check('6th/add9 を足しても数字が連結しない', glued, []);
check('sus4 + 6th + add9', chordDisplayName(0, 'sus4', ['6', 'add9']), 'Csus4(6/9)');
check('dim7 + 6th', chordDisplayName(0, 'dim7', ['6']), 'Cdim7(6)');
check('三和音の 6th + add9 は素直に6/9', chordDisplayName(0, 'major', ['6', 'add9']), 'C6/9');

console.log('--- 「7が消えた」ときの内訳 ---');
check('m7 + 9th は m9 になるので内訳を出す',
  chordBreakdown(8, 'm7', ['9']), 'A♭m7 に 9th を足した形');
check('三和音 + 9th は♭7thが増えることも伝える',
  chordBreakdown(0, 'major', ['9']),
  'C に 9th を足した形（9th以上は7thの上に積むので、♭7thも一緒に入ります）');
check('名前が隠れないときは内訳を出さない', chordBreakdown(0, 'major', ['add9']), null);
check('テンションが無ければ内訳なし', chordBreakdown(0, 'm7', []), null);

console.log('--- ドレミ表記が音名の綴りに追従する ---');
setNotation('auto'); setDisplayKey(0);
check('キーCの b6 は ラ♭（音名 A♭ と一致）', [solfegeName(8), pcName(8)], ['ラ♭', 'A♭']);
setNotation('sharp');
check('♯モードなら ソ♯（音名 G♯ と一致）', [solfegeName(8), pcName(8)], ['ソ♯', 'G♯']);
setNotation('auto');
check('ドレミと音名で変化記号が食い違わない',
  [...Array(12).keys()].every(pc => {
    const s = solfegeName(pc), n = pcName(pc);
    return s.slice(-1) === n.slice(-1) || (!/[♯♭]/.test(s) && !/[♯♭]/.test(n));
  }), true);
check('白鍵は素のドレミ',
  [0, 2, 4, 5, 7, 9, 11].map(pc => solfegeName(pc)),
  ['ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ']);
setDisplayKey(0);


// ============================================================
// コード構成音の綴り（度数ベース）
// ============================================================
console.log('--- 構成音の綴り（度数ベース） ---');
setNotation('auto'); setDisplayKey(0);
const sp = (r, t, tn = []) => chordSpelling(r, t, tn).map(x => x.name).join(' ');
const dg = (r, t, tn = []) => chordSpelling(r, t, tn).map(x => x.degreeLabel).join(' ');

// キー基準で綴っていたときの誤り（Cdim→C E♭ F♯ 等）が直っているか
check('Cdim は♭5（F♯ではなくG♭）', sp(0, 'dim'), 'C E♭ G♭');
check('Caug は♯5（A♭ではなくG♯）', sp(0, 'aug'), 'C E G♯');
check('Dm7♭5 は♭5（G♯ではなくA♭）', sp(2, 'm7b5'), 'D F A♭ C');
setDisplayKey(8);
check('A♭m7 の短3度は C♭', sp(8, 'm7'), 'A♭ C♭ E♭ G♭');
setDisplayKey(0);
check('度数ラベル（dim）', dg(0, 'dim'), '1 ♭3 ♭5');
check('度数ラベル（aug）', dg(0, 'aug'), '1 3 ♯5');
check('度数ラベル（sus4）', dg(0, 'sus4'), '1 4 5');

// 重変記号が要る音は読みやすい表記に落とし、理論は度数ラベルに残す
check('Cdim7 の第4音は読みやすい表記に落とす', sp(0, 'dim7'), 'C E♭ G♭ A');
check('落としても度数は♭♭7のまま', dg(0, 'dim7'), '1 ♭3 ♭5 ♭♭7');
check('落としたことが flag で分かる',
  chordSpelling(0, 'dim7').map(x => x.simplified), [false, false, false, true]);

// テンション（buildChord と同じ音になっているか）
check('C + 9th は♭7も一緒に入る', sp(0, 'major', ['9']), 'C E G B♭ D');
check('C + 9th の度数', dg(0, 'major', ['9']), '1 3 5 ♭7 9');
check('Cmaj7 + 13th', dg(0, 'maj7', ['13']), '1 3 5 7 13');
check('C + add9 は7thを足さない', dg(0, 'major', ['add9']), '1 3 5 9');

// 音そのものは buildChord と一致していること（表示だけ変えて音がずれたら本末転倒）
let mismatch = [];
for (let r = 0; r < 12; r++) {
  for (const t of Object.keys(CHORD_INTERVALS)) {
    for (const tn of [[], ['9'], ['add9'], ['13'], ['6']]) {
      // sus2+9 のように同じピッチクラスが2オクターブに出る形があるので、両辺とも重複を除く
      const a = [...new Set(chordSpelling(r, t, tn).map(x => x.pc))].sort((x, y) => x - y);
      const b = [...new Set(buildChord({ rootPc: r, type: t, octave: 4, tensions: tn }).midi
        .map(m => m % 12))].sort((x, y) => x - y);
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatch.push(`${r}:${t}:${tn}`);
    }
  }
}
check('綴りの音が buildChord と完全に一致する（840通り）', mismatch, []);

// 度数どおりに文字が進んでいるか（3度なら文字は2つ先）＝音程が読める綴りになっているか
const L = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
let badSpell = [];
for (let r = 0; r < 12; r++) {
  for (const t of Object.keys(CHORD_INTERVALS)) {
    const list = chordSpelling(r, t);
    const rootLi = L.indexOf(list[0].name[0]);
    list.forEach(x => {
      if (x.simplified) return;   // 読みやすさ優先で落とした音は対象外
      if (L.indexOf(x.name[0]) !== (rootLi + x.degree - 1) % 7) badSpell.push(`${r}:${t}:${x.name}`);
    });
  }
}
check('全156通りで度数どおりの文字になっている', badSpell, []);

// ♯モードでもルートに合わせて綴りが変わる
setNotation('sharp');
check('♯モードの G♯m7', sp(8, 'm7'), 'G♯ B D♯ F♯');
setNotation('auto'); setDisplayKey(0);
check('Map から引ける', chordSpellingMap(0, 'dim').get(6).name, 'G♭');


// ============================================================
// オルタードテンション（♭9 / ♯9 / ♯11 / ♭13）
// ============================================================
console.log('--- オルタードテンション ---');
setNotation('auto'); setChordStyle('pop');
check('4種類が追加されている',
  ['b9', '#9', '#11', 'b13'].every(k => TENSIONS[k]?.altered), true);
// コード名は代表数字にせず、括弧で併記する（楽譜の書き方に合わせる）
setDisplayKey(1);
check('D♭7(♭13)', chordDisplayName(1, '7', ['b13']), 'D♭7(♭13)');
setDisplayKey(10);
check('B♭7(♭9♭13)', chordDisplayName(10, '7', ['b9', 'b13']), 'B♭7(♭9♭13)');
setDisplayKey(0);
check('C7(♯9)', chordDisplayName(0, '7', ['#9']), 'C7(♯9)');
check('Cmaj7(♯11)', chordDisplayName(0, 'maj7', ['#11']), 'Cmaj7(♯11)');
check('通常テンションと併用: C9(♭13)', chordDisplayName(0, '7', ['9', 'b13']), 'C9(♭13)');
check('三和音に付けると7も出る', chordDisplayName(0, 'major', ['b9']), 'C7(♭9)');
check('♭9♭13 は音程順に並ぶ', chordDisplayName(0, '7', ['b13', 'b9']), 'C7(♭9♭13)');

// 綴りと度数
check('C7(♭9) の綴り', chordSpelling(0, '7', ['b9']).map(x => x.name).join(' '), 'C E G B♭ D♭');
check('C7(♭9) の度数', chordSpelling(0, '7', ['b9']).map(x => x.degreeLabel).join(' '), '1 3 5 ♭7 ♭9');
check('C7(♯11) の綴り', chordSpelling(0, '7', ['#11']).map(x => x.name).join(' '), 'C E G B♭ F♯');
check('C7(♭13) の度数', chordSpelling(0, '7', ['b13']).map(x => x.degreeLabel).join(' '), '1 3 5 ♭7 ♭13');
check('♭9 の説明文がある', degreeMeaning('♭9').length > 0, true);
check('積み木の役割にも入っている', [_nr(13).label, _nr(15).label, _nr(18).label, _nr(20).label],
  ['♭9th', '♯9th', '♯11th', '♭13th']);

// 音が buildChord と一致するか（オルタード込みで全ルート×全タイプ）
let altNg = [];
for (let r = 0; r < 12; r++) {
  for (const t of Object.keys(CHORD_INTERVALS)) {
    for (const tn of [['b9'], ['#9'], ['#11'], ['b13'], ['b9', 'b13'], ['9', '#11']]) {
      const a = [...new Set(chordSpelling(r, t, tn).map(x => x.pc))].sort((x, y) => x - y);
      const b = [...new Set(buildChord({ rootPc: r, type: t, octave: 4, tensions: tn }).midi
        .map(m => m % 12))].sort((x, y) => x - y);
      if (JSON.stringify(a) !== JSON.stringify(b)) altNg.push(`${r}:${t}:${tn}`);
    }
  }
}
check('オルタード込みでも音が buildChord と一致（1008通り）', altNg, []);

// 手書き楽譜のコードが再現できるか
setDisplayKey(1);
check('楽譜のコード列を再現',
  [[1, '7', ['b13']], [10, '7', ['b9', 'b13']], [8, 'm7', []], [6, 'maj7', []], [5, 'm7b5', []]]
    .map(([r, t, tn]) => chordDisplayName(r, t, tn)),
  ['D♭7(♭13)', 'B♭7(♭9♭13)', 'A♭m7', 'G♭maj7', 'Fm7♭5']);

console.log('--- コード記号の表記スタイル ---');
setDisplayKey(0);
check('3スタイル', CHORD_STYLES.map(s => s.id), ['pop', 'short', 'jazz']);
const symbols = () => [[0, 'maj7'], [0, 'm7b5'], [0, 'dim'], [0, 'aug'], [0, 'mmaj7']]
  .map(([r, t]) => chordDisplayName(r, t));
setChordStyle('pop');
check('ポップス表記', symbols(), ['Cmaj7', 'Cm7♭5', 'Cdim', 'Caug', 'CmM7']);
setChordStyle('short');
check('省略形', symbols(), ['CM7', 'Cm7-5', 'Cdim', 'Caug', 'CmM7']);
setChordStyle('jazz');
check('ジャズ表記（△7 / ø / ° / +）', symbols(), ['C△7', 'Cø', 'C°', 'C+', 'Cm△7']);
check('スタイルを変えても音は変わらない',
  buildChord({ rootPc: 0, type: 'maj7', octave: 4 }).noteNames, ['C4', 'E4', 'G4', 'B4']);
check('未知のスタイルはポップスに戻る', (setChordStyle('なにこれ'), getChordStyle()), 'pop');
setChordStyle('pop');


// ============================================================
// オーバードーズ（採譜した進行のプリセット）
// ============================================================
console.log('--- お試しコード進行 ---');
setNotation('auto'); setChordStyle('pop');
const od = PROGRESSION_PRESETS.find(p => p.id === 'otameshi');
check('プリセットが存在する', od?.name, 'お試しコード');
check('原曲キーはG♭', presetKeyPc(od), 6);
setDisplayKey(presetKeyPc(od));
check('譜面どおりのコード列',
  presetToChords(od, presetKeyPc(od)).map(c => chordDisplayName(c.rootPc, c.type, c.tensions)),
  ['A♭m9', 'D♭7(13)', 'G♭maj7', 'C♭maj7', 'Fm7♭5', 'B♭7(♭13)', 'E♭maj7']);
// キーG♭ の IV は B ではなく C♭（4番目の文字がCだから）
check('IVは C♭ と綴られる', pcName(11, 6), 'C♭');
check('キーCへ移調しても度数関係が保たれる',
  (setDisplayKey(0), presetToChords(od, 0).map(c => chordDisplayName(c.rootPc, c.type, c.tensions))),
  ['Dm9', 'G7(13)', 'Cmaj7', 'Fmaj7', 'Bm7♭5', 'E7(♭13)', 'Amaj7']);
check('全コードが発音できる',
  presetToChords(od, 6).every(c => buildChord({ ...c, octave: 4 }).midi.length > 0), true);
// プリセットのテンションが取りこぼされていないか
check('テンションが presetToChords から渡る',
  presetToChords(od, 6).map(c => c.tensions.join('')), ['9', '13', '', '', '', 'b13', '']);

console.log('--- 13th の書き分け（C13 と C7(13) は別物） ---');
setDisplayKey(0);
check('9thまで積めば C13', chordDisplayName(0, '7', ['9', '13']), 'C13');
check('9thが無ければ C7(13)', chordDisplayName(0, '7', ['13']), 'C7(13)');
check('11thも同じ', chordDisplayName(0, '7', ['11']), 'C7(11)');
check('9thがあれば C11', chordDisplayName(0, '7', ['9', '11']), 'C11');
check('maj7 + 13th', chordDisplayName(0, 'maj7', ['13']), 'Cmaj7(13)');
check('三和音に13thを足すと♭7が入るので7を明示', chordDisplayName(0, 'major', ['13']), 'C7(13)');
check('マイナー三和音でも同様', chordDisplayName(0, 'minor', ['13']), 'Cm7(13)');
check('9thだけなら従来どおり C9', chordDisplayName(0, '7', ['9']), 'C9');
// 音は書き分けによって変わらない
check('C7(13) と C13 で音が違う（13だけ vs 9も入る）',
  [buildChord({ rootPc: 0, type: '7', octave: 4, tensions: ['13'] }).midi.length,
   buildChord({ rootPc: 0, type: '7', octave: 4, tensions: ['9', '13'] }).midi.length], [5, 6]);


console.log('--- オクターブ番号は「文字」で決まる ---');
setNotation('auto'); setDisplayKey(6);   // キーG♭
// C♭4 は C4 の半音下（MIDI 59）。B3 と同じ高さでも、文字がCなので番号は4になる
check('MIDI 59 は C♭4（B3と同じ高さ）', midiDisplayName(59), 'C♭4');
check('MIDI 47 は C♭3', midiDisplayName(47), 'C♭3');
check('MIDI 71 は C♭5', midiDisplayName(71), 'C♭5');
check('♭が付かない音はそのまま', [midiDisplayName(60), midiDisplayName(58)], ['C4', 'B♭3']);
setNotation('sharp'); setDisplayKey(0);
check('♯側も同じ規則（F♯4 は MIDI 66）', midiDisplayName(66), 'F♯4');
// 表示が変わってもMIDIへ戻せること（表記と実体がずれていない確認）
setNotation('auto');
let octNg = [];
for (let k = 0; k < 12; k++) {
  setDisplayKey(k);
  for (let m = 24; m <= 96; m++) {
    const n = midiDisplayName(m);
    const oct = parseInt(n.match(/-?\d+$/)[0], 10);
    const body = n.replace(/-?\d+$/, '');
    const acc = (body.match(/♯/g)?.length ?? 0) - (body.match(/♭/g)?.length ?? 0);
    const base = [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(body[0])];
    if (12 * (oct + 1) + base + acc !== m) octNg.push(`key${k}:${m}=${n}`);
  }
}
check('全12キー×MIDI24-96で表示から元のMIDIに戻せる', octNg, []);
setDisplayKey(0);


console.log('--- プリセットのベースライン ---');
const bassMidi = (preset, k) => presetToBass(preset, k)
  .map(b => 12 * (b.octave + 1) + b.rootPc);
const toName = (preset, k) => (setDisplayKey(k), presetToBass(preset, k)
  .map(b => midiDisplayName(12 * (b.octave + 1) + b.rootPc)));
setNotation('auto');
check('お試しコードはベースラインを持つ', Array.isArray(od.bass), true);
check('譜面どおりのベース（キーG♭）', toName(od, 6),
  ['A♭2', 'D♭2', 'G♭2', 'C♭2', 'F2', 'B♭1', 'E♭2']);
// 5度下がって4度上がる動きが保たれているか
const motion = (k) => { const m = bassMidi(od, k); return m.slice(1).map((x, i) => x - m[i]); };
check('動きは -7 +5 -7 +6 -7 +5', motion(6), [-7, 5, -7, 6, -7, 5]);
check('キーCへ移調しても形が同じ', motion(0), motion(6));
check('全12キーで形が保たれる',
  [...Array(12).keys()].every(k => JSON.stringify(motion(k)) === JSON.stringify(motion(6))), true);
check('コードの数とベースの数が一致', presetToBass(od, 6).length, od.degrees.length);
// ベースの1音目はコードのルートと同じ音名になっているか
check('各ベース音がコードのルートと一致',
  presetToBass(od, 6).map(b => b.rootPc), presetToChords(od, 6).map(c => c.rootPc));
check('ベースを持たないプリセットは null', presetToBass(oudou, 0), null);
check('基準オクターブ', BASS_BASE_OCTAVE, 2);
setDisplayKey(0);

console.log(`\n結果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
