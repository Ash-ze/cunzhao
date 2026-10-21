// 常用证件照规格。px 为上传/单张下载的像素，mm 为打印尺寸（排版按 mm 换算成 300dpi）。
// head：头顶到下巴占照片高度的比例；top：头顶到照片上沿的留白比例。
// bg：推荐底色；kb：常见文件大小上限；group：多人合影，不按单张人脸对齐。
// 要求来自各类公开说明，地区和年份不同会有差异，界面上会提示以官方为准。
export const CATEGORIES = [
  { id: 'common', name: '常用' },
  { id: 'id', name: '证件' },
  { id: 'exam', name: '考试 / 工作' },
  { id: 'visa', name: '签证' },
];

export const SPECS = [
  // 常用
  { id: '1cun', cat: 'common', name: '一寸', note: '简历、报名、学籍、毕业证', mm: [25, 35], px: [295, 413] },
  { id: '2cun', cat: 'common', name: '二寸', note: '简历、各类资格证书', mm: [35, 49], px: [413, 579] },
  { id: 'small1', cat: 'common', name: '小一寸', note: '驾驶证、部分考试', mm: [22, 32], px: [260, 378] },
  { id: 'big1', cat: 'common', name: '大一寸', note: '护照、港澳通行证同尺寸', mm: [33, 48], px: [390, 567] },
  { id: 'small2', cat: 'common', name: '小二寸', note: '部分签证、简历', mm: [35, 45], px: [413, 531] },

  // 证件
  { id: 'idcard', cat: 'id', name: '身份证', note: '二代身份证规格，白底。办证一般以派出所现场采集为准', mm: [26, 32], px: [358, 441], bg: 'white' },
  {
    id: 'shebao', cat: 'id', name: '社保卡', note: '358×441 像素、白底、JPG。文件大小各地不同，常见 ≤ 40KB，以当地社保要求为准',
    mm: [26, 32], px: [358, 441], bg: 'white', kb: 40, keywords: '医保 社会保障卡',
  },
  {
    id: 'passport', cat: 'id', name: '护照 / 港澳通行证', note: '出入境证件：白底，头部长度 28~33mm，露出眉毛和耳朵，不要佩戴首饰',
    mm: [33, 48], px: [390, 567], bg: 'white', head: 0.64, top: 0.07, keywords: '港澳 台湾 通行证 出入境 护照',
  },
  { id: 'driver', cat: 'id', name: '驾驶证', note: '小一寸、白底。网上申领以交管 12123 的要求为准', mm: [22, 32], px: [260, 378], bg: 'white', keywords: '驾照 12123' },
  {
    id: 'marriage', cat: 'id', name: '结婚登记', note: '两人半身合影、红底，并肩坐好头部高度接近。会自动框住所有人脸',
    mm: [53, 35], px: [626, 413], bg: 'red', head: 0.36, top: 0.1, group: true, keywords: '结婚证 婚姻 合影 双人',
  },

  // 考试 / 工作
  {
    id: 'teacher', cat: 'exam', name: '教师资格证', note: '报名系统常见要求：295×413 像素、JPG、≤ 200KB、白底，以当期公告为准',
    mm: [25, 35], px: [295, 413], bg: 'white', kb: 200, keywords: '教资 ntce',
  },
  {
    id: 'exam', cat: 'exam', name: '公务员 / 考试报名', note: '多为 295×413 像素、蓝底或白底、JPG，大小限制 20~100KB 不等，以报名公告为准',
    mm: [25, 35], px: [295, 413], kb: 50, keywords: '国考 省考 事业单位 四六级 计算机 等级考试 报名',
  },
  { id: 'health', cat: 'exam', name: '健康证', note: '一般为一寸，白底或蓝底以当地要求为准', mm: [25, 35], px: [295, 413], keywords: '从业 食品' },

  // 签证
  {
    id: 'us', cat: 'visa', name: '美国签证', note: '白底，600×600~1200×1200 像素，≤ 240KB，头部占照片高度 50%~69%',
    mm: [51, 51], px: [600, 600], bg: 'white', kb: 240, head: 0.6, top: 0.1, keywords: 'ds-160 美签',
  },
  { id: 'jp', cat: 'visa', name: '日本签证', note: '白色或浅色纯色背景，45×45mm', mm: [45, 45], px: [531, 531], bg: 'white', head: 0.6, top: 0.1, keywords: '日签' },
  {
    id: 'schengen', cat: 'visa', name: '申根签证', note: '白色或浅灰纯色背景，下巴到头顶 32~36mm',
    mm: [35, 45], px: [413, 531], bg: 'gray', head: 0.75, top: 0.07, keywords: '欧洲 法国 德国 意大利 西班牙',
  },
  {
    id: 'uk', cat: 'visa', name: '英国签证', note: '浅灰或奶油色纯色背景，下巴到头顶 29~34mm；线上上传至少 600×750 像素',
    mm: [35, 45], px: [600, 771], bg: 'gray', head: 0.7, top: 0.08, keywords: '英签',
  },
  {
    id: 'ca', cat: 'visa', name: '加拿大签证', note: '白色或浅色背景，下巴到头顶 31~36mm；线上上传至少 420×540 像素',
    mm: [35, 45], px: [420, 540], bg: 'white', head: 0.74, top: 0.08,
  },
  {
    id: 'au', cat: 'visa', name: '澳大利亚签证', note: '浅色纯色背景，下巴到头顶 32~36mm', mm: [35, 45], px: [413, 531],
    bg: 'white', head: 0.76, top: 0.07, keywords: '澳洲',
  },
];

