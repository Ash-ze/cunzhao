import { SPECS, CATEGORIES, BACKGROUNDS, PAPERS, DEFAULT_HEAD, DEFAULT_TOP, mmToPx, printPx, specFacts, searchSpecs, fitCrop, bgOf } from './specs.js';
import { detectFaces, cutout, preload } from './vision.js';
import { planLayout, planMixed, drawPlan } from './layout.js';
import { toneLut, applyTone } from './tone.js';

const $ = (id) => document.getElementById(id);

const state = {
  source: null, // 原图 canvas
  person: null, // 抠好的人像 canvas（背景透明）
  faces: [],
  noFace: false,
  spec: SPECS[0],
  bg: BACKGROUNDS[0].color, // null = 保留原背景
  bgTouched: false, // 用户自己选过底色后，换规格不再自动切换推荐底色
  kbTouched: false,
  crop: null, // { cx, cy, h }（源图坐标）
  zoom: 1,
  bright: 0,
  contrast: 0,
  tab: SPECS[0].cat,
  history: [], // 位置 / 大小的撤销栈
};

// ---------- 规格 ----------
CATEGORIES.forEach((c) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tab';
  b.setAttribute('role', 'tab');
  b.dataset.cat = c.id;
  b.textContent = c.name;
  b.addEventListener('click', () => {
    state.tab = c.id;
    $('specSearch').value = '';
    renderSpecs();
  });
  $('specTabs').append(b);
});
$('specSearch').addEventListener('input', renderSpecs);

function renderSpecs() {
  const q = $('specSearch').value.trim();
  const list = q ? searchSpecs(q) : SPECS.filter((s) => s.cat === state.tab);
  $('specTabs').querySelectorAll('.tab').forEach((t) => {
    const on = !q && t.dataset.cat === state.tab;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', on);
  });
  const box = $('specs');
  box.replaceChildren(
    ...list.map((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (s.id === state.spec.id ? ' on' : '');
      b.title = s.note;
      b.innerHTML = `${s.name}<small>${s.mm[0]}×${s.mm[1]}mm</small>`;
      b.addEventListener('click', () => setSpec(s));
      return b;
    }),
  );
  $('specEmpty').hidden = list.length > 0;
}

function renderSpecNote() {
  const s = state.spec;
  const facts = specFacts(s).map((f) => `<span>${f}</span>`).join('');
  $('specNote').innerHTML = `<p><b>${escapeHtml(s.name)}</b>${facts}</p><small>${escapeHtml(s.note || '')}${s.note ? '。' : ''}要求以官方最新说明为准</small>`;
}

// ---------- 底色 ----------
function chip(container, label, sub, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.innerHTML = sub ? `${label}<small>${sub}</small>` : label;
  b.addEventListener('click', () => {
    container.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
    b.classList.add('on');
    onClick();
  });
  container.append(b);
  return b;
}

const bgChips = {};
BACKGROUNDS.forEach((bg, i) => {
  const b = chip($('bgs'), `<i style="background:${bg.color}"></i>${bg.name}`, '', () => pickBg(bg.color));
  b.dataset.bg = bg.id;
  bgChips[bg.id] = b;
  if (i === 0) b.classList.add('on');
});
{
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = '#5b9bd5';
  const b = chip($('bgs'), '自选', '', () => picker.click());
  b.prepend(picker);
  picker.addEventListener('input', () => pickBg(picker.value));
  chip($('bgs'), '原背景', '', () => pickBg(null));
}

function pickBg(color) {
  state.bgTouched = true;
  setBg(color);
}

function markBg(id) {
  $('bgs').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.bg === id));
}

function markRecommendedBg() {
  for (const [id, b] of Object.entries(bgChips)) b.classList.toggle('rec', state.spec.bg === id);
}

// ---------- 相纸 ----------
PAPERS.forEach((p) => {
  const o = document.createElement('option');
  o.value = p.id;
  o.textContent = p.name;
  $('paper').append(o);
});
const currentPaper = () => PAPERS.find((p) => p.id === $('paper').value);
const specById = (id) => SPECS.find((s) => s.id === id);

$('applyCustom').addEventListener('click', () => {
  const w = +$('cw').value;
  const h = +$('ch').value;
  if (!(w >= 10 && h >= 10)) return;
  setSpec({ id: 'custom', name: '自定义', note: '按 300dpi 换算像素', mm: [w, h], px: [mmToPx(w), mmToPx(h)] });
});

