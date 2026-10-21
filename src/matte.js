// 抠图边缘精修，纯 JS，不依赖 DOM：
// 1. 以原图为引导做彩色导向滤波（在蒙版分辨率上求系数，再放大到高分辨率应用 = 联合上采样），边缘贴合发丝和衣服轮廓
// 2. 头发区域保留半透明过渡，其他区域把边缘收紧，避免衣服边发虚
// 3. 前景颜色估计（blur fusion），把边缘像素里混进去的原背景色去掉，换底后不发灰不带色边

// 归一化盒式滤波：窗口 (2r+1)²，边界只算图内像素
export function boxBlur(src, w, h, r, out = new Float32Array(w * h), tmp = new Float32Array(w * h)) {
  // 横向：每行前缀和，中间段窗口完整，单独一个循环省掉边界判断
  const P = new Float64Array(w + 1);
  const kMid = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) P[x + 1] = P[x] + src[o + x];
    const a = Math.min(r, w);
    const b = Math.max(a, w - r);
    for (let x = 0; x < a; x++) {
      const hi = Math.min(w - 1, x + r);
      tmp[o + x] = P[hi + 1] / (hi + 1);
    }
    for (let x = a; x < b; x++) tmp[o + x] = (P[x + r + 1] - P[x - r]) * kMid;
    for (let x = b; x < w; x++) {
      const lo = Math.max(0, x - r);
      tmp[o + x] = (P[w] - P[lo]) / (w - lo);
    }
  }
  // 纵向：按行推进、每列一个累加器，内存连续访问更快
  const col = new Float64Array(w);
  const end = Math.min(r, h - 1);
  for (let y = 0; y <= end; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) col[x] += tmp[o + x];
  }
  for (let y = 0; y < h; y++) {
    const lo = y - r < 0 ? 0 : y - r;
    const hi = y + r > h - 1 ? h - 1 : y + r;
    const k = 1 / (hi - lo + 1);
    const o = y * w;
    for (let x = 0; x < w; x++) out[o + x] = col[x] * k;
    if (y + r + 1 < h) {
      const a = (y + r + 1) * w;
      for (let x = 0; x < w; x++) col[x] += tmp[a + x];
    }
    if (y - r >= 0) {
      const b = (y - r) * w;
      for (let x = 0; x < w; x++) col[x] -= tmp[b + x];
    }
  }
  return out;
}

// 双线性放大若干张同尺寸的图
export function upsample(srcs, lw, lh, W, H) {
  const outs = srcs.map(() => new Float32Array(W * H));
  const x0 = new Int32Array(W);
  const x1 = new Int32Array(W);
  const fx = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = Math.min(lw - 1, Math.max(0, ((x + 0.5) * lw) / W - 0.5));
    x0[x] = Math.floor(u);
    x1[x] = Math.min(lw - 1, x0[x] + 1);
    fx[x] = u - x0[x];
  }
  for (let y = 0; y < H; y++) {
    const v = Math.min(lh - 1, Math.max(0, ((y + 0.5) * lh) / H - 0.5));
    const y0 = Math.floor(v);
    const y1 = Math.min(lh - 1, y0 + 1);
    const fy = v - y0;
    const r0 = y0 * lw;
    const r1 = y1 * lw;
    const o = y * W;
    for (let k = 0; k < srcs.length; k++) {
      const s = srcs[k];
      const d = outs[k];
      for (let x = 0; x < W; x++) {
        const a = x0[x];
        const b = x1[x];
        const f = fx[x];
        const top = s[r0 + a] + (s[r0 + b] - s[r0 + a]) * f;
        const bot = s[r1 + a] + (s[r1 + b] - s[r1 + a]) * f;
        d[o + x] = top + (bot - top) * fy;
      }
    }
  }
  return outs;
}

function channels(img) {
  const n = img.width * img.height;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  const d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    r[i] = d[j] / 255;
    g[i] = d[j + 1] / 255;
    b[i] = d[j + 2] / 255;
  }
  return [r, g, b];
}