export const DEFAULT_HEAD = 0.62;
export const DEFAULT_TOP = 0.09;

export const BACKGROUNDS = [
  { id: 'white', name: '白', color: '#ffffff' },
  { id: 'blue', name: '蓝', color: '#438edb' },
  { id: 'red', name: '红', color: '#d9001b' },
  { id: 'gray', name: '浅灰', color: '#eeeeee' },
];

// 相纸：300dpi 像素，横向。mix：一张纸上混排两种规格
export const PAPERS = [
  { id: '6in', name: '6 寸相纸（4×6 英寸）', px: [1800, 1200] },
  { id: 'mix6', name: '6 寸混排：一寸 + 二寸', px: [1800, 1200], mix: ['1cun', '2cun'] },
  { id: '5in', name: '5 寸相纸（3.5×5 英寸）', px: [1500, 1050] },
  { id: 'a4', name: 'A4 纸', px: [3508, 2480] },
];

export function mmToPx(mm, dpi = 300) {
  return Math.round((mm / 25.4) * dpi);
}

// 打印尺寸（300dpi 像素），排版用它而不是上传像素，保证冲印出来是标准毫米尺寸
export function printPx(spec) {
  return [mmToPx(spec.mm[0]), mmToPx(spec.mm[1])];
}

export const bgOf = (id) => BACKGROUNDS.find((b) => b.id === id);

// 选中规格后显示的要点：像素、尺寸、推荐底色、文件大小
export function specFacts(spec) {
  const facts = [`${spec.px[0]}×${spec.px[1]} 像素`, `${spec.mm[0]}×${spec.mm[1]}mm`];
  if (spec.bg) facts.push(`推荐${bgOf(spec.bg).name}底`);
  if (spec.kb) facts.push(`文件 ≤ ${spec.kb}KB`);
  return facts;
}

// 按关键字过滤规格，匹配名称、用途、关键词和尺寸
export function searchSpecs(query, specs = SPECS) {
  const q = query.trim().toLowerCase();
  if (!q) return specs;
  return specs.filter((s) =>
    [s.name, s.note, s.keywords || '', `${s.mm[0]}×${s.mm[1]}`, `${s.mm[0]}x${s.mm[1]}`, `${s.px[0]}×${s.px[1]}`, `${s.px[0]}x${s.px[1]}`]
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

// 根据头顶、下巴和中线算源图上的裁剪框 { cx, cy, h }。
// head.width：多人合影时所有人的总宽度，保证左右都放得下
export function fitCrop(head, spec) {
  const headRatio = spec.head ?? DEFAULT_HEAD;
  const topRatio = spec.top ?? DEFAULT_TOP;
  const [W, H] = spec.px;
  let h = (head.chin - head.top) / headRatio;
  if (head.width) h = Math.max(h, ((head.width / 0.9) * H) / W);
  return { cx: head.cx, cy: head.top - topRatio * h + h / 2, h };
}
