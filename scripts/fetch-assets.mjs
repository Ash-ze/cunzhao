// 准备运行时资源：从 node_modules 复制 MediaPipe wasm，下载两个模型（Apache-2.0）。
// 已存在的文件会跳过，dev 和 build 前自动执行。
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
mkdirSync(join(pub, 'wasm'), { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  const dst = join(pub, 'wasm', f);
  if (!existsSync(dst)) cpSync(join(wasmSrc, f), dst);
}

const MODELS = {
  'face.tflite': 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
  'selfie_multiclass.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
};
mkdirSync(join(pub, 'models'), { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dst = join(pub, 'models', name);
  if (existsSync(dst)) continue;
  console.log(`下载 ${name} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${url}: ${res.status}`);
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
}
