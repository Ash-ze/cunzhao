// 亮度 / 对比度：生成 256 级查找表，逐像素替换 RGB（不依赖 canvas filter，Safari 也能用）
export function toneLut(bright, contrast) {
  const lut = new Uint8ClampedArray(256);
  const k = (100 + contrast) / 100;
  for (let v = 0; v < 256; v++) lut[v] = Math.round((v - 128) * k + 128 + bright * 1.5);
  return lut;
}

export function applyTone(data, lut) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  return data;
}
