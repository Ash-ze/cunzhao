import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxBlur, upsample, refineMatte } from '../src/matte.js';
import { toneLut, applyTone } from '../src/tone.js';

test('boxBlur 与暴力求均值一致', () => {
  const w = 13, h = 9, r = 3;
  const src = Float32Array.from({ length: w * h }, (_, i) => (i * 7919) % 17);
  const out = boxBlur(src, w, h, r);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++)
        for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) {
          s += src[j * w + i];
          n++;
        }
      assert.ok(Math.abs(out[y * w + x] - s / n) < 1e-4);
    }
});

test('upsample 保持常数和端点', () => {
  const [a] = upsample([new Float32Array(4).fill(0.7)], 2, 2, 8, 6);
  assert.ok(a.every((v) => Math.abs(v - 0.7) < 1e-6));
  const [b] = upsample([Float32Array.from([0, 1])], 2, 1, 8, 1);
  assert.equal(b[0], 0);
  assert.equal(b[7], 1);
});

// 合成图：左边红色人像，右边蓝色背景，中间 2 像素混色边缘；模型蒙版只给出粗糙的过渡
function synth(w, h, edge) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = x < edge ? 1 : x >= edge + 2 ? 0 : 0.5;
      const j = (y * w + x) * 4;
      data[j] = 220 * a;
      data[j + 1] = 40 * a;
      data[j + 2] = 230 * (1 - a);
      data[j + 3] = 255;
    }
  return { width: w, height: h, data };
}

test('refineMatte 贴合边缘并去掉背景色', () => {
  const low = synth(32, 32, 15);
  const mask = new Float32Array(32 * 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) mask[y * 32 + x] = Math.min(1, Math.max(0, (20 - x) / 10)); // 很软的蒙版
  const high = synth(128, 128, 62);
  const out = refineMatte({ low, mask, hair: new Float32Array(32 * 32), high });
  const A = (x, y) => out.data[(y * 128 + x) * 4 + 3];
  assert.ok(A(30, 64) > 250, '人像内部不透明');
  assert.ok(A(100, 64) < 5, '背景透明');
  // 边缘比原蒙版锐利：10 像素外就基本定型
  assert.ok(A(52, 64) > 240 && A(74, 64) < 15, `边缘 ${A(52, 64)} ${A(74, 64)}`);
  // 半透明边缘像素的颜色接近人像红色而不是混了蓝色
  for (let x = 55; x < 70; x++) {
    const j = (64 * 128 + x) * 4;
    if (out.data[j + 3] > 20 && out.data[j + 3] < 235) assert.ok(out.data[j + 2] < 80, `x=${x} 蓝色残留 ${out.data[j + 2]}`);
  }
});

test('亮度对比查找表', () => {
  const id = toneLut(0, 0);
  for (let v = 0; v < 256; v++) assert.equal(id[v], v);
  const lut = toneLut(20, 30);
  for (let v = 1; v < 256; v++) assert.ok(lut[v] >= lut[v - 1], '单调');
  assert.ok(toneLut(20, 0)[128] > 128 && toneLut(-20, 0)[128] < 128);
  assert.ok(toneLut(0, 30)[200] > 200 && toneLut(0, 30)[50] < 50);
  const px = Uint8ClampedArray.from([100, 100, 100, 77]);
  applyTone(px, toneLut(10, 0));
  assert.deepEqual([...px], [115, 115, 115, 77]);
});