// ---------- 载入照片 ----------
async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  busy('读取照片…');
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    state.source = c;
    state.person = null;
    state.history = [];
    updateUndo();
    $('dropText').innerHTML = `已选：${escapeHtml(file.name || '照片')}<br /><small>点这里换一张</small>`;

    busy('识别人脸…');
    state.faces = await detectFaces(c);
    if (state.bg) await ensurePerson();
    autoFit();
    $('dlSingle').disabled = false;
    $('dlLayout').disabled = false;
    render();
  } catch (e) {
    console.error(e);
    alert('处理失败：' + (e.message || e));
  } finally {
    busy(false);
  }
}

async function ensurePerson() {
  if (state.person || !state.source) return;
  busy('抠图中…');
  const mb = (x) => (x / 1048576).toFixed(1);
  try {
    state.person = await cutout(state.source, (got, total) => {
      if (total && got >= total) busy('抠图中…');
      else if (total) busy(`首次使用，正在下载抠图模型 ${Math.floor((got / total) * 100)}%（${mb(got)} / ${mb(total)} MB），之后离线也能用`);
      else busy(`首次使用，正在下载抠图模型 ${mb(got)} MB…`);
    });
  } finally {
    busy(false);
  }
}

// 根据人脸框估算头顶和下巴；合影规格把所有主要人脸都框进来
function headBox() {
  const faces = state.faces;
  if (!faces.length) return null;
  const main = faces[0];
  const use = state.spec.group ? faces.filter((f) => f.w * f.h >= main.w * main.h * 0.3) : [main];
  let top = Infinity, chin = -Infinity, left = Infinity, right = -Infinity;
  for (const f of use) {
    // BlazeFace 的框大致从额头到下巴；有抠图结果时用人像蒙版找真实头顶（含头发）
    const crown = (state.person && findCrown(state.person, f)) ?? f.y - f.h * 0.4;
    top = Math.min(top, crown);
    chin = Math.max(chin, f.y + f.h * 0.98);
    left = Math.min(left, f.x - f.w * 0.6);
    right = Math.max(right, f.x + f.w * 1.6);
  }
  return { top, chin, cx: (left + right) / 2, width: use.length > 1 ? right - left : 0, count: use.length };
}

function autoFit() {
  const src = state.source;
  if (!src) return;
  let head = headBox();
  state.noFace = !head;
  state.faceCount = head?.count ?? 0;
  head ??= { top: src.height * 0.12, chin: src.height * 0.57, cx: src.width / 2 };
  state.crop = fitCrop(head, state.spec);
  state.zoom = 1;
  $('zoom').value = 1;
}

// 在人脸框正上方的那几列里，从上往下找第一行不透明像素，就是头顶
function findCrown(person, f) {
  const x0 = Math.max(0, Math.round(f.x + f.w * 0.25));
  const w = Math.max(1, Math.round(f.w * 0.5));
  const y1 = Math.max(1, Math.round(f.y + f.h * 0.3));
  const { data } = person.getContext('2d').getImageData(x0, 0, w, y1);
  for (let y = 0; y < y1; y++) {
    let solid = 0;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 128) solid++;
    if (solid > w * 0.2) {
      // 头顶离人脸框太远（比如举着手）就不信它
      return f.y - y > f.h * 0.9 ? null : y;
    }
  }
  return null;
}

// ---------- 撤销 ----------
let lastKind = '';
let lastAt = 0;
// 同一种连续操作（拖滑块、连按方向键）0.8 秒内只记一次
function remember(kind = '') {
  if (!state.crop) return;
  const now = Date.now();
  if (kind && kind === lastKind && now - lastAt < 800) {
    lastAt = now;
    return;
  }
  lastKind = kind;
  lastAt = now;
  state.history.push({ crop: { ...state.crop }, zoom: state.zoom });
  if (state.history.length > 50) state.history.shift();
  updateUndo();
}

function undo() {
  const h = state.history.pop();
  if (!h) return;
  state.crop = h.crop;
  state.zoom = h.zoom;
  $('zoom').value = h.zoom;
  lastKind = '';
  updateUndo();
  render();
}

function updateUndo() {
  $('undo').disabled = !state.history.length;
}

