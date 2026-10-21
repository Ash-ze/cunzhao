// 把证件照排到相纸上。单一规格自动选横排或竖排里能放下更多张的那种；
// 混排（如一寸 + 二寸）先放一块大照片，剩下的 L 形区域填小照片，挑铺得最满的方案。
// 所有尺寸都是 300dpi 像素。
export const GAP = 24; // 约 2mm，留给剪刀
export const MARGIN = 36;

const fit = (len, size) => Math.max(0, Math.floor((len + GAP) / (size + GAP)));

// 在 (x, y) 起的区域里按网格摆放，k 表示用第几种照片
function gridItems(x, y, cols, rows, [w, h], k) {
  const items = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) items.push({ x: x + i * (w + GAP), y: y + j * (h + GAP), w, h, k });
  return items;
}

// 整体居中到纸上
function center(items, W, H) {
  if (!items.length) return items;
  const minX = Math.min(...items.map((t) => t.x));
  const minY = Math.min(...items.map((t) => t.y));
  const maxX = Math.max(...items.map((t) => t.x + t.w));
  const maxY = Math.max(...items.map((t) => t.y + t.h));
  const dx = Math.round((W - (maxX - minX)) / 2) - minX;
  const dy = Math.round((H - (maxY - minY)) / 2) - minY;
  return items.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
}

export function planLayout(paper, photo) {
  const [pw, ph] = paper;
  const [w, h] = photo;
  const land = { cols: fit(pw - 2 * MARGIN, w), rows: fit(ph - 2 * MARGIN, h) };
  const port = { cols: fit(ph - 2 * MARGIN, w), rows: fit(pw - 2 * MARGIN, h) };
  const useLand = land.cols * land.rows >= port.cols * port.rows;
  const W = useLand ? pw : ph;
  const H = useLand ? ph : pw;
  const { cols, rows } = useLand ? land : port;
  const items = center(gridItems(0, 0, cols, rows, photo, 0), W, H);
  return { W, H, cols, rows, count: cols * rows, items };
}

// small、big：两种照片的像素尺寸。返回 { W, H, items, counts: [小, 大] }
export function planMixed(paper, small, big) {
  let best = null;
  for (const [W, H] of [paper, [paper[1], paper[0]]]) {
    const uw = W - 2 * MARGIN;
    const uh = H - 2 * MARGIN;
    for (let c = 1; c <= fit(uw, big[0]); c++) {
      for (let r = 1; r <= fit(uh, big[1]); r++) {
        const bw = c * big[0] + (c - 1) * GAP;
        const bh = r * big[1] + (r - 1) * GAP;
        // 剩下的 L 形区域有两种切法：右边整列 + 大图下方，或下边整行 + 大图右侧
        const cuts = [
          [[bw + GAP, 0, uw - bw - GAP, uh], [0, bh + GAP, bw, uh - bh - GAP]],
          [[0, bh + GAP, uw, uh - bh - GAP], [bw + GAP, 0, uw - bw - GAP, bh]],
        ];
        for (const regions of cuts) {
          const items = gridItems(0, 0, c, r, big, 1);
          for (const [x, y, w, h] of regions) items.push(...gridItems(x, y, fit(w, small[0]), fit(h, small[1]), small, 0));
          const ns = items.length - c * r;
          if (ns < 1) continue;
          // 铺得越满越好，并偏向两种张数接近的方案（6 寸纸上得到 4 张二寸 + 5 张一寸）
          const nb = c * r;
          const area = nb * big[0] * big[1] + ns * small[0] * small[1];
          const score = area * (1 + (0.1 * Math.min(ns, nb)) / Math.max(ns, nb));
          if (!best || score > best.score) best = { W, H, items, counts: [ns, c * r], score };
        }
      }
    }
  }
  if (!best) return { W: paper[0], H: paper[1], items: [], counts: [0, 0] };
  return { W: best.W, H: best.H, items: center(best.items, best.W, best.H), counts: best.counts };
}

// photos[k] 画到 items 里 k 对应的位置，按格子尺寸缩放；scale < 1 用于页面预览
export function drawPlan(plan, photos, scale = 1) {
  const c = document.createElement('canvas');
  c.width = Math.round(plan.W * scale);
  c.height = Math.round(plan.H * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, plan.W, plan.H);
  ctx.imageSmoothingQuality = 'high';
  // 裁切参考线
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = Math.max(1, 1 / scale); // 预览缩小后也保持约 1 个屏幕像素
  ctx.setLineDash([8, 6]);
  for (const t of plan.items) {
    ctx.drawImage(photos[t.k], t.x, t.y, t.w, t.h);
    ctx.strokeRect(t.x - 0.5, t.y - 0.5, t.w + 1, t.h + 1);
  }
  return c;
}