// 彩色导向滤波。统计量只算一次，对每个 eps 各返回一组平滑后的线性系数 [ar, ag, ab, b]：q = ar·R + ag·G + ab·B + b
function guidedCoeffs([R, G, B], p, w, h, r, epsList) {
  const n = w * h;
  const tmp = new Float32Array(n);
  const box = (src) => boxBlur(src, w, h, r, new Float32Array(n), tmp);
  const mul = (a, b) => {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = a[i] * b[i];
    return o;
  };
  const mr = box(R), mg = box(G), mb = box(B), mp = box(p);
  const mrp = box(mul(R, p)), mgp = box(mul(G, p)), mbp = box(mul(B, p));
  const mrr = box(mul(R, R)), mrg = box(mul(R, G)), mrb = box(mul(R, B));
  const mgg = box(mul(G, G)), mgb = box(mul(G, B)), mbb = box(mul(B, B));
  return epsList.map((eps) => {
    const ar = new Float32Array(n), ag = new Float32Array(n), ab = new Float32Array(n), bb = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = mrr[i] - mr[i] * mr[i] + eps;
      const b = mrg[i] - mr[i] * mg[i];
      const c = mrb[i] - mr[i] * mb[i];
      const d = mgg[i] - mg[i] * mg[i] + eps;
      const e = mgb[i] - mg[i] * mb[i];
      const f = mbb[i] - mb[i] * mb[i] + eps;
      const cr = mrp[i] - mr[i] * mp[i];
      const cg = mgp[i] - mg[i] * mp[i];
      const cb = mbp[i] - mb[i] * mp[i];
      // 对称 3×3 矩阵求逆（伴随矩阵）
      const i00 = d * f - e * e, i01 = c * e - b * f, i02 = b * e - c * d;
      const i11 = a * f - c * c, i12 = b * c - a * e, i22 = a * d - b * b;
      const det = a * i00 + b * i01 + c * i02;
      const x = (i00 * cr + i01 * cg + i02 * cb) / det;
      const y = (i01 * cr + i11 * cg + i12 * cb) / det;
      const z = (i02 * cr + i12 * cg + i22 * cb) / det;
      ar[i] = x;
      ag[i] = y;
      ab[i] = z;
      bb[i] = mp[i] - x * mr[i] - y * mg[i] - z * mb[i];
    }
    return [box(ar), box(ag), box(ab), box(bb)];
  });
}

// 前景颜色估计（Germer et al. 2020 的 blur fusion 近似）
// 返回 F：去掉背景色的前景 [R, G, B]；MF / MB：最后一轮的局部前景、背景均值，可在更高分辨率上复用
export function estimateForeground(I, alpha, w, h, radii) {
  const n = w * h;
  const tmp = new Float32Array(n);
  const box = (src, r) => boxBlur(src, w, h, r, new Float32Array(n), tmp);
  let F = I;
  let Bk = I;
  let MF = [];
  for (const r of radii) {
    const ba = box(alpha, r);
    const nextF = [];
    const nextB = [];
    MF = [];
    for (let c = 0; c < 3; c++) {
      const fa = new Float32Array(n);
      const bi = new Float32Array(n);
      const Fc = F[c], Bc = Bk[c];
      for (let i = 0; i < n; i++) {
        fa[i] = Fc[i] * alpha[i];
        bi[i] = Bc[i] * (1 - alpha[i]);
      }
      const bf = box(fa, r);
      const bbk = box(bi, r);
      const src = I[c];
      const mfa = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = alpha[i];
        const mf = bf[i] / (ba[i] + 1e-5);
        const mb = bbk[i] / (1 - ba[i] + 1e-5);
        mfa[i] = mf;
        bbk[i] = mb;
        const v = mf + a * (src[i] - a * mf - (1 - a) * mb);
        bf[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
      MF.push(mfa);
      nextF.push(bf);
      nextB.push(bbk);
    }
    F = nextF;
    Bk = nextB;
  }
  return { F, MF, MB: Bk };
}

// 2×2 平均缩小一半
function half(src, w, h) {
  const w2 = (w + 1) >> 1, h2 = (h + 1) >> 1;
  const out = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    const ya = 2 * y * w, yb = Math.min(h - 1, 2 * y + 1) * w;
    for (let x = 0; x < w2; x++) {
      const xa = 2 * x, xb = Math.min(w - 1, 2 * x + 1);
      out[y * w2 + x] = (src[ya + xa] + src[ya + xb] + src[yb + xa] + src[yb + xb]) * 0.25;
    }
  }
  return out;
}

export const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * low：与蒙版同尺寸的原图像素（ImageData 结构）
 * mask：前景置信度 Float32Array（low 尺寸）；hair：头发置信度（low 尺寸）
 * high：精修输出尺寸的原图像素
 * 返回 { width, height, data }，RGBA，RGB 已去背景色，A 为精修后的透明度
 */