// ---------- 渲染 ----------
function renderPhoto(canvas, spec = state.spec) {
  const [W, H] = spec.px;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = state.bg || '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (!state.source || !state.crop) return canvas;
  const img = state.bg && state.person ? state.person : state.source;
  const h = state.crop.h / state.zoom;
  const w = (h * W) / H;
  const toned = state.bright || state.contrast;
  // 亮度对比只作用在人像上，底色保持标准色
  const layer = toned ? Object.assign(document.createElement('canvas'), { width: W, height: H }) : canvas;
  const lctx = toned ? layer.getContext('2d', { willReadFrequently: true }) : ctx;
  lctx.imageSmoothingQuality = 'high';
  lctx.drawImage(img, state.crop.cx - w / 2, state.crop.cy - h / 2, w, h, 0, 0, W, H);
  if (toned) {
    const d = lctx.getImageData(0, 0, W, H);
    applyTone(d.data, toneLut(state.bright, state.contrast));
    lctx.putImageData(d, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }
  return canvas;
}

// 当前相纸的排版方案和要用到的规格
function planFor(paper) {
  if (paper.mix) {
    const specs = paper.mix.map(specById);
    return { plan: planMixed(paper.px, ...specs.map(printPx)), specs };
  }
  return { plan: planLayout(paper.px, printPx(state.spec)), specs: [state.spec] };
}

function layoutCanvas(paper, scale = 1) {
  const { plan, specs } = planFor(paper);
  const photos = specs.map((s) => renderPhoto(document.createElement('canvas'), s));
  return { canvas: drawPlan(plan, photos, scale), plan, specs };
}

function render() {
  renderPhoto($('photo'));
  const s = state.spec;
  const g = $('guides');
  g.hidden = !state.source;
  // 参考线：规格要求的头顶和下巴位置
  const head = s.head ?? DEFAULT_HEAD;
  const top = s.top ?? DEFAULT_TOP;
  g.style.setProperty('--top', `${top * 100}%`);
  g.style.setProperty('--chin', `${(top + head) * 100}%`);

  let meta = `${s.name} · ${s.mm[0]}×${s.mm[1]}mm · ${s.px[0]}×${s.px[1]} 像素`;
  if (state.source && state.noFace) meta += ' · 没认出人脸，请手动调整';
  else if (state.source && s.group && state.faceCount < 2) meta += ' · 只认出 1 张人脸，请手动调整';
  $('meta').textContent = state.source ? meta : '还没有照片';

  const paper = currentPaper();
  const { plan, specs } = planFor(paper);
  const count = plan.items.length;
  let hint;
  if (!count) hint = '这个尺寸放不进这张纸，换大一点的纸试试';
  else if (paper.mix) {
    hint = `一张 6 寸相纸排 ${plan.counts[1]} 张${specs[1].name} + ${plan.counts[0]} 张${specs[0].name}，按当前照片位置生成`;
    if (!paper.mix.includes(s.id)) hint += `（混排固定为${specs[0].name}和${specs[1].name}）`;
  } else hint = `${paper.name}可以排 ${count} 张${s.name}`;
  $('layoutHint').textContent = hint;
  $('bgHint').textContent = state.bg ? '' : '保留原照片背景，不抠图';
  if (state.source) {
    const lp = $('layoutPreview');
    const { canvas } = layoutCanvas(paper, Math.min(1, 1000 / Math.max(plan.W, plan.H)));
    lp.width = canvas.width;
    lp.height = canvas.height;
    lp.getContext('2d').drawImage(canvas, 0, 0);
    lp.hidden = false;
  }
}

async function setSpec(spec) {
  remember();
  state.spec = spec;
  renderSpecs();
  renderSpecNote();
  markRecommendedBg();
  if (!state.kbTouched) $('maxKb').value = spec.kb || '';
  // 用户没手动选过底色时，自动换成该规格推荐的底色
  if (!state.bgTouched && spec.bg && bgOf(spec.bg).color !== state.bg) {
    markBg(spec.bg);
    await setBg(bgOf(spec.bg).color, false);
  }
  autoFit();
  render();
}

async function setBg(color, refit = true) {
  state.bg = color;
  if (color && !state.person && state.source) {
    await ensurePerson();
    // 有了人像蒙版才能找到真实头顶，重新对齐一次
    if (refit) {
      remember();
      autoFit();
    }
  }
  render();
}

// ---------- 交互 ----------
$('file').addEventListener('change', (e) => {
  loadFile(e.target.files[0]);
  e.target.value = '';
});
$('camera').addEventListener('change', (e) => {
  loadFile(e.target.files[0]);
  e.target.value = '';
});
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) =>
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  }),
);
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  loadFile(e.dataTransfer.files[0]);
});
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

