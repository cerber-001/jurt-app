/* Толпа: шейдер фигур — поза, руки, шаг и цвета считаются на видеокарте (по 32 числа на человека).
   Перенесён со старой страницы haram3d (v3.19) без поз намаза, полиции и кистей рук — они появятся на следующем этапе.

   Вера: лиц нет ни у кого. Белок глаза, радужка и губы (материалы 8, 9, 10) и кожа передней части головы
   (звено «шея+голова», передняя полусфера; у мужчин и борода) заменены нуром — светом, который светит сам:
   тёплый белый #FFF8E8 в центре лица → #FFE7B0 к краю, от освещения сцены не зависит (не темнеет в тени и сбоку),
   нос, губы и брови сглажены до ровной поверхности, к краю лица — мягкий радиальный переход в кожу или хиджаб.
   Вокруг головы — мягкий ореол (halo.ts).
   Солнцезащитные очки (13, 14) и брюки формы (12) не нужны — их треугольники не берутся вовсе (figures.ts). */

/** Роль материала фигуры fig_mN из props.glb */
export type FigRole = 'cloth' | 'skin' | 'hair' | 'beard' | 'forearm' | 'shoulder' | 'torso' | 'shoes' | 'nur' | 'drop'

const ROLES: Readonly<Record<number, FigRole>> = {
  0: 'cloth', 1: 'skin', 2: 'hair', 3: 'beard', 5: 'forearm', 6: 'shoulder', 7: 'torso',
  8: 'nur', 9: 'nur', 10: 'nur',   // белок глаза, радужка, губы → нур
  11: 'shoes',
  12: 'drop', 13: 'drop', 14: 'drop',   // брюки формы, стёкла и оправа очков
}

export const figRole = (m: number): FigRole => ROLES[m] ?? 'drop'

/** Номер «материала» нура в атрибуте aPart (у исходных 0…14 его нет) */
export const NUR_ID = 15
/** Номер материала для шейдера: глаза и губы → нур, лишнее → −1 (не брать) */
export function shaderMat(m: number): number {
  const r = figRole(m)
  return r === 'drop' ? -1 : r === 'nur' ? NUR_ID : m
}

/** Цвет нура (sRGB): в центре лица и у его края */
export const NUR_CENTER_HEX = 0xfff8e8
export const NUR_EDGE_HEX = 0xffe7b0
/** Сила свечения: нур светит сам, рассеянного света сцены в нём нет */
export const NUR_GLOW = 1.25

/** Порядок чисел человека в буфере экземпляров: 8 × vec4 */
export const INST_ATTRS = ['iP', 'iC0', 'iC1', 'iC2', 'iLook', 'iPose', 'iAR', 'iAL'] as const
export const INST_STRIDE = INST_ATTRS.length * 4

const glArr = (type: string, name: string, a: readonly number[]) =>
  `const ${type} ${name}[${a.length}] = ${type}[${a.length}](${a.map(v => (type === 'int' ? String(v) : v.toFixed(3))).join(', ')});\n`

/** Объявления и функции до main(): скелет (как fkAngles в gait.ts) */
export function figHead(par: readonly number[], piv: readonly string[], ruku: readonly number[]): string {
  return `attribute vec2 aPart, aSk;
attribute vec4 iP, iC0, iC1, iC2, iLook, iPose, iAR, iAL;
varying vec3 vFigCol, vFigCol2;
varying float vFigM, vFigDd, vFigNur;
varying vec2 vFigFace;
mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
mat2 r2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
${glArr('int', 'KPAR', par)}${glArr('float', 'K_RUKU', ruku)}const vec2 PV[12] = vec2[12](${piv.map(k => `vec2(FK_${k}Y, FK_${k}Z)`).join(', ')});
// углы звеньев: наклон корпуса iPose.x, шаг iPose.y (+ — правое бедро вперёд); ровно как fkAngles() в gait.ts
void fkAng(out float T[12]) {
  float tl = iPose.x, aR = clamp(-tl / 1.35, 0., 1.), up = max(tl, 0.), s = iPose.y;
  for (int i = 0; i < 12; i++) {
    float t = K_RUKU[i] * aR;
    if (i < 4) t += up;
    else {
      int j = i & 3;
      float th = i < 8 ? 2.4 * s : -2.4 * s;
      t += j == 0 ? th : j == 1 ? (th > 0. ? .25 * th : th) : j == 2 && th < 0. ? .8 * th : 0.;
    }
    T[i] = t;
  }
}
`
}

