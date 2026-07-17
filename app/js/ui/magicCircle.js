// ========================================
// magicCircle.js - 音楽の魔法陣 Canvas描画コンポーネント
// 旧アプリ MusicMagicCircle.js の図形を移植（ライトテーマ配色）。
//   - クロマチック円（12音・外円/内円/区切り線）
//   - ドラッグで30°ずつ回転できる内側図形（ダイアトニックスケール・コード三角形）
//   - ルート音のクリック選択＋黄色ハイライト
// 旧版からの改善:
//   - 文字は図形と一緒に回転させない（位置だけ回転に追従、常に水平で描く）
//   - 回転するとルート音（黄色ハイライト）も一緒に移動する
//   - 図形は太線＋半透明の塗りつぶし＋頂点マーカーでメリハリを強調
//   - ラベルがキャンバス外に切れないよう配置を調整
// 音は鳴らさない（audioEngineとの接続はページ側が行う）。
// ========================================

import { NOTE_LETTERS } from '../core/musicTheory.js';

const COLORS = {
  bg: '#ffffff',
  line: '#1f2430',
  scale: '#2f6fed',
  scaleFill: 'rgba(47, 111, 237, 0.08)',
  majorTri: '#e08a00',
  majorFill: 'rgba(224, 138, 0, 0.20)',
  minorTri: '#0ea5b7',
  minorFill: 'rgba(14, 165, 183, 0.16)',
  rootGlow: 'rgba(255, 193, 7, 0.55)',
  rootSegment: 'rgba(255, 193, 7, 0.25)',
  rootEdge: '#e0a000'
};

const STEP = Math.PI * 2 / 12;          // 30度
const DIATONIC = [0, 2, 4, 5, 7, 9, 11]; // メジャースケールの7音
// Canvasの角度0は右（3時）なので、-90°ずらして「角度0＝一番上（12時）」として扱う。
// → 初期状態でCが一番上に来る。
const TOP_OFFSET = -Math.PI / 2;
// スケールの主音セグメント・三角形のルート頂点は、どちらも角度0（＋回転）に置く。
// → 常に黄色いルート音ハイライトと同じ音の上に揃う（ずれない）。

export function getMagicCircleRootRadius(radius, { showDiatonicScale = false, showChordTriangle = false } = {}) {
  if (showChordTriangle) return Math.max(20, radius * 0.6 - 10);
  // スケール表示時も音名と同じ0.8倍に置く（以前は外周上でリングからはみ出して見えた）
  return radius * 0.8;
}

