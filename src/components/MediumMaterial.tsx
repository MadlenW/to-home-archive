'use client'

import { extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'
import { Color, ShaderMaterial, Vector2 } from 'three'
import type { RoomId } from '../stores/useExperienceStore'

// ─── Vertex shader ────────────────────────────────────────────────────────────
// vObjPos = object-space vertex position BEFORE displacement.
// Used in fragment for mode 4 fur strand noise (stable, moves with mesh).

const MEDIUM_VERT = /* glsl */`
  uniform float uTime;
  uniform float uMediumType;
  uniform float uNoiseScale;
  uniform float uLayer;      // 0 = root shell  1 = tip shell (fur mode only)

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vWorldPos;
  varying vec3  vObjPos;     // object-space position before displacement

  // ── Simplex noise 3D (Gustavson) ─────────────────────────────────────────
  vec3 mod289v3(vec3 x)  { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 mod289v4(vec4 x)  { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 permute4(vec4 x)  { return mod289v4(((x*34.0)+1.0)*x); }
  vec4 taylorInv(vec4 r) { return 1.79284291400159 - 0.85373472095314*r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289v3(i);
    vec4 p = permute4(permute4(permute4(
      i.z + vec4(0.0,i1.z,i2.z,1.0))
      + i.y + vec4(0.0,i1.y,i2.y,1.0))
      + i.x + vec4(0.0,i1.x,i2.x,1.0));
    float n_ = 0.142857142857;
    vec3  ns  = n_ * D.wyz - D.xzx;
    vec4  j   = p - 49.0*floor(p*ns.z*ns.z);
    vec4  x_  = floor(j*ns.z);
    vec4  y_  = floor(j - 7.0*x_);
    vec4  x   = x_*ns.x + ns.yyyy;
    vec4  y   = y_*ns.x + ns.yyyy;
    vec4  h   = 1.0 - abs(x) - abs(y);
    vec4  b0  = vec4(x.xy, y.xy);
    vec4  b1  = vec4(x.zw, y.zw);
    vec4  s0  = floor(b0)*2.0 + 1.0;
    vec4  s1  = floor(b1)*2.0 + 1.0;
    vec4  sh  = -step(h, vec4(0.0));
    vec4  a0  = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4  a1  = b1.xzyw + s1.xzyw*sh.zzww;
    vec3  p0  = vec3(a0.xy, h.x);
    vec3  p1  = vec3(a0.zw, h.y);
    vec3  p2  = vec3(a1.xy, h.z);
    vec3  p3  = vec3(a1.zw, h.w);
    vec4  nm  = taylorInv(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= nm.x; p1 *= nm.y; p2 *= nm.z; p3 *= nm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  // ── 4-octave fBm ─────────────────────────────────────────────────────────
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5; float f = 1.0;
    for (int i = 0; i < 4; i++) { v += a*snoise(p*f); a *= 0.5; f *= 2.1; }
    return v;
  }

  void main() {
    vUv     = uv;
    vNormal = normalize(normalMatrix * normal);
    vObjPos = position;  // stable object-space position for fur strand pattern

    float ns   = max(uNoiseScale, 0.1);
    float disp = 0.0;

    if (uMediumType < 0.5) {
      // Crystalline — large low-freq fold combined with high-freq sharp wrinkle
      float largeFold = fbm(position * 0.042 * ns + vec3(uTime*0.12, 0.0, uTime*0.08));
      float wrinkle   = snoise(position * 1.80 * ns + vec3(uTime*0.31, uTime*0.22, 0.0));
      disp = wrinkle * 0.045 + largeFold * 0.028;

    } else if (uMediumType < 1.5) {
      // Skin/Organic — breathing modulates wrinkle amplitude; pore grain is constant
      // breathAmp cycles between 0.4 and 1.0 — surface gently expands and contracts
      float breathAmp    = 0.70 + 0.30 * sin(uTime * 0.55);
      float wrinkleNoise = snoise(position * 0.36 * ns + uTime * 0.06);
      float poreNoise    = abs(snoise(position * 2.10 * ns + uTime * 0.04));
      disp = wrinkleNoise * breathAmp * 0.085 + poreNoise * 0.022;

    } else if (uMediumType < 2.5) {
      // Pixel/Glitch — floor-quantized grid cells snap into blocky square tiles.
      // glitchIntensity spikes with time; jitter provides fine sub-cell noise.
      float glitchIntensity = 0.50 + 0.50 * abs(sin(uTime * 1.70));
      vec3  cellPos   = floor(position * 3.2 * ns) / (3.2 * ns);   // grid snap
      float cellNoise = snoise(cellPos + vec3(0.0, 0.0, uTime * 0.9));
      float jitter    = snoise(position * 8.5 * ns + uTime * 3.2);  // sub-cell
      disp = (floor(cellNoise * 4.0) / 4.0) * glitchIntensity * 0.18
           + jitter * glitchIntensity * 0.05;

    } else if (uMediumType < 3.5) {
      // Photo Emulsion — wide, gentle rhythmic paper buckling along normals.
      // Single low-frequency Simplex tap: broad unhurried sheet warps, not fBm noise.
      float buckle = snoise(position * 0.022 * ns + vec3(uTime*0.022, uTime*0.013, 0.0));
      disp = buckle * 0.55;

    } else {
      // Fur / Cloud — displace shells INWARD (toward camera at sphere centre).
      // uLayer 0 = root (outermost, sphere surface), 1 = tip (innermost, closest).
      // Wind wobble applies increasingly to outer shells for a fibrous sway.
      float wind = snoise(position * 0.11 + vec3(uTime*0.14, uTime*0.09, 0.0)) * 0.40;
      disp = -(uLayer * 2.8 + wind * (1.0 - uLayer) * 0.55);
    }

    vec3 displaced = position + normal * disp;
    vWorldPos      = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position    = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

// ─── Fragment shader ──────────────────────────────────────────────────────────

const MEDIUM_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uMediumType;
  uniform vec3  uBaseColor;
  uniform float uIntensity;
  uniform float uNoiseScale;
  uniform float uRoughness;
  uniform float uLayer;
  uniform vec2  uWindowSize;  // canvas pixel dimensions — for screen-space halftone

  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vWorldPos;
  varying vec3  vObjPos;

  // ── Voronoi (Pixel mode) ──────────────────────────────────────────────────
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float voronoi(vec2 p) {
    vec2 n = floor(p); vec2 f = fract(p); float md = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2  g = vec2(float(i), float(j));
      float d = length(g + hash2(n + g) - f);
      if (d < md) md = d;
    }
    return md;
  }

  // ── Simplex noise 3D (fragment copy) — micro-bump + sparkle ─────────────
  // Compiled separately from the vertex shader so names are independent.
  vec3 sm289v3(vec3 x)  { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 sm289v4(vec4 x)  { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 sperm4(vec4 x)   { return sm289v4(((x*34.0)+1.0)*x); }
  vec4 stinv(vec4 r)    { return 1.79284291400159 - 0.85373472095314*r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 gg = step(x0.yzx, x0.xyz);
    vec3 ll = 1.0 - gg;
    vec3 i1 = min(gg.xyz, ll.zxy);
    vec3 i2 = max(gg.xyz, ll.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = sm289v3(i);
    vec4 p = sperm4(sperm4(sperm4(
      i.z + vec4(0.0,i1.z,i2.z,1.0))
      + i.y + vec4(0.0,i1.y,i2.y,1.0))
      + i.x + vec4(0.0,i1.x,i2.x,1.0));
    float sn_ = 0.142857142857;
    vec3  sns = sn_ * D.wyz - D.xzx;
    vec4  sj  = p - 49.0*floor(p*sns.z*sns.z);
    vec4  sx_ = floor(sj*sns.z);
    vec4  sy_ = floor(sj - 7.0*sx_);
    vec4  sx  = sx_*sns.x + sns.yyyy;
    vec4  sy  = sy_*sns.x + sns.yyyy;
    vec4  sh  = 1.0 - abs(sx) - abs(sy);
    vec4  sb0 = vec4(sx.xy, sy.xy);
    vec4  sb1 = vec4(sx.zw, sy.zw);
    vec4  ss0 = floor(sb0)*2.0 + 1.0;
    vec4  ss1 = floor(sb1)*2.0 + 1.0;
    vec4  ssh = -step(sh, vec4(0.0));
    vec4  sa0 = sb0.xzyw + ss0.xzyw*ssh.xxyy;
    vec4  sa1 = sb1.xzyw + ss1.xzyw*ssh.zzww;
    vec3  sp0 = vec3(sa0.xy, sh.x);
    vec3  sp1 = vec3(sa0.zw, sh.y);
    vec3  sp2 = vec3(sa1.xy, sh.z);
    vec3  sp3 = vec3(sa1.zw, sh.w);
    vec4  snm = stinv(vec4(dot(sp0,sp0),dot(sp1,sp1),dot(sp2,sp2),dot(sp3,sp3)));
    sp0 *= snm.x; sp1 *= snm.y; sp2 *= snm.z; sp3 *= snm.w;
    vec4 sm = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    sm = sm * sm;
    return 42.0 * dot(sm*sm, vec4(dot(sp0,x0),dot(sp1,x1),dot(sp2,x2),dot(sp3,x3)));
  }

  void main() {
    // BackSide sphere: flip normal inward so lighting faces the viewer
    vec3 nrm     = -normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    vec3  lightDir    = normalize(vec3(0.35, 1.0, 0.25));
    float ndl         = dot(nrm, lightDir);
    float halfLambert = ndl * 0.5 + 0.5;
    float fr          = pow(1.0 - max(0.0, dot(viewDir, nrm)), 3.5);

    vec3  color = uBaseColor;
    float ns    = max(uNoiseScale, 0.1);

    // ── Mode 0: Crystalline — micro-bump specular + icy Fresnel + sparkle ──
    if (uMediumType < 0.5) {
      // High-frequency micro-bump: two fBm taps at vUv*65 perturb the normal
      float bx   = snoise(vec3(vUv * 65.0 * ns,                   uTime * 0.08));
      float by   = snoise(vec3(vUv * 65.0 * ns + vec2(17.3, 5.7), uTime * 0.07));
      vec3  bump = normalize(nrm + vec3(bx, by, 0.0) * 0.22);

      // Two-stage specular using the micro-bump normal
      vec3  H    = normalize(viewDir + lightDir);
      float nhD  = max(0.0, dot(bump, H));
      float specA = pow(nhD, 48.0) * 0.90;   // hot glassy glint
      float specB = pow(nhD, 12.0) * 0.35;   // soft wet sheen

      // Icy Fresnel rim — power 2.2 gives a broader, glowing crystal edge
      float frIce = pow(1.0 - max(0.0, dot(viewDir, bump)), 2.2);

      // Crystal sparkle: 5-tap cubed Simplex noise → isolated star-points that drift
      float sparkSum = 0.0;
      for (int k = 0; k < 5; k++) {
        float kf = float(k);
        float sn = snoise(vWorldPos * (1.9 + kf * 0.65) + uTime * (0.10 + kf * 0.038));
        sparkSum += pow(max(0.0, sn), 3.0);
      }
      float sparkle = sparkSum * 0.20 * uIntensity;

      color += vec3(specA + specB + sparkle);
      color += uBaseColor * frIce * 0.58 * max(uIntensity, 0.4);
      color  = color * (halfLambert * 0.60 + 0.40);
      color  = clamp(color, 0.0, 1.0);
      gl_FragColor = vec4(color, 1.0);
      return;

    // ── Mode 1: Skin/Organic — pore micro-normal + matte specular + SSS ────
    } else if (uMediumType < 1.5) {
      // Pore-scale normal perturbation — two noise taps in UV space
      float poreScale = 28.0 * ns;
      float pnX = snoise(vec3(vUv * poreScale,                     uTime * 0.04));
      float pnY = snoise(vec3(vUv * poreScale + vec2(3.7, 9.2),    uTime * 0.04));
      vec3  poreNrm = normalize(nrm + vec3(pnX, pnY, 0.0) * 0.30);

      // Broad matte specular — power 8 = wide, flat highlight; attenuated by roughness
      vec3  H     = normalize(viewDir + lightDir);
      float matte = pow(max(0.0, dot(poreNrm, H)), 8.0) * (1.0 - uRoughness) * 0.60;

      // Refined SSS: bell-shaped glow peaks exactly at the light terminator (ndl==0),
      // plus a deep backlit scatter on the fully unlit side
      float sssBoundary = exp(-abs(ndl) * 6.0);           // peaks at ndl = 0
      float sssDeep     = max(0.0, -ndl) * uIntensity;    // gradual bleed on dark side
      float sss         = (sssBoundary * 0.55 + sssDeep * 0.30) * uIntensity;
      color += uBaseColor * sss * vec3(1.00, 0.72, 0.54); // warm flesh scatter

      // Chromatic flush: pore crevices (near noise zero-crossings) get a warm undertone
      float crevice = 1.0 - smoothstep(0.0, 0.32, abs(pnX));
      color = mix(color, color * vec3(1.06, 0.94, 0.88), crevice * 0.26);

      color += vec3(matte);

    // ── Mode 2: Pixel/Glitch — screen-locked halftone + TV static + chrom. aber. ──
    } else if (uMediumType < 2.5) {
      // Glitch intensity — pulses rapidly, drives aberration amplitude and flash
      float caGlitch = 0.40 + 0.60 * abs(sin(uTime * 2.20));

      // Screen-space halftone: 8px dot pitch locked to the screen lens.
      // gl_FragCoord is in physical pixels — pattern holds still as geometry moves.
      float dotSize  = 8.0;
      vec2  dotCtrG  = fract(gl_FragCoord.xy / dotSize) - 0.5;
      float caOffset = caGlitch * 6.0;  // pixel shift for chromatic split
      vec2  dotCtrR  = fract((gl_FragCoord.xy + vec2(-caOffset, 0.0)) / dotSize) - 0.5;
      vec2  dotCtrB  = fract((gl_FragCoord.xy + vec2( caOffset, 0.0)) / dotSize) - 0.5;
      float dotG     = 1.0 - smoothstep(0.26, 0.38, length(dotCtrG));
      float dotR     = 1.0 - smoothstep(0.26, 0.38, length(dotCtrR));
      float dotB     = 1.0 - smoothstep(0.26, 0.38, length(dotCtrB));

      // Apply per-channel: offset R and B produce the malfunctioning screen split
      color.r = mix(0.06, uBaseColor.r, dotR);
      color.g = mix(0.06, uBaseColor.g, dotG);
      color.b = mix(0.06, uBaseColor.b, dotB);

      // TV static grain — vertex/world-coordinate scan-lines, gamma-compressed
      // so the distribution collapses to isolated bright sparks over dark mids
      float scanX = floor(vWorldPos.x * 11.0 + uTime * 5.5);
      float scanY = floor(vWorldPos.y *  9.5);
      float grain = fract(sin(scanX * 127.1 + scanY * 311.7) * 43758.5453);
      grain       = pow(grain, 2.2);
      color      += vec3(grain * 0.18 * uIntensity);

      // Hard aberration flash: fires only at the peak of each glitch spike
      float flash = step(0.92, caGlitch);
      color.r    += flash * 0.08;
      color.b    -= flash * 0.06;
      color       = clamp(color, 0.0, 1.0);

    // ── Mode 3: Photo Emulsion — warm paper + scratches + dust + edge aber. ─
    } else if (uMediumType < 3.5) {
      // Warm paper baseline (#f8f6f2) — replaces generic white with aged emulsion tone
      color = mix(color, vec3(0.973, 0.965, 0.949), 0.78);

      // Vertical hair scratches: 4 passes at different X scales, Y-only scroll.
      // floor(sUV.x) gives a constant hash per column → crisp continuous verticals.
      float scratchScale = 130.0 * ns;
      for (int s = 0; s < 4; s++) {
        float sf        = float(s);
        vec2  sUV       = vUv * (scratchScale + sf * 19.0) + vec2(0.0, uTime * (0.15 + sf * 0.04));
        float colHash   = fract(sin(floor(sUV.x) * 128.5 + sf * 37.1) * 43758.5453);
        float isLine    = step(0.965, colHash);                // ~3.5% of columns scratched
        float subPixel  = abs(fract(sUV.x) - 0.5) * 2.0;
        float lineAlpha = (1.0 - smoothstep(0.0, 0.20, subPixel)) * isLine;
        color += vec3(lineAlpha * 0.14);
      }

      // Dust specs: hard step(0.96, …) threshold → isolated bright physical fragments.
      vec2  dustUV   = vUv * 240.0 * ns;
      float dustHash = fract(sin(dot(floor(dustUV), vec2(127.1, 311.7))) * 43758.5453);
      float dustCel  = length(fract(dustUV) - 0.5);
      color += vec3(step(0.96, dustHash) * (1.0 - smoothstep(0.0, 0.28, dustCel)) * 0.65);

      // Edge chromatic aberration: warm red-fringe pushed to far corners, zero at centre.
      // smoothstep(0.3, 0.7, radius) gives a smooth mask that ignores the inner 30% of UVs.
      float edgeMask = smoothstep(0.3, 0.7, length(vUv - 0.5));
      color += vec3(0.040, -0.018, -0.025) * edgeMask;
      color  = clamp(color, 0.0, 1.0);

    // ── Mode 4: Fur / Cloud — multi-shell occlusion + fibrous Fresnel ─────
    } else {
      // Strand noise in object space — stable regardless of camera movement
      float f1 = sin(vObjPos.x * 1.30 + vObjPos.y * 0.55 + uTime * 0.16);
      float f2 = sin(vObjPos.z * 1.10 - vObjPos.y * 0.78 + uTime * 0.11) * 0.72;
      float strand = (f1 + f2 + 2.0) * 0.25;  // remap to [0,1]

      // Root layers dense (low threshold), tip layers sparser
      float threshold = mix(0.18, 0.68, uLayer);
      float fiberMask = smoothstep(threshold, threshold + 0.10, strand);

      // Structural occlusion: roots shaded, tips catch pristine light
      float layerBright = mix(0.70, 1.0, uLayer);

      // Fresnel rim glow — wider spread at tips (lower power = broader halo)
      float rimPow = mix(4.0, 1.8, uLayer);
      float rim    = pow(1.0 - max(0.0, dot(viewDir, nrm)), rimPow);

      color  = uBaseColor * layerBright;
      color += uBaseColor * rim * 1.5 * max(uIntensity, 0.5);
      color  = clamp(color, 0.0, 1.0);

      // Alpha: root density fades toward tip; rim always glows through
      float rootAlpha = (1.0 - uLayer * 0.82) * fiberMask;
      float rimAlpha  = rim * 0.65 * max(uLayer, 0.15);
      float alpha     = clamp(rootAlpha + rimAlpha, 0.0, 0.90);

      gl_FragColor = vec4(color, alpha);
      return;
    }

    // ── Standard lighting for modes 0-3 ──────────────────────────────────
    color += uBaseColor * fr * 0.45 * max(uIntensity, 0.3);
    color  = color * (halfLambert * 0.65 + 0.35);
    color  = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Material class ───────────────────────────────────────────────────────────

export const MediumMaterial = shaderMaterial(
  {
    uTime:       0.0,
    uMediumType: 0.0,   // 0=water  1=skin  2=pixel  3=photo  4=fur/cloud
    uLayer:      0.0,   // 0=root  1=tip  (fur mode shell index, others ignore)
    uBaseColor:  new Color('#fcfbf9'),
    uIntensity:  0.6,
    uNoiseScale: 0.5,
    uRoughness:  0.6,
    uWindowSize: new Vector2(1920, 1080),  // updated each frame in StandardEnclosure
  },
  MEDIUM_VERT,
  MEDIUM_FRAG,
)

extend({ MediumMaterial })

export type MediumMat = ShaderMaterial & {
  uTime:       number
  uMediumType: number
  uLayer:      number
  uBaseColor:  Color
  uIntensity:  number
  uNoiseScale: number
  uRoughness:  number
  uWindowSize: Vector2
}

// ─── Room → medium type mapping ───────────────────────────────────────────────

export const MEDIUM_BY_ROOM: Record<RoomId, number> = {
  'kitchen':     1,   // Skin        — porous grain, warm SSS
  'hallway':     2,   // Pixel       — Voronoi fissures, glitch steps
  'bathroom':    0,   // Water       — rolling waves, caustic dapple
  'bedroom':     3,   // Photo       — silver-halide grain, slow buckling
  'living-room': 4,   // Fur / Cloud — multi-shell transparency, Fresnel fibres
}

// Fog density multiplier per medium — cozy-alcove vs. vast-void scale feel
export const FOG_SCALE: Record<number, number> = {
  0: 0.75,   // Water: open, spacious
  1: 1.10,   // Skin: intimate, warm density
  2: 1.00,   // Pixel: standard
  3: 0.45,   // Photo: crisp architectural void
  4: 0.55,   // Fur/Cloud: airy, diffuse light
}