/** Нур на лице: вес по передней полусфере головы, гладкая поверхность и нормаль сферы */
const NUR_VERTEX = `
  float fNur = fM > ${NUR_ID - 0.5} ? 1. : 0.;
  if (int(aSk.x + .5) == 3 && (abs(fM - 1.) < .5 || abs(fM - 3.) < .5))
    fNur = smoothstep(NUR_Z0, NUR_Z1, -position.z) * smoothstep(NUR_Y0, NUR_Y1, position.y);
  vFigNur = fNur;
  vFigFace = vec2(position.x / NUR_RX, (position.y - NUR_FY) / NUR_RY);   // 0 — центр лица, 1 — край овала
  if (fNur > 0.) {
    fN = normalize(mix(fN, normalize(position - vec3(0., NUR_CY, NUR_CZ)), fNur));
    fP.z = mix(fP.z, max(fP.z, NUR_FRONT), fNur);
  }
`

/** Руки: предплечье вокруг локтя, потом вся рука вокруг плеча (вес смягчает локоть и подмышку) */
const ARMS = `
  if (fB > 1.5 && fB < 5.5) {
    bool fR = fB < 3.5; vec4 fA = fR ? iAR : iAL; float fS = fR ? 1. : -1.;
    vec3 fJ = vec3(fS * JX, JY, 0.);
    mat3 fSh = rZ(fS * fA.y) * rX(fA.x);
    if (abs(fB - 3.) < .5 || abs(fB - 5.) < .5) {
      vec3 fE = vec3(fS * EX, EY, EZ); mat3 fF = rY(fS * fA.w) * rX(fA.z);
      fP = mix(fP, fE + fF * (fP - fE), fU); fN = mix(fN, fF * fN, fU);
      fP = fJ + fSh * (fP - fJ); fN = fSh * fN;
    } else { fP = mix(fP, fJ + fSh * (fP - fJ), fU); fN = mix(fN, fSh * fN, fU); }
  }
`

/** Скелет: вершина поворачивается вокруг сустава своего звена; юбка изара/абаи — за бедром и голенью */
const SKELETON = `
  float fT[12]; fkAng(fT);
  int fC = int(aSk.x + .5); float fWk = aSk.y, fAng; vec2 fO, fPv;
  if (fC >= 12) {
    float sR = smoothstep(-.06, .06, position.x), tTh = mix(fT[8], fT[4], sR);
    if (fC == 12) { fAng = mix(fT[0], tTh, fWk); fO = PV[0]; fPv = PV[0]; }
    else { fAng = mix(tTh, mix(fT[9], fT[5], sR), fWk); fO = PV[0] + r2(tTh) * (PV[5] - PV[0]); fPv = PV[5]; }
  } else {
    int fA[5]; int fn = 0, k = fC;
    for (int i = 0; i < 5; i++) { fA[i] = k; fn = i + 1; if (k == 0) break; k = KPAR[k]; }
    fO = PV[0];
    for (int i = fn - 2; i >= 0; i--) fO += r2(fT[fA[i + 1]]) * (PV[fA[i]] - PV[fA[i + 1]]);
    fPv = PV[fC];
    fAng = mix(fC == 0 ? 0. : fT[KPAR[max(fC, 1)]], fT[fC], fWk);
  }
  mat2 fR2 = r2(fAng);
  fP.yz = fO + fR2 * (fP.yz - fPv); fN.yz = fR2 * fN.yz;
  fP.y += iC1.w;   // на пол: в шаге ноги «короче» (gait.ts → groundLift)
  if (fC >= 12 && fP.y < .006) { fP.y = .006 + (fP.y - .006) * .05; fN = normalize(mix(fN, vec3(0., 1., 0.), .5)); }
`

