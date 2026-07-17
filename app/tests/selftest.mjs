// ========================================
// selftest.mjs - core/data ロジックのセルフテスト
// 実行: node tests/selftest.mjs （appディレクトリで）
// ========================================

import {
  buildChord, midiToNoteName, noteNameToPc, degreeToRoman,
  transposeProgression, chordDisplayName, matchProgressions
} from '../js/core/musicTheory.js';
import { PROGRESSION_PRESETS, presetToChords } from '../js/data/progressions.js';
import {
  createTimeline, addEvent, eventMidi, transposeEvent, moveEvent,
  toPlayableTracks, timelineEnd, pitchRange
} from '../js/core/timeline.js';
import { findSimilarProgressions, matchMessage, songsForPattern } from '../js/data/songs.js';
import { getMagicCircleRootRadius } from '../js/ui/magicCircle.js';

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
// 既に7thを持つコードには9thだけが足される
const cmaj9 = buildChord({ rootPc: 0, type: 'maj7', octave: 4, tensions: ['9'] });
check('Cmaj7(9) は7thを重複追加しない', cmaj9.noteNames, ['C4', 'E4', 'G4', 'B4', 'D5']);

console.log('--- 魔法陣の座標計算 ---');
check('ルートハイライトは既定で外周の0.8倍', getMagicCircleRootRadius(240), 192);
check('スケール表示時は外周に寄せる', getMagicCircleRootRadius(240, { showDiatonicScale: true }), 240);
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
check('王道進行 Key=D', oudouInD.map(c => chordDisplayName(c.rootPc, c.type)), ['G', 'A', 'F#m', 'Bm']);

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

console.log(`\n結果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
