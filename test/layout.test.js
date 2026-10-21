import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, planMixed, GAP, MARGIN } from '../src/layout.js';
import { PAPERS, SPECS, printPx } from '../src/specs.js';

const paper = (id) => PAPERS.find((p) => p.id === id).px;
const spec = (id) => printPx(SPECS.find((s) => s.id === id));

// 所有照片都在边距以内、互不重叠且至少隔一个 GAP
function assertValid(plan) {
  for (const t of plan.items) {
    assert.ok(t.x >= MARGIN - 1 && t.y >= MARGIN - 1, '超出左上边距');
    assert.ok(t.x + t.w <= plan.W - MARGIN + 1 && t.y + t.h <= plan.H - MARGIN + 1, '超出右下边距');
  }
  for (let i = 0; i < plan.items.length; i++)
    for (let j = i + 1; j < plan.items.length; j++) {
      const a = plan.items[i], b = plan.items[j];
      const apart = a.x + a.w + GAP <= b.x || b.x + b.w + GAP <= a.x || a.y + a.h + GAP <= b.y || b.y + b.h + GAP <= a.y;
      assert.ok(apart, `第 ${i} 和第 ${j} 张重叠或太近`);
    }
}

test('6 寸相纸排 12 张一寸（竖排）', () => {
  const p = planLayout(paper('6in'), spec('1cun'));
  assert.equal(p.count, 12);
  assert.equal(p.items.length, 12);
  assert.deepEqual([p.W, p.H, p.cols, p.rows], [1200, 1800, 3, 4]);
  assertValid(p);
});

test('常见规格的张数', () => {
  assert.equal(planLayout(paper('6in'), spec('2cun')).count, 4);
  assert.equal(planLayout(paper('5in'), spec('1cun')).count, 9);
  assert.equal(planLayout(paper('a4'), spec('1cun')).count, 50);
  assert.equal(planLayout(paper('6in'), spec('us')).count, 2); // 51mm 两张并排超过 4 英寸宽
  assert.equal(planLayout(paper('6in'), spec('idcard')).count, 12);
});

test('排版居中', () => {
  const p = planLayout(paper('6in'), spec('1cun'));
  const left = Math.min(...p.items.map((t) => t.x));
  const right = p.W - Math.max(...p.items.map((t) => t.x + t.w));
  const top = Math.min(...p.items.map((t) => t.y));
  const bottom = p.H - Math.max(...p.items.map((t) => t.y + t.h));
  assert.ok(Math.abs(left - right) <= 1 && Math.abs(top - bottom) <= 1);
});

test('放不下时返回 0 张', () => {
  const p = planLayout([600, 400], [500, 700]);
  assert.equal(p.count, 0);
  assert.equal(p.items.length, 0);
});

test('6 寸混排：4 张二寸 + 5 张一寸', () => {
  const p = planMixed(paper('mix6'), spec('1cun'), spec('2cun'));
  assert.deepEqual(p.counts, [5, 4]);
  assert.deepEqual([p.W, p.H], [1800, 1200]);
  assert.equal(p.items.filter((t) => t.k === 1).length, 4);
  assert.ok(p.items.filter((t) => t.k === 1).every((t) => t.w === 413 && t.h === 579));
  assert.ok(p.items.filter((t) => t.k === 0).every((t) => t.w === 295 && t.h === 413));
  assertValid(p);
});

test('其他纸张混排也合法', () => {
  for (const id of ['5in', 'a4']) {
    const p = planMixed(paper(id), spec('1cun'), spec('2cun'));
    assert.ok(p.counts[0] >= 1 && p.counts[1] >= 1, id);
    assertValid(p);
  }
  assert.deepEqual(planMixed([300, 300], spec('1cun'), spec('2cun')).counts, [0, 0]);
});