$('zoom').addEventListener('input', (e) => {
  remember('zoom');
  state.zoom = +e.target.value;
  render();
});
$('bright').addEventListener('input', (e) => {
  state.bright = +e.target.value;
  render();
});
$('contrast').addEventListener('input', (e) => {
  state.contrast = +e.target.value;
  render();
});
$('resetTone').addEventListener('click', () => {
  state.bright = state.contrast = 0;
  $('bright').value = $('contrast').value = 0;
  render();
});
$('autoFit').addEventListener('click', () => {
  remember();
  autoFit();
  render();
});
$('undo').addEventListener('click', undo);
$('paper').addEventListener('change', render);
$('maxKb').addEventListener('input', () => (state.kbTouched = true));

// 微调位置：dx、dy 是人像在画面里移动的方向，step 按输出像素计
function nudge(dx, dy, big) {
  if (!state.crop) return;
  remember('nudge');
  const k = state.crop.h / state.zoom / state.spec.px[1]; // 输出像素 -> 源图像素
  const step = k * (big ? 12 : 2);
  state.crop.cx -= dx * step;
  state.crop.cy -= dy * step;
  render();
}
document.querySelectorAll('[data-nudge]').forEach((b) =>
  b.addEventListener('click', (e) => {
    const [dx, dy] = b.dataset.nudge.split(',').map(Number);
    nudge(dx, dy, e.shiftKey);
  }),
);
const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  const dir = ARROWS[e.key];
  if (!dir || !state.crop || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  nudge(dir[0], dir[1], e.shiftKey);
});

// 拖动预览移动照片
{
  const cv = $('photo');
  let last = null;
  cv.addEventListener('pointerdown', (e) => {
    if (!state.crop) return;
    remember();
    last = [e.clientX, e.clientY];
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!last) return;
    const rect = cv.getBoundingClientRect();
    const k = state.crop.h / state.zoom / rect.height; // 屏幕像素 -> 源图像素
    state.crop.cx -= (e.clientX - last[0]) * k;
    state.crop.cy -= (e.clientY - last[1]) * k;
    last = [e.clientX, e.clientY];
    render();
  });
  const end = () => (last = null);
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener(
    'wheel',
    (e) => {
      if (!state.crop) return;
      e.preventDefault();
      remember('zoom');
      state.zoom = Math.min(1.6, Math.max(0.6, state.zoom * (e.deltaY < 0 ? 1.03 : 0.97)));
      $('zoom').value = state.zoom;
      render();
    },
    { passive: false },
  );
}

// ---------- 下载 ----------
function toBlob(canvas, quality) {
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
}

// 二分 JPEG 质量，尽量贴近目标大小；质量压到底还超就缩小像素
async function compress(canvas, maxKb) {
  if (!maxKb) return toBlob(canvas, 0.95);
  const limit = maxKb * 1024;
  let c = canvas;
  for (let attempt = 0; attempt < 6; attempt++) {
    let lo = 0.3, hi = 0.98, best = null;
    for (let i = 0; i < 8; i++) {
      const q = (lo + hi) / 2;
      const b = await toBlob(c, q);
      if (b.size <= limit) { best = b; lo = q; } else hi = q;
    }
    if (best) return best;
    const s = document.createElement('canvas');
    s.width = Math.round(c.width * 0.85);
    s.height = Math.round(c.height * 0.85);
    s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
    c = s;
  }
  return toBlob(c, 0.3);
}

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('dlSingle').addEventListener('click', async () => {
  const c = renderPhoto(document.createElement('canvas'));
  const maxKb = +$('maxKb').value || 0;
  const blob = await compress(c, maxKb);
  save(blob, `idphoto-${state.spec.id}-${c.width}x${c.height}.jpg`);
  if (maxKb && blob.size > maxKb * 1024) alert('已经压到最小，仍比限制大一点，请放宽大小限制。');
});

$('dlLayout').addEventListener('click', async () => {
  const paper = currentPaper();
  const { canvas, plan } = layoutCanvas(paper);
  const count = plan.items.length;
  if (!count) return;
  const tag = paper.mix ? `mix-${plan.counts[1]}+${plan.counts[0]}` : `${state.spec.id}-${count}`;
  save(await toBlob(canvas, 0.95), `idphoto-print-${paper.id}-${tag}.jpg`);
});

// ---------- 杂项 ----------
function busy(text) {
  $('busy').hidden = !text;
  if (text) $('busyText').textContent = text;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

renderSpecs();
renderSpecNote();
markRecommendedBg();
render();
preload();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}
