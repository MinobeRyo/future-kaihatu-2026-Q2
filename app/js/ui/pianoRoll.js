// ========================================
// pianoRoll.js - ピアノロール描画コンポーネント（④・Step2 + 拡張版）
// 縦=音高、横=カウント。3トラックを色分けして1つのグリッドに表示する。
// 状態は持たない（timeline.js のデータを受け取って描くだけ）。
// 操作: クリック=選択 / ノート中央をドラッグ=移動・移調 /
//       ノート左右端をドラッグ=長さ変更（左端=開始位置を伸縮、右端=末尾を伸縮） /
//       ノート上でホイール=長さ変更（右端ドラッグの代替） /
//       何もない場所にマウスを乗せると点線プレビュー→クリックで確定追加
// ========================================

import { midiDisplayName, chordDisplayName } from '../core/musicTheory.js';
import { TRACKS, eventMidi, timelineEnd, fixedPitchRange } from '../core/timeline.js';

export const COUNT_W = 64;  // 1カウントの幅(px)
export const ROW_H = 20;    // 半音1つの行の高さ(px)
const RULER_H = 24;
const SNAP = 0.5;           // タップ追加・リサイズのスナップ単位（カウント）
const EDGE_PX = 10;         // ノート端のリサイズ判定幅(px)
const BLACK = new Set([1, 3, 6, 8, 10]);
const MINOR_TYPES = ['minor', 'm7', 'dim', 'm7b5', 'mmaj7', 'dim7'];
const MM_W = 160;           // ミニマップ（全体プレビュー）の幅(px)
const MM_H = 76;            // ミニマップの高さ(px)

/**
 * @param {HTMLElement} rootEl 描画先
 * @param {object} cb コールバック
 *   onSelect(ref)                クリックで選択されたとき（ref = "track:id"）
 *   onCommit(ref, dCount, dSemi) ドラッグ確定（横=カウント移動、縦=半音移調）
 *   onResize(ref, dCount)        右端ドラッグ/ホイールでの長さ変更確定（±0.5刻み）
 *   onResizeLeft(ref, dCount)    左端ドラッグでの開始位置・長さ変更確定（±0.5刻み）
 *   onAddAt(count, midi)         何もない場所をクリックして音を追加（count>=0 に丸め済み）
 */
