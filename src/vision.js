// 人脸检测 + 人像分割，全部在浏览器本地运行（MediaPipe Tasks，WASM）。
import { FilesetResolver, FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision';
import { refineMatte } from './matte.js';

const BASE = import.meta.env.BASE_URL;

// MediaPipe 的 wasm 把 INFO 级日志打到 console.error，降级成 info，免得控制台一片红让人以为出错
{
  const raw = console.error.bind(console);
  console.error = (...args) => (typeof args[0] === 'string' && args[0].startsWith('INFO:') ? console.info(...args) : raw(...args));
}
let filesetPromise;
let detectorPromise;
let segmenterPromise;
let onSegProgress = null;

function fileset() {
  filesetPromise ??= FilesetResolver.forVisionTasks(`${BASE}wasm`);
  return filesetPromise;
}

// 带进度地下载模型，拿到字节后通过 modelAssetBuffer 交给 MediaPipe。
// 服务器开了压缩时 content-length 是压缩后的大小或干脆没有，这时用预估大小 sizeHint
async function fetchModel(url, onProgress, sizeHint = 0) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`模型下载失败（HTTP ${res.status}），请检查网络后重试`);
  const len = res.headers.get('content-encoding') ? 0 : +res.headers.get('content-length');
  const total = len || sizeHint;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    // 预估大小可能不准，没下完之前最多显示到 99%
    onProgress?.(Math.min(got, total ? total * 0.99 : got), total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  return buf;
}

function detector() {
  detectorPromise ??= Promise.all([fileset(), fetchModel(`${BASE}models/face.tflite`)]).then(([fs, buf]) =>
    FaceDetector.createFromOptions(fs, {
      baseOptions: { modelAssetBuffer: buf },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.4,
    }),
  );
  detectorPromise.catch(() => (detectorPromise = null)); // 失败了下次可以重试
  return detectorPromise;
}

function segmenter() {
  segmenterPromise ??= Promise.all([
    fileset(),
    fetchModel(`${BASE}models/selfie_multiclass.tflite`, (got, total) => onSegProgress?.(got, total), 16.4e6),
  ]).then(([fs, buf]) =>
    ImageSegmenter.createFromOptions(fs, {
      baseOptions: { modelAssetBuffer: buf },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }),
  );
  segmenterPromise.catch(() => (segmenterPromise = null));
  return segmenterPromise;
}

// 返回所有人脸框（源图像素坐标），按面积从大到小
export async function detectFaces(canvas) {
  const det = await detector();
  const { detections } = det.detect(canvas);
  return detections
    .map(({ boundingBox: b }) => ({ x: b.originX, y: b.originY, w: b.width, h: b.height }))
    .sort((a, b) => b.w * b.h - a.w * a.h);
}

function scaled(canvas, maxSide) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  return s === 1 ? canvas : resized(canvas, Math.round(canvas.width * s), Math.round(canvas.height * s));
}

function resized(canvas, w, h) {
  if (canvas.width === w && canvas.height === h) return canvas;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

const pixels = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

// 返回与源图同尺寸、alpha 为人像蒙版的 canvas（人像不透明，背景透明）
// onProgress(已下载字节, 总字节) 只在首次下载模型时触发
export async function cutout(canvas, onProgress) {
  onSegProgress = onProgress;
  const seg = await segmenter();
  onSegProgress = null;
  onProgress?.(1, 1); // 下载完成

  // 模型输入 256×256，蒙版按 512 输出就够；细节靠后面按原图引导精修
  const small = scaled(canvas, 512);
  const result = seg.segment(small);
  const bg = result.confidenceMasks[0].getAsFloat32Array(); // 类别 0 = 背景
  const hair = result.confidenceMasks[1].getAsFloat32Array(); // 类别 1 = 头发
  const lw = result.confidenceMasks[0].width;
  const lh = result.confidenceMasks[0].height;
  const fg = new Float32Array(bg.length);
  for (let i = 0; i < bg.length; i++) fg[i] = 1 - bg[i];
  const hairCopy = Float32Array.from(hair);
  result.close();

  // 精修分辨率封顶 1280，超大照片再放大回原尺寸，人像区域的观感差别不大
  const work = scaled(canvas, 1280);
  const lowImg = pixels(resized(small, lw, lh)); // 引导图与蒙版同尺寸
  const hiImg = pixels(work);
  const out = refineMatte({ low: lowImg, mask: fg, hair: hairCopy, high: hiImg });

  const wc = document.createElement('canvas');
  wc.width = work.width;
  wc.height = work.height;
  wc.getContext('2d').putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
  if (work === canvas) return wc;
  const full = document.createElement('canvas');
  full.width = canvas.width;
  full.height = canvas.height;
  const fctx = full.getContext('2d');
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(wc, 0, 0, full.width, full.height);
  return full;
}

export function preload() {
  detector().catch(() => {});
}
