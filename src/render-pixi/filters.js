// 自寫 GLSL Filter（WebGL）：光束 god rays、潮汐震波 shockwave；以及 DisplacementFilter 水下折射的組裝。
import { Filter, GlProgram, DisplacementFilter, Sprite } from 'pixi.js';

// Pixi v8 標準 filter 頂點著色器（uOutputFrame/uInputSize/uOutputTexture 由 FilterSystem 提供）
const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

// 光束：從光源出發的角度雜訊光柱（水下較強）＋朝光源的 6 點抖動徑向取樣（亮處外溢成光柱）
const RAYS = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform vec2 uLight;
uniform vec3 uColor;
uniform float uStrength;
uniform float uWater;
uniform float uTime;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 toUV = uInputSize.xy / uOutputFrame.zw;
  vec2 uv = vTextureCoord * toUV;
  vec2 d = uv - uLight;
  d.x *= uOutputFrame.z / uOutputFrame.w;
  float ang = atan(d.x, d.y);
  float shafts = n1(ang * 16.0 + uTime * 0.35) * 0.6 + n1(ang * 37.0 - uTime * 0.55) * 0.4;
  shafts = smoothstep(0.5, 1.0, shafts);
  float fall = exp(-length(d) * 1.4);
  float under = smoothstep(uWater - 0.01, uWater + 0.12, uv.y);
  // 每像素抖動取樣起點（interleaved gradient noise），避免亮源被取樣成一串離散殘影
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 stepv = (uv - uLight) * 0.036;
  vec2 p = uv - stepv * jit;
  float acc = 0.0;
  for (int i = 0; i < 6; i++) {
    p -= stepv;
    vec3 c = texture(uTexture, clamp(p / toUV, uInputClamp.xy, uInputClamp.zw)).rgb;
    acc += max(0.0, dot(c, vec3(0.3, 0.59, 0.11)) - 0.7);
  }
  acc *= 0.1667;
  float k = uStrength * (shafts * fall * (0.3 + 0.7 * under) + acc * 1.6);
  finalColor = vec4(base.rgb + uColor * k * base.a, base.a);
}`;

// 震波：以 uCenter 為圓心的擴散環，環內外做相反方向的 UV 位移，並加上 RGB 色散與環上亮邊
const SHOCK = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uWidth;
uniform float uAmp;
uniform vec3 uTint;
void main(void) {
  vec2 toUV = uInputSize.xy / uOutputFrame.zw;
  vec2 uv = vTextureCoord * toUV;
  float asp = uOutputFrame.z / uOutputFrame.w;
  vec2 d = uv - uCenter;
  vec2 da = vec2(d.x * asp, d.y);
  float dist = length(da);
  float x = (dist - uRadius) / uWidth;
  float ring = exp(-x * x * 3.0);
  vec2 dir = dist > 0.0001 ? da / dist : vec2(0.0);
  vec2 off = vec2(dir.x / asp, dir.y) * sin(clamp(x, -1.5, 1.5) * 2.094) * ring * uAmp;
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  float r = texture(uTexture, clamp((uv - off * 1.25) / toUV, lo, hi)).r;
  vec4 g = texture(uTexture, clamp((uv - off) / toUV, lo, hi));
  float b = texture(uTexture, clamp((uv - off * 0.75) / toUV, lo, hi)).b;
  vec3 col = vec3(r, g.g, b) + uTint * ring * min(1.0, uAmp * 18.0) * 0.35;
  finalColor = vec4(col, g.a);
}`;

const u = (value, type) => ({ value, type });

export function createFilters(textures) {
  const rays = new Filter({
    glProgram: GlProgram.from({ vertex: VERT, fragment: RAYS, name: 'tk-godrays' }),
    resources: { raysU: {
      uLight: u(new Float32Array([0.7, -0.15]), 'vec2<f32>'), uColor: u(new Float32Array([1, 0.95, 0.8]), 'vec3<f32>'),
      uStrength: u(0.4, 'f32'), uWater: u(0.7, 'f32'), uTime: u(0, 'f32'),
    } },
  });
  const shock = new Filter({
    glProgram: GlProgram.from({ vertex: VERT, fragment: SHOCK, name: 'tk-shockwave' }),
    resources: { shockU: {
      uCenter: u(new Float32Array([0.5, 0.5]), 'vec2<f32>'), uRadius: u(0, 'f32'), uWidth: u(0.06, 'f32'), uAmp: u(0, 'f32'),
      uTint: u(new Float32Array([0.6, 0.9, 1]), 'vec3<f32>'),
    } },
  });
  // 位移圖 sprite 必須在場景樹中（transform 才會更新）；放在不透明背景之下，畫面上看不到
  const dispSprite = new Sprite(textures.disp);
  const disp = new DisplacementFilter({ sprite: dispSprite, scale: { x: 5, y: 3.5 } });

  const waves = []; // 進行中的震波（只渲染最強的一個）
  const api = {
    list: [disp, rays, shock], disp, rays, shock, dispSprite,
    raysU: rays.resources.raysU.uniforms, shockU: shock.resources.shockU.uniforms,
    // 觸發震波：cx, cy 為 0..1 的畫面座標
    wave(cx, cy, power = 1, tint = [0.6, 0.9, 1]) { waves.push({ cx, cy, t: 0, dur: 0.9 + 0.3 * power, power, tint }); if (waves.length > 4) waves.shift(); },
    update(dt) {
      for (const w of waves) w.t += dt;
      for (let i = waves.length - 1; i >= 0; i--) if (waves[i].t >= waves[i].dur) waves.splice(i, 1);
      const w = waves[waves.length - 1], su = api.shockU;
      shock.enabled = !!w;
      if (!w) return;
      const k = w.t / w.dur;
      su.uCenter[0] = w.cx; su.uCenter[1] = w.cy;
      su.uRadius = 0.04 + k * 0.75 * (0.8 + 0.2 * w.power);
      su.uWidth = 0.05 + 0.05 * k;
      su.uAmp = 0.035 * w.power * (1 - k) * (1 - k);
      su.uTint[0] = w.tint[0]; su.uTint[1] = w.tint[1]; su.uTint[2] = w.tint[2];
    },
    activeWaves: () => waves.length,
  };
  return api;
}