export function refineMatte({ low, mask, hair, high }, opt = {}) {
  const lw = low.width, lh = low.height, ln = lw * lh;
  const W = high.width, H = high.height, n = W * H;
  const r = opt.radius ?? Math.max(2, Math.round(Math.max(lw, lh) / 64));
  const g0 = opt.gain ?? 2.6;
  const g1 = opt.hairGain ?? 1.4;
  const lim = opt.limit ?? 0.35;

  // 衣服、脸的边缘用小 eps 保持锐利；头发用大 eps，过渡更柔和，也不会把背景纹理带成斑点
  const [sharp, soft] = guidedCoeffs(channels(low), mask, lw, lh, r, [opt.eps ?? 4e-3, opt.epsHair ?? 3e-2]);
  const hairSoft = boxBlur(hair, lw, lh, Math.max(1, r >> 1));
  const cap = new Float32Array(ln);
  for (let i = 0; i < ln; i++) {
    const t = smooth(0.1, 0.45, hairSoft[i]);
    // 头发处过渡放缓、阈值放低，保住发梢；其他地方边缘收紧。把这条曲线直接折进系数里，省得高分辨率上再算
    const gain = g0 - (g0 - g1) * t;
    const center = 0.55 - 0.1 * t;
    for (let k = 0; k < 3; k++) sharp[k][i] = (sharp[k][i] + (soft[k][i] - sharp[k][i]) * t) * gain;
    sharp[3][i] = (sharp[3][i] + (soft[3][i] - sharp[3][i]) * t - center) * gain + 0.5;
    // 模型认为是背景的地方不信导向滤波，防止背景纹理被带成小斑点
    cap[i] = smooth(0, lim, mask[i]);
  }
  // 系数双线性放大到高分辨率并当场求 alpha（不落地 5 张大图，省内存也更快）
  const I = channels(high);
  const [R, G, B] = I;
  const alpha = new Float32Array(n);
  const planes = [...sharp, cap];
  const rows = planes.map(() => new Float32Array(lw));
  const x0 = new Int32Array(W), x1 = new Int32Array(W), fx = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = Math.min(lw - 1, Math.max(0, ((x + 0.5) * lw) / W - 0.5));
    x0[x] = Math.floor(u);
    x1[x] = Math.min(lw - 1, x0[x] + 1);
    fx[x] = u - x0[x];
  }
  const [rA, rG, rB, rC, rK] = rows;
  for (let y = 0; y < H; y++) {
    const v = Math.min(lh - 1, Math.max(0, ((y + 0.5) * lh) / H - 0.5));
    const y0 = Math.floor(v), o0 = y0 * lw, o1 = Math.min(lh - 1, y0 + 1) * lw, fy = v - y0;
    for (let k = 0; k < 5; k++) {
      const s = planes[k], row = rows[k];
      for (let x = 0; x < lw; x++) row[x] = s[o0 + x] + (s[o1 + x] - s[o0 + x]) * fy;
    }
    for (let x = 0, i = y * W; x < W; x++, i++) {
      const a0 = x0[x], a1 = x1[x], f = fx[x];
      let a =
        (rA[a0] + (rA[a1] - rA[a0]) * f) * R[i] +
        (rG[a0] + (rG[a1] - rG[a0]) * f) * G[i] +
        (rB[a0] + (rB[a1] - rB[a0]) * f) * B[i] +
        rC[a0] + (rC[a1] - rC[a0]) * f;
      const c = rK[a0] + (rK[a1] - rK[a0]) * f;
      if (a > c) a = c;
      alpha[i] = a < 0 ? 0 : a > 1 ? 1 : a;
    }
  }

  // 去掉孤立的小斑点：周围 3×3 几乎全透明的像素压下去，连续的边缘不受影响
  const near = boxBlur(alpha, W, H, 1);
  for (let i = 0; i < n; i++) if (alpha[i] > near[i] * 2) alpha[i] = near[i] * 2;

  // 局部前景 / 背景均值很平滑，在半分辨率上估计；最后一步在原分辨率上算，保留发丝纹理
  const w2 = (W + 1) >> 1, h2 = (H + 1) >> 1;
  const L = Math.max(w2, h2);
  const { MF, MB } = estimateForeground(
    I.map((c) => half(c, W, H)),
    half(alpha, W, H),
    w2,
    h2,
    [Math.max(4, Math.round(L / 16)), Math.max(1, Math.round(L / 220))],
  );

  const data = new Uint8ClampedArray(n * 4);
  const src = high.data;
  for (let y = 0, i = 0; y < H; y++) {
    const v = Math.min(h2 - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
    const y0 = Math.floor(v), y1 = Math.min(h2 - 1, y0 + 1), fy = v - y0;
    for (let x = 0; x < W; x++, i++) {
      const j = i * 4;
      const a = alpha[i];
      data[j + 3] = a * 255;
      if (a > 0.98 || a === 0) {
        data[j] = src[j];
        data[j + 1] = src[j + 1];
        data[j + 2] = src[j + 2];
        continue;
      }
      const u = Math.min(w2 - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
      const x0 = Math.floor(u), x1 = Math.min(w2 - 1, x0 + 1), fx = u - x0;
      const p00 = y0 * w2 + x0, p01 = y0 * w2 + x1, p10 = y1 * w2 + x0, p11 = y1 * w2 + x1;
      const lerp = (f) => {
        const top = f[p00] + (f[p01] - f[p00]) * fx;
        const bot = f[p10] + (f[p11] - f[p10]) * fx;
        return top + (bot - top) * fy;
      };
      for (let c = 0; c < 3; c++) {
        const mf = lerp(MF[c]);
        const mb = lerp(MB[c]);
        data[j + c] = (mf + a * (I[c][i] - a * mf - (1 - a) * mb)) * 255;
      }
    }
  }
  return { width: W, height: H, data };
}