/** Цвета: одежда, кожа, волосы или хиджаб, борода, рукава, открытое плечо (идтиба), обувь */
const COLORS = `
  vec3 fSk = iC1.rgb, fCov = mix(fSk, iC0.rgb, iLook.z);
  vFigCol = iC0.rgb; vFigCol2 = fCov;
  if (abs(fM - 1.) < .5) vFigCol = fSk;
  else if (abs(fM - 2.) < .5) vFigCol = mix(fSk * .88, iC2.rgb, clamp(iLook.x * 3., 0., 1.));
  else if (abs(fM - 3.) < .5) vFigCol = iLook.y > .01 ? iC2.rgb : fSk;
  else if (abs(fM - 5.) < .5) vFigCol = mix(fSk, iC0.rgb, iLook.w);
  else if (abs(fM - 6.) < .5) vFigCol = fCov;
  else if (abs(fM - 11.) < .5) vFigCol = iLook.z > .99 && iLook.w > .99 && iLook.x > .99 ? vec3(.09, .08, .08) : vec3(.2, .13, .08);
`

/** Тело main(): после него three.js берёт figP и figN вместо position и normal */
export const FIG_MAIN = `
  float fB = floor(aPart.x / 16. + .01), fM = aPart.x - fB * 16., fU = aPart.y;
  vec3 fP = position, fN = normal;
  vFigM = fM;
  vFigDd = dot(position.xy - vec2(.06, JY - .03), vec2(.54, .84));
${NUR_VERTEX}${ARMS}${SKELETON}
  mat3 fRy = rY(iP.w);
  vec3 figP = iP.xyz + fRy * (fP * iC0.w), figN = fRy * fN;
${COLORS}`

/** Цвет пикселя: рида наискось на торсе, изнанка ткани в тени, нур поверх всего.
    Нур: вес — по передней полусфере головы и по овалу лица (мягко гаснет к краю); там, где он есть,
    рассеянный цвет уходит в ноль — свет даёт только свечение, поэтому тень и бок сцены его не затемняют */
export const FIG_FRAG = `
  float fNurR = length(vFigFace), fNurW = vFigNur * (1. - smoothstep(.85, 1.35, fNurR));
  vec3 fNurC = mix(NUR_IN, NUR_OUT, smoothstep(.1, 1., fNurR));
  vec3 fCol = vFigCol;
  if (abs(vFigM - 7.) < .5) {
    fCol = vFigDd > 0. ? vFigCol2 : vFigCol;
    if (abs(vFigDd) < .012 && distance(vFigCol, vFigCol2) > .01) fCol *= .82;
  }
  if (!gl_FrontFacing) fCol *= .3;
  fCol *= 1. - fNurW;
  diffuseColor.rgb *= fCol;
`

/** Нур светится сам: тёплый белый в центре → тёплый к краю, без бликов */
export const FIG_EMISSIVE = `
  totalEmissiveRadiance += fNurC * ${NUR_GLOW.toFixed(2)} * fNurW;
`
export const FIG_ROUGH = `
  if (abs(vFigM - 1.) < .5 || abs(vFigM - 5.) < .5) roughnessFactor = .62;
  roughnessFactor = mix(roughnessFactor, 1., fNurW);
`

export const FIG_FRAG_HEAD = 'varying vec3 vFigCol, vFigCol2;\nvarying float vFigM, vFigDd, vFigNur;\nvarying vec2 vFigFace;\n'