export class MagicCircle {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} cb
   *   onRootSelect(pc) クリック選択・回転確定時（試聴などに使う）
   *   onRootChange(pc) 回転中にルートが動くたび（ラベル更新などに使う）
   */
  constructor(canvas, { onRootSelect, onRootChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.centerX = canvas.width / 2;
    this.centerY = canvas.height / 2;
    this.radius = Math.min(this.centerX, this.centerY) - 50;

    this.currentRoot = 0; // C
    this.chordLabel = 'C';
    this.showCircleOfFifths = true;
    this.showDiatonicScale = false;
    this.showChordTriangle = false;
    this.rotation = 0;
    this.onRootSelect = onRootSelect;
    this.onRootChange = onRootChange;

    this.#setupEventListeners();
    this.draw();
  }

  // 回転を含めた座標変換（図形はctx.rotateで回すが、文字はこの座標で水平に描く）
  #rotatedPoint(angle, radius) {
    const a = angle + this.rotation + TOP_OFFSET;
    return {
      x: this.centerX + Math.cos(a) * radius,
      y: this.centerY + Math.sin(a) * radius
    };
  }

  // ルート音を pc に移し、図形の回転も一緒に追従させる（最短経路で回す）
  #alignTo(pc) {
    const target = ((pc % 12) + 12) % 12;
    const delta = ((target - this.currentRoot) % 12 + 18) % 12 - 6; // -6〜+5 の最短差分
    this.rotation += delta * STEP;
    this.currentRoot = target;
  }

  #localToScreen(x, y) {
    const a = this.rotation + TOP_OFFSET;
    const cos = Math.cos(a), sin = Math.sin(a);
    return {
      x: this.centerX + x * cos - y * sin,
      y: this.centerY + x * sin + y * cos
    };
  }

  // 白いフチ付きで文字を描く（図形の線と重なっても読めるように）
  #labelText(text, x, y, color, font = 'bold 14px Arial') {
    const ctx = this.ctx;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // --- 操作: ドラッグ回転（30°スナップ・ルートも一緒に移動）＋外周クリックでルート選択 ---
  #setupEventListeners() {
    let isDragging = false;
    let lastAngle = 0;
    let accumulated = 0;
    let dragged = false;

    const localPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      const { x, y } = localPos(e);
      const dist = Math.hypot(x - this.centerX, y - this.centerY);
      if (dist < this.radius) {
        isDragging = true;
        dragged = false;
        lastAngle = Math.atan2(y - this.centerY, x - this.centerX);
        accumulated = 0;
        this.canvas.setPointerCapture(e.pointerId);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const { x, y } = localPos(e);
      const current = Math.atan2(y - this.centerY, x - this.centerX);
      let delta = current - lastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      accumulated += delta;
      lastAngle = current;

      const steps = Math.round(accumulated / STEP);
      if (Math.abs(steps) >= 1) {
        this.rotation += steps * STEP;
        accumulated -= steps * STEP;
        // ルート音も回転と一緒に移動する（30°=半音1つ）
        this.currentRoot = ((this.currentRoot + steps) % 12 + 12) % 12;
        dragged = true;
        this.draw();
        this.onRootChange?.(this.currentRoot);
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      const wasDragging = isDragging;
      isDragging = false;
      if (!wasDragging) return;

      if (dragged) {
        // 回転操作の確定 → 移動先のルートを通知（試聴）
        this.onRootSelect?.(this.currentRoot);
        return;
      }

      // 外周リング（0.6R〜R）のクリック → ルート音を選択
      const { x, y } = localPos(e);
      const dist = Math.hypot(x - this.centerX, y - this.centerY);
      if (dist > this.radius * 0.6 && dist < this.radius) {
        const angle = Math.atan2(y - this.centerY, x - this.centerX);
        const noteIndex = ((Math.round((angle - TOP_OFFSET) / STEP) % 12) + 12) % 12;
        this.#alignTo(noteIndex); // 図形も一緒に回転してずれない
        this.draw();
        this.onRootSelect?.(noteIndex);
      }
    });

    this.canvas.addEventListener('pointercancel', () => { isDragging = false; });
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.showCircleOfFifths) {
      this.#drawChromaticCircle();
      this.#highlightRoot();
    }

    // 図形だけを回転させて描く（角度0＝一番上）
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.rotate(this.rotation + TOP_OFFSET);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (this.showDiatonicScale) this.#drawDiatonicScaleShapes();
    if (this.showChordTriangle) this.#drawChordTriangleShapes();
    ctx.restore();

    // 文字は回転させず、位置だけ回転に追従させて水平に描く
    if (this.showDiatonicScale) this.#drawDiatonicScaleLabels();
    if (this.showChordTriangle) this.#drawChordTriangleLabels();

    this.#drawChordName();
  }

  #drawChromaticCircle() {
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // 12分割の区切り線（文字の間に線が来るように +0.5）
    for (let i = 0; i < 12; i++) {
      const angle = (i + 0.5) * STEP + TOP_OFFSET;
      ctx.beginPath();
      ctx.moveTo(
        this.centerX + Math.cos(angle) * this.radius * 0.6,
        this.centerY + Math.sin(angle) * this.radius * 0.6);
      ctx.lineTo(
        this.centerX + Math.cos(angle) * this.radius,
        this.centerY + Math.sin(angle) * this.radius);
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 音名（半音順・Cが一番上）
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.line;
    for (let i = 0; i < 12; i++) {
      const angle = i * STEP + TOP_OFFSET;
      ctx.fillText(
        NOTE_LETTERS[i],
        this.centerX + Math.cos(angle) * this.radius * 0.8,
        this.centerY + Math.sin(angle) * this.radius * 0.8);
    }
  }

  // --- ダイアトニックスケール: 図形（回転コンテキスト内で呼ぶ） ---
  #drawDiatonicScaleShapes() {
    const ctx = this.ctx;
    const innerRadius = this.radius * 0.6;
    const outerRadius = this.radius;

    ctx.beginPath();
    ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.scale;
    ctx.lineWidth = 4;
    ctx.stroke();

    // 7音ぶんのセグメント（薄い塗り＋太線でスケール圏を強調）
    // 主音（notePosition=0）が角度0 ＝ ルート音の位置に来る。
    // 注: メジャースケールの図形は2度を対称軸にした形なので、見た目の「中心」は
    // ルートではなく2度に来る（例: Cメジャーの図形の中心はD）。これは理論通りで正しい。
    for (const notePosition of DIATONIC) {
      const centerAngle = notePosition * STEP;
      const startAngle = centerAngle - STEP / 2;
      const endAngle = centerAngle + STEP / 2;

      ctx.beginPath();
      ctx.moveTo(Math.cos(startAngle) * innerRadius, Math.sin(startAngle) * innerRadius);
      ctx.lineTo(Math.cos(startAngle) * outerRadius, Math.sin(startAngle) * outerRadius);
      ctx.arc(0, 0, outerRadius, startAngle, endAngle);
      ctx.lineTo(Math.cos(endAngle) * innerRadius, Math.sin(endAngle) * innerRadius);
      ctx.arc(0, 0, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = COLORS.scaleFill;
      ctx.fill();
      ctx.strokeStyle = COLORS.scale;
      // ルート（主音）のセグメントだけ太枠にして、どこが1度か一目で分かるようにする
      ctx.lineWidth = notePosition === 0 ? 6.5 : 4;
      ctx.stroke();
    }
  }

  // --- ダイアトニックスケール: ラベル（常に水平・キャンバス内に収める） ---
  #drawDiatonicScaleLabels() {
    // メジャー: 主音（位置0）/ マイナー: 平行短調の主音（位置9 = 長6度）
    const major = this.#rotatedPoint(0 * STEP, this.radius * 1.12);
    this.#labelText('メジャー', major.x, major.y, COLORS.scale);
    const minor = this.#rotatedPoint(9 * STEP, this.radius * 1.12);
    this.#labelText('マイナー', minor.x, minor.y, COLORS.scale);

    // 各セグメントに度数を表示（ルート・2〜7）。
    // 「図形のどこがルートか」が見た目で分かるようにするための表示。
    const DEGREE_LABELS = { 0: 'ルート', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' };
    for (const pos of DIATONIC) {
      const p = this.#rotatedPoint(pos * STEP, this.radius * 0.665);
      this.#labelText(
        DEGREE_LABELS[pos], p.x, p.y, COLORS.scale,
        pos === 0 ? 'bold 12px Arial' : 'bold 13px Arial'
      );
    }

    // 中央のテキスト（回転させない）
    this.#labelText('スケール', this.centerX, this.centerY - 12, COLORS.scale, 'bold 20px Arial');
    this.#labelText('(7音)', this.centerX, this.centerY + 12, COLORS.scale, 'bold 20px Arial');
  }

  // --- コード三角形: 図形（回転コンテキスト内で呼ぶ） ---
  // 内円のすぐ内側まで広げ、太線＋塗り＋頂点マーカーで構成音の位置を強調する
  #drawChordTriangleShapes() {
    const ctx = this.ctx;
    const R = this.radius * 0.6 - 10;

    const drawTriad = (intervals, stroke, fill) => {
      const pts = intervals.map(pc => ({
        x: Math.cos(pc * STEP) * R,
        y: Math.sin(pc * STEP) * R
      }));

      ctx.save();
      ctx.shadowColor = 'rgba(31, 36, 48, 0.25)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();

      // 頂点マーカー（ルートは大きめの二重丸）
      pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 9 : 6.5, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (i === 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      });
    };

    drawTriad([0, 4, 7], COLORS.majorTri, COLORS.majorFill); // ルート・長3度・5度
    drawTriad([0, 3, 7], COLORS.minorTri, COLORS.minorFill); // ルート・短3度・5度
  }

  // --- コード三角形: ラベル（常に水平） ---
  // メジャー/マイナーの違いは「3度の頂点」なので、ルート→3度の辺の中点に置く
  #drawChordTriangleLabels() {
    const R = this.radius * 0.6 - 10;
    const mid = (pcA, pcB) => this.#localToScreen(
      (Math.cos(pcA * STEP) + Math.cos(pcB * STEP)) / 2 * R,
      (Math.sin(pcA * STEP) + Math.sin(pcB * STEP)) / 2 * R
    );
    const mj = mid(0, 4);
    this.#labelText('メジャー', mj.x, mj.y, COLORS.majorTri, 'bold 13px Arial');
    const mn = mid(0, 3);
    this.#labelText('マイナー', mn.x, mn.y, COLORS.minorTri, 'bold 13px Arial');
  }

  // ルート音のハイライト（視認性を強化: 濃い黄色＋アンバーの縁取り）
  #highlightRoot() {
    const ctx = this.ctx;
    const angle = this.currentRoot * STEP + TOP_OFFSET;
    const startAngle = angle - STEP / 2;
    const endAngle = angle + STEP / 2;
    const innerRadius = this.radius * 0.6;

    // 外側リング帯だけのハイライト。
    // 以前は中心からの扇形だったため、リング状の青いスケールセグメントと形が合わず
    // 「ずれている」ように見えていた → スケールと同じドーナツ形セグメントに統一。
    ctx.beginPath();
    ctx.moveTo(
      this.centerX + Math.cos(startAngle) * innerRadius,
      this.centerY + Math.sin(startAngle) * innerRadius);
    ctx.lineTo(
      this.centerX + Math.cos(startAngle) * this.radius,
      this.centerY + Math.sin(startAngle) * this.radius);
    ctx.arc(this.centerX, this.centerY, this.radius, startAngle, endAngle);
    ctx.lineTo(
      this.centerX + Math.cos(endAngle) * innerRadius,
      this.centerY + Math.sin(endAngle) * innerRadius);
    ctx.arc(this.centerX, this.centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = COLORS.rootSegment;
    ctx.fill();
    ctx.strokeStyle = COLORS.rootEdge;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 図形のルート点に合わせた黄色ハイライト。
    const anchorRadius = getMagicCircleRootRadius(this.radius, {
      showDiatonicScale: this.showDiatonicScale,
      showChordTriangle: this.showChordTriangle
    });
    const { x, y } = this.#localToScreen(anchorRadius, 0);

    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.rootGlow;
    ctx.fill();
    ctx.strokeStyle = COLORS.rootEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  #drawChordName() {
    // Cが一番上に来たため、上部中央だと「メジャー」ラベルと重なる → 左上の固定位置に表示
    this.#labelText(this.chordLabel, 46, 32, COLORS.line, 'bold 24px Arial');
  }

  // --- 外部から操作するAPI ---
  toggleCircleOfFifths(show) { this.showCircleOfFifths = show; this.draw(); }
  toggleDiatonicScale(show) { this.showDiatonicScale = show; this.draw(); }
  toggleChordTriangle(show) { this.showChordTriangle = show; this.draw(); }

  setRoot(pc) { this.#alignTo(pc); this.draw(); }
  getRoot() { return this.currentRoot; }
  setChordLabel(label) { this.chordLabel = label; this.draw(); }
}
