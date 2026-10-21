import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECS, CATEGORIES, BACKGROUNDS, PAPERS, DEFAULT_HEAD, DEFAULT_TOP, mmToPx, printPx, specFacts, searchSpecs, fitCrop } from '../src/specs.js';

test('mm 换算 300dpi 像素', () => {
  assert.equal(mmToPx(25), 295);
  assert.equal(mmToPx(35), 413);
  assert.equal(mmToPx(25.4), 300);
  assert.equal(mmToPx(25.4, 600), 600);
  assert.deepEqual(printPx({ mm: [26, 32] }), [307, 378]);
});

test('规格数据完整且自洽', () => {
  const ids = new Set();
  const cats = new Set(CATEGORIES.map((c) => c.id));
  const bgs = new Set(BACKGROUNDS.map((b) => b.id));
  for (const s of SPECS) {
    assert.ok(!ids.has(s.id), `重复 id ${s.id}`);
    ids.add(s.id);
    assert.ok(cats.has(s.cat), `${s.name} 分类不存在`);
    assert.ok(s.note, `${s.name} 缺少说明`);
    if (s.bg) assert.ok(bgs.has(s.bg), `${s.name} 推荐底色不存在`);
    if (s.kb) assert.ok(s.kb >= 10 && s.kb <= 2000);
    // 像素和毫米的宽高比要一致，否则打印会变形
    const r = s.px[0] / s.px[1] / (s.mm[0] / s.mm[1]);
    assert.ok(Math.abs(r - 1) < 0.015, `${s.name} 像素与毫米比例不一致 ${r}`);
    const head = s.head ?? DEFAULT_HEAD;
    const top = s.top ?? DEFAULT_TOP;
    assert.ok(head > 0.2 && top >= 0 && head + top < 0.95, `${s.name} 头部比例不合理`);
  }
  for (const cat of cats) assert.ok(SPECS.some((s) => s.cat === cat), `分类 ${cat} 为空`);
});

test('常用规格的官方像素', () => {
  const px = (id) => SPECS.find((s) => s.id === id).px.join('x');
  assert.equal(px('1cun'), '295x413');
  assert.equal(px('shebao'), '358x441');
  assert.equal(px('teacher'), '295x413');
  assert.equal(px('marriage'), '626x413');
  assert.equal(px('us'), '600x600');
  assert.equal(SPECS.find((s) => s.id === 'teacher').kb, 200);
  assert.ok(SPECS.find((s) => s.id === 'marriage').group);
  for (const p of PAPERS) if (p.mix) for (const id of p.mix) assert.ok(SPECS.some((s) => s.id === id));
});

test('specFacts 列出像素、尺寸、底色和大小', () => {
  const f = specFacts(SPECS.find((s) => s.id === 'teacher'));
  assert.deepEqual(f, ['295×413 像素', '25×35mm', '推荐白底', '文件 ≤ 200KB']);
  assert.deepEqual(specFacts({ px: [10, 20], mm: [1, 2] }), ['10×20 像素', '1×2mm']);
});

test('搜索规格', () => {
  assert.deepEqual(searchSpecs('社保').map((s) => s.id), ['shebao']);
  assert.deepEqual(searchSpecs('教资').map((s) => s.id), ['teacher']);
  assert.ok(searchSpecs('国考').some((s) => s.id === 'exam'));
  assert.ok(searchSpecs('港澳').some((s) => s.id === 'passport'));
  assert.ok(searchSpecs('35x45').length >= 4);
  assert.ok(searchSpecs('DS-160').some((s) => s.id === 'us'));
  assert.equal(searchSpecs('  ').length, SPECS.length);
  assert.equal(searchSpecs('不存在').length, 0);
});

test('fitCrop 把头顶和下巴放到规格比例上', () => {
  for (const spec of SPECS.filter((s) => !s.group)) {
    const head = { top: 200, chin: 500, cx: 400 };
    const c = fitCrop(head, spec);
    const y0 = c.cy - c.h / 2;
    assert.ok(Math.abs((head.top - y0) / c.h - (spec.top ?? DEFAULT_TOP)) < 1e-9, spec.name);
    assert.ok(Math.abs((head.chin - head.top) / c.h - (spec.head ?? DEFAULT_HEAD)) < 1e-9, spec.name);
    assert.equal(c.cx, 400);
  }
});

test('fitCrop 合影时保证总宽度放得下', () => {
  const spec = SPECS.find((s) => s.id === 'marriage');
  const c = fitCrop({ top: 100, chin: 200, cx: 500, width: 900 }, spec);
  const w = (c.h * spec.px[0]) / spec.px[1];
  assert.ok(w >= 900, `宽度 ${w}`);
  // 不限宽时只按头部比例
  const c2 = fitCrop({ top: 100, chin: 200, cx: 500 }, spec);
  assert.ok(Math.abs(c2.h - 100 / spec.head) < 1e-9);
});