export function createPianoRoll(rootEl, { onSelect, onCommit, onResize, onResizeLeft, onAddAt } = {}) {
  rootEl.classList.add('proll');
  let selectedRef = null;
  let playheadEl = null;
  let ghostEl = null;
  let lastRange = null;
  let lastTl = null;
  let ghostSpec = { lengthCount: 1, trackClass: 't-melody' };
  let minimapViewportEl = null;
  let mmScale = null; // { scaleX, scaleY, totalW, fullH }

  function updateMinimapViewport() {
    if (!minimapViewportEl || !mmScale) return;
    const { scaleX, scaleY } = mmScale;
    minimapViewportEl.style.left = `${rootEl.scrollLeft * scaleX}px`;
    minimapViewportEl.style.top = `${rootEl.scrollTop * scaleY}px`;
    minimapViewportEl.style.width = `${Math.max(4, rootEl.clientWidth * scaleX)}px`;
    minimapViewportEl.style.height = `${Math.max(4, rootEl.clientHeight * scaleY)}px`;
  }
  rootEl.addEventListener('scroll', updateMinimapViewport);

  const refToBlocks = (ref) =>
    rootEl.querySelectorAll(`.proll-note[data-ev="${ref}"]`);

  function applySelection() {
    rootEl.querySelectorAll('.proll-note').forEach(b =>
      b.classList.toggle('selected', b.dataset.ev === selectedRef));
  }

  // canvas上のクライアント座標 → { count, midi }（0.5カウント刻み・0未満にはならない）
  // カーソルが置かれる音符の「中央」に来るよう、長さの半分だけ左にオフセットしてからスナップする。
  function posToGrid(canvas, clientX, clientY, lengthCount = 0) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - (lengthCount * COUNT_W) / 2;
    const y = clientY - rect.top;
    const count = Math.max(0, Math.round((x / COUNT_W) / SNAP) * SNAP);
    const rowIndex = Math.floor((y - RULER_H) / ROW_H);
    const midi = lastRange ? lastRange.high - rowIndex : null;
    return { count, midi, y };
  }

  function positionGhost() {
    if (!ghostEl || !lastRange) return;
    ghostEl.style.left = `${ghostPos.count * COUNT_W + 1}px`;
    ghostEl.style.top = `${RULER_H + (lastRange.high - ghostPos.midi) * ROW_H + 1}px`;
    ghostEl.style.width = `${ghostSpec.lengthCount * COUNT_W - 3}px`;
    ghostEl.style.height = `${ROW_H - 2}px`;
    ghostEl.className = `proll-ghost ${ghostSpec.trackClass}`;
    ghostEl.style.display = 'block';
  }
  let ghostPos = { count: 0, midi: 60 };

  let hasRenderedOnce = false;

  function render(tl) {
    lastTl = tl;
    // 再描画のたびに rootEl.innerHTML をリセットするとスクロール位置が0に戻って画面が
    // ガクッとズレて見えるため、描画前後でスクロール位置を保存・復元する。
    const prevScrollLeft = rootEl.scrollLeft;
    const prevScrollTop = rootEl.scrollTop;
    const totalCounts = Math.max(8, Math.ceil(timelineEnd(tl)) + 4);
    // 音域はノートの内容に関わらず常に固定（A0〜C8=88鍵ぶん）。
    // データに応じて範囲が動くと、既存ノートの行位置ごと動いて画面がズレて見えるため。
    const range = fixedPitchRange();
    lastRange = range;
    const rows = range.high - range.low + 1;
    const gridH = rows * ROW_H;
    const totalW = totalCounts * COUNT_W;

    rootEl.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'proll-inner';

    // 左端の鍵盤風ラベル列（横スクロールしても左に固定・Cのみ音名表示）
    const keys = document.createElement('div');
    keys.className = 'proll-keys';
    keys.style.height = `${RULER_H + gridH}px`;
    const pad = document.createElement('div');
    pad.style.height = `${RULER_H}px`;
    keys.appendChild(pad);
    for (let m = range.high; m >= range.low; m--) {
      const isC = m % 12 === 0;
      const row = document.createElement('div');
      row.className = 'proll-key' + (BLACK.has(m % 12) ? ' black' : ' white') + (isC ? ' c-key' : '');
      row.style.height = `${ROW_H}px`;
      row.style.lineHeight = `${ROW_H}px`;
      if (isC) row.textContent = midiDisplayName(m); // Cだけ音名表示（見やすさ優先）
      keys.appendChild(row);
    }
    inner.appendChild(keys);

    // グリッド本体
    const canvas = document.createElement('div');
    canvas.className = 'proll-canvas';
    canvas.style.width = `${totalW}px`;
    canvas.style.height = `${RULER_H + gridH}px`;

    // カウントルーラー
    const ruler = document.createElement('div');
    ruler.className = 'proll-ruler';
    ruler.style.width = `${totalW}px`;
    ruler.style.height = `${RULER_H}px`;
    for (let c = 0; c < totalCounts; c++) {
      const cell = document.createElement('span');
      cell.className = 'proll-ruler-cell';
      cell.style.left = `${c * COUNT_W}px`;
      cell.textContent = c + 1;
      ruler.appendChild(cell);
    }
    canvas.appendChild(ruler);

    // 行ストライプ（黒鍵行を薄く塗る・Cの行に区切り線）
    for (let m = range.high; m >= range.low; m--) {
      const row = document.createElement('div');
      row.className = 'proll-row'
        + (BLACK.has(m % 12) ? ' black' : '')
        + (m % 12 === 0 ? ' c-line' : '');
      row.style.top = `${RULER_H + (range.high - m) * ROW_H}px`;
      row.style.height = `${ROW_H}px`;
      canvas.appendChild(row);
    }

    // 拍線（4カウントごとに小節線）
    for (let c = 0; c <= totalCounts; c++) {
      const line = document.createElement('div');
      line.className = 'proll-beat' + (c % 4 === 0 ? ' bar' : '');
      line.style.left = `${c * COUNT_W}px`;
      line.style.height = `${RULER_H + gridH}px`;
      canvas.appendChild(line);
    }

    // ノートブロック（トラック別に色分け。startCount順に並べて描画順=時系列にする）
    for (const track of TRACKS) {
      const sorted = [...tl[track]].sort((a, b) => a.startCount - b.startCount);
      sorted.forEach((ev) => {
        const midis = eventMidi(track, ev);
        const topMost = Math.max(...midis);
        for (const m of midis) {
          const b = document.createElement('div');
          b.className = `proll-note t-${track}`;
          if (track === 'chord' && MINOR_TYPES.includes(ev.type)) b.classList.add('minor-q');
          b.dataset.ev = `${track}:${ev.id}`;
          b.style.left = `${ev.startCount * COUNT_W + 1}px`;
          b.style.top = `${RULER_H + (range.high - m) * ROW_H + 1}px`;
          b.style.height = `${ROW_H - 2}px`;
          b.style.lineHeight = `${ROW_H - 2}px`;
          b.style.width = `${ev.lengthCount * COUNT_W - 3}px`;
          b.title = '中央をドラッグ=移動/移調・左右端をドラッグ=長さ変更・ホイール=長さ変更';
          // コードは最上音にコード名、単音は音名を表示
          if (track === 'chord' && m === topMost) {
            b.textContent = chordDisplayName(ev.rootPc, ev.type);
          } else if (track !== 'chord') {
            b.textContent = midiDisplayName(m);
          }
          canvas.appendChild(b);
        }
      });
    }

    // 追加プレビュー（点線ゴースト）
    ghostEl = document.createElement('div');
    ghostEl.className = 'proll-ghost';
    ghostEl.style.display = 'none';
    canvas.appendChild(ghostEl);

    // 再生ヘッド
    playheadEl = document.createElement('div');
    playheadEl.className = 'proll-playhead';
    playheadEl.style.height = `${RULER_H + gridH}px`;
    playheadEl.style.display = 'none';
    canvas.appendChild(playheadEl);

    inner.appendChild(canvas);

    // 全体プレビュー（ミニマップ）: 左上に固定表示され、全ノートを縮小して見せる。
    const fullH = RULER_H + gridH;
    const scaleX = MM_W / totalW;
    const scaleY = MM_H / fullH;
    mmScale = { scaleX, scaleY, totalW, fullH };

    const mmAnchor = document.createElement('div');
    mmAnchor.className = 'proll-minimap-anchor';
    const minimap = document.createElement('div');
    minimap.className = 'proll-minimap';
    for (const track of TRACKS) {
      for (const ev of tl[track]) {
        const midis = eventMidi(track, ev);
        const mLow = Math.min(...midis), mHigh = Math.max(...midis);
        const dot = document.createElement('div');
        dot.className = `proll-minimap-note t-${track}`;
        if (track === 'chord' && MINOR_TYPES.includes(ev.type)) dot.classList.add('minor-q');
        dot.style.left = `${ev.startCount * COUNT_W * scaleX}px`;
        dot.style.top = `${(RULER_H + (range.high - mHigh) * ROW_H) * scaleY}px`;
        dot.style.width = `${Math.max(2, ev.lengthCount * COUNT_W * scaleX)}px`;
        dot.style.height = `${Math.max(2, (mHigh - mLow + 1) * ROW_H * scaleY)}px`;
        minimap.appendChild(dot);
      }
    }
    minimapViewportEl = document.createElement('div');
    minimapViewportEl.className = 'proll-minimap-viewport';
    minimap.appendChild(minimapViewportEl);
    minimap.addEventListener('click', (e) => {
      const rect = minimap.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      rootEl.scrollTo({
        left: Math.max(0, x / scaleX - rootEl.clientWidth / 2),
        top: Math.max(0, y / scaleY - rootEl.clientHeight / 2),
        behavior: 'smooth'
      });
    });
    mmAnchor.appendChild(minimap);

    rootEl.appendChild(mmAnchor);
    rootEl.appendChild(inner);
    if (!hasRenderedOnce) {
      // 初回だけ、C4あたりが画面の中央に来るようにスクロール位置を設定する
      // （固定音域は88鍵ぶんあるので、何もしないと一番上＝高音域から始まってしまう）
      const c4Row = range.high - 60;
      rootEl.scrollTop = Math.max(0, RULER_H + c4Row * ROW_H - rootEl.clientHeight / 2);
      rootEl.scrollLeft = 0;
      hasRenderedOnce = true;
    } else {
      // 2回目以降はスクロール位置を復元（固定音域なので行の意味は常に同じ＝ズレない）
      rootEl.scrollLeft = prevScrollLeft;
      rootEl.scrollTop = prevScrollTop;
    }
    updateMinimapViewport();
    applySelection();
  }

  // ノート要素内でのポインタX位置から掴んだ部位を判定する
  function pickEdge(block, clientX) {
    const rect = block.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    if (rect.width <= EDGE_PX * 2.2) return 'move'; // 短すぎるノートは端判定をしない（誤操作防止）
    if (offsetX <= EDGE_PX) return 'left';
    if (offsetX >= rect.width - EDGE_PX) return 'right';
    return 'move';
  }

  // --- ドラッグ操作（クリック=選択/追加、ドラッグ=移動/移調/リサイズ） ---
  let drag = null;

  rootEl.addEventListener('pointerdown', (e) => {
    const block = e.target.closest('.proll-note');
    if (block) {
      e.preventDefault();
      const edge = pickEdge(block, e.clientX);
      const [track, idStr] = block.dataset.ev.split(':');
      const ev = lastTl?.[track]?.find(x => String(x.id) === idStr);
      if (edge === 'left') {
        drag = { mode: 'resize-left', ref: block.dataset.ev, x0: e.clientX, startCount0: ev?.startCount ?? 0, startLen0: ev?.lengthCount ?? 1, dCount: 0, moved: false };
      } else if (edge === 'right') {
        drag = { mode: 'resize-right', ref: block.dataset.ev, x0: e.clientX, startLen0: ev?.lengthCount ?? 1, dCount: 0, moved: false };
      } else {
        drag = { mode: 'move', ref: block.dataset.ev, x0: e.clientX, y0: e.clientY, dCount: 0, dSemi: 0, moved: false };
      }
      rootEl.setPointerCapture(e.pointerId);
      return;
    }
    const canvas = e.target.closest('.proll-canvas');
    if (canvas) {
      const { count, midi, y } = posToGrid(canvas, e.clientX, e.clientY, ghostSpec.lengthCount);
      if (y > RULER_H) {
        drag = { mode: 'add', x0: e.clientX, y0: e.clientY, count, midi, moved: false };
        rootEl.setPointerCapture(e.pointerId);
      }
    }
  });

  rootEl.addEventListener('pointermove', (e) => {
    if (drag) {
      if (drag.mode === 'move') {
        const dCount = Math.round((e.clientX - drag.x0) / COUNT_W / SNAP) * SNAP;
        const dSemi = -Math.round((e.clientY - drag.y0) / ROW_H);           // 上=音を上げる
        if (dCount === drag.dCount && dSemi === drag.dSemi) return;
        drag.dCount = dCount;
        drag.dSemi = dSemi;
        if (dCount !== 0 || dSemi !== 0) drag.moved = true;
        refToBlocks(drag.ref).forEach(b => {
          b.style.transform = `translate(${dCount * COUNT_W}px, ${-dSemi * ROW_H}px)`;
        });
      } else if (drag.mode === 'resize-right') {
        const dCount = Math.round((e.clientX - drag.x0) / COUNT_W / SNAP) * SNAP;
        if (dCount === drag.dCount) return;
        drag.dCount = dCount;
        if (dCount !== 0) drag.moved = true;
        const newLen = Math.max(0.5, drag.startLen0 + dCount);
        refToBlocks(drag.ref).forEach(b => { b.style.width = `${newLen * COUNT_W - 3}px`; });
      } else if (drag.mode === 'resize-left') {
        let dCount = Math.round((e.clientX - drag.x0) / COUNT_W / SNAP) * SNAP;
        const maxTrim = drag.startLen0 - 0.5;
        const minTrim = -drag.startCount0;
        dCount = Math.max(minTrim, Math.min(dCount, maxTrim));
        if (dCount === drag.dCount) return;
        drag.dCount = dCount;
        if (dCount !== 0) drag.moved = true;
        const newStart = drag.startCount0 + dCount;
        const newLen = drag.startLen0 - dCount;
        refToBlocks(drag.ref).forEach(b => {
          b.style.left = `${newStart * COUNT_W + 1}px`;
          b.style.width = `${newLen * COUNT_W - 3}px`;
        });
      } else if (drag.mode === 'add') {
        const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true; // 4px以上動いたらクリック扱いしない
        if (!drag.moved && ghostEl) ghostEl.style.display = 'none'; // ドラッグ中はプレビュー非表示（誤解防止）
      }
      return;
    }
    // ドラッグ中でなければ、ノート上にいるときは端/中央に応じてカーソルを変える
    const hoverBlock = e.target.closest('.proll-note');
    if (hoverBlock) {
      if (ghostEl) ghostEl.style.display = 'none';
      const edge = pickEdge(hoverBlock, e.clientX);
      hoverBlock.style.cursor = edge === 'move' ? 'grab' : 'ew-resize';
      return;
    }
    // ドラッグ中でなければホバー中の追加プレビュー（点線）を更新
    const canvas = e.target.closest('.proll-canvas');
    if (!canvas) {
      if (ghostEl) ghostEl.style.display = 'none';
      return;
    }
    const { count, midi, y } = posToGrid(canvas, e.clientX, e.clientY, ghostSpec.lengthCount);
    if (y <= RULER_H) {
      if (ghostEl) ghostEl.style.display = 'none';
      return;
    }
    ghostPos = { count, midi };
    positionGhost();
  });

  rootEl.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.mode === 'move') {
      const { ref, dCount, dSemi, moved } = drag;
      drag = null;
      if (moved && (dCount !== 0 || dSemi !== 0)) {
        onCommit?.(ref, dCount, dSemi);
      } else {
        onSelect?.(ref);
      }
    } else if (drag.mode === 'resize-right') {
      const { ref, dCount, moved } = drag;
      drag = null;
      if (moved && dCount !== 0) onResize?.(ref, dCount);
      else onSelect?.(ref);
    } else if (drag.mode === 'resize-left') {
      const { ref, dCount, moved } = drag;
      drag = null;
      if (moved && dCount !== 0) onResizeLeft?.(ref, dCount);
      else onSelect?.(ref);
    } else if (drag.mode === 'add') {
      const { moved, count, midi } = drag;
      drag = null;
      if (!moved) {
        onAddAt?.(count, midi);
      }
    }
  });

  rootEl.addEventListener('pointercancel', () => {
    if (!drag) return;
    if (drag.mode === 'move') {
      refToBlocks(drag.ref).forEach(b => { b.style.transform = ''; });
    } else if (drag.mode === 'resize-right' || drag.mode === 'resize-left') {
      // 位置・幅を再描画で元に戻す（renderし直すまでの一時ズレは許容）
    }
    drag = null;
  });

  rootEl.addEventListener('pointerleave', () => {
    if (ghostEl) ghostEl.style.display = 'none';
  });

  // ノート上でのホイール操作 = 長さ変更（±0.5カウント刻み）。右端ドラッグの代替手段。
  rootEl.addEventListener('wheel', (e) => {
    const block = e.target.closest('.proll-note');
    if (!block) return;
    e.preventDefault();
    const dCount = e.deltaY < 0 ? SNAP : -SNAP;
    onResize?.(block.dataset.ev, dCount);
  }, { passive: false });

  return {
    render,
    setSelected(ref) { selectedRef = ref; applySelection(); },
    setGhostSpec(spec) {
      ghostSpec = { ...ghostSpec, ...spec };
      if (ghostEl && ghostEl.style.display === 'block') positionGhost();
    },
    setPlayhead(count) {
      if (!playheadEl) return;
      playheadEl.style.display = 'block';
      playheadEl.style.left = `${count * COUNT_W}px`;
    },
    clearPlayhead() {
      if (playheadEl) playheadEl.style.display = 'none';
    }
  };
}
