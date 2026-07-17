// ========================================
// keyboard.js - ミニ鍵盤コンポーネント（表示＋ハイライト）
// mainPageの鍵盤と同じ見た目をどのページでも使えるように切り出したもの。
// 音は鳴らさない（audioEngineとの接続はページ側が行う）。
// ========================================

/**
 * @param {HTMLElement} rootEl 描画先（.keyboard クラスが付与される）
 * @param {object} opts { startOctave, octaves }
 * @returns {{ highlight(midis, accentSet), clear() }}
 *   accentSet に入っているMIDIはテンション色（強調色）で光る
 */
export function createKeyboard(rootEl, { startOctave = 4, octaves = 2 } = {}) {
  rootEl.classList.add('keyboard');
  rootEl.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'keyboard-inner';

  const whitePattern = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const blackAfter = new Set([0, 1, 3, 4, 5]);
  let whiteIndex = 0;
  for (let o = 0; o < octaves; o++) {
    whitePattern.forEach((pc, i) => {
      const midi = 12 * (startOctave + o + 1) + pc;
      const div = document.createElement('div');
      div.className = 'key white';
      div.style.left = `${whiteIndex * 40}px`;
      div.dataset.midi = midi;
      inner.appendChild(div);
      if (blackAfter.has(i)) {
        const bDiv = document.createElement('div');
        bDiv.className = 'key black';
        bDiv.style.left = `${(whiteIndex + 1) * 40 - 13}px`;
        bDiv.dataset.midi = midi + 1;
        inner.appendChild(bDiv);
      }
      whiteIndex++;
    });
  }
  inner.style.width = `${whiteIndex * 40}px`;
  rootEl.appendChild(inner);

  return {
    highlight(midis, accentSet = new Set()) {
      inner.querySelectorAll('.key').forEach(k =>
        k.classList.remove('chord-tone', 'tension-tone'));
      for (const m of midis) {
        const el = inner.querySelector(`.key[data-midi="${m}"]`);
        if (el) el.classList.add(accentSet.has(m) ? 'tension-tone' : 'chord-tone');
      }
    },
    clear() {
      inner.querySelectorAll('.key').forEach(k =>
        k.classList.remove('chord-tone', 'tension-tone'));
    }
  };
}
