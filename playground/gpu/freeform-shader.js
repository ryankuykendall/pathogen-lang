// WGSL shaders for freeform (IDW) gradient rendering
// Full-screen triangle approach: 3 vertices, no vertex buffer needed.

// Uniform buffer size for FreeformParams (see byte layout comment in fragment shader)
export const FREEFORM_PARAMS_SIZE = 32;

// Each ColorPoint is 6 x f32 = 24 bytes
export const COLOR_POINT_STRIDE = 24;

export const FREEFORM_VERTEX_WGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  // Full-screen triangle: 3 vertices that cover the entire clip space.
  // Vertex 0: (-1, -1), Vertex 1: (3, -1), Vertex 2: (-1, 3)
  // The GPU clips to the viewport, so only the visible quad is shaded.
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );

  var out: VertexOutput;
  out.position = vec4f(pos[vid], 0.0, 1.0);
  // Map clip-space [-1,1] to UV [0,1]. Y is flipped so UV (0,0) is top-left.
  out.uv = vec2f(
    (pos[vid].x + 1.0) * 0.5,
    (1.0 - pos[vid].y) * 0.5,
  );
  return out;
}
`;

export const FREEFORM_FRAGMENT_WGSL = /* wgsl */ `
// Byte layout (with WGSL alignment rules):
//   offset  0: resolution     vec2f    (8 bytes)
//   offset  8: grad_size      vec2f    (8 bytes) — gradient width/height
//   offset 16: falloff        f32      (4 bytes)
//   offset 20: point_count    u32      (4 bytes)
//   offset 24: interpolation  u32      (4 bytes) — 0=sRGB, 1=OKLab
//   offset 28: _pad           u32      (4 bytes)
//   Total: 32 bytes
struct FreeformParams {
  resolution: vec2f,
  grad_size: vec2f,
  falloff: f32,
  point_count: u32,
  interpolation: u32,
  _pad: u32,
};

struct ColorPoint {
  x: f32,
  y: f32,
  r: f32,
  g: f32,
  b: f32,
  a: f32,
};

@group(0) @binding(0) var<uniform> params: FreeformParams;
@group(0) @binding(1) var<storage, read> points: array<ColorPoint>;

// --- OKLab conversion functions (Ottosson's matrices) ---

fn srgb_to_linear(c: f32) -> f32 {
  if (c <= 0.04045) { return c / 12.92; }
  return pow((c + 0.055) / 1.055, 2.4);
}

fn linear_to_srgb(c: f32) -> f32 {
  if (c <= 0.0031308) { return c * 12.92; }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn srgb_to_oklab(rgb: vec3f) -> vec3f {
  let lr = srgb_to_linear(rgb.x);
  let lg = srgb_to_linear(rgb.y);
  let lb = srgb_to_linear(rgb.z);
  let l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  let m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  let s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  let l_ = pow(max(l, 0.0), 1.0 / 3.0);
  let m_ = pow(max(m, 0.0), 1.0 / 3.0);
  let s_ = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3f(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

fn oklab_to_srgb(lab: vec3f) -> vec3f {
  let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  let l = l_ * l_ * l_;
  let m = m_ * m_ * m_;
  let s = s_ * s_ * s_;
  let lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return vec3f(linear_to_srgb(lr), linear_to_srgb(lg), linear_to_srgb(lb));
}

// --- IDW blending ---

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Map UV to gradient coordinate space
  let pos = uv * params.grad_size;

  var totalWeight = 0.0;

  if (params.interpolation == 1u) {
    // OKLab interpolation: convert point colors, blend in OKLab, convert back
    var totalLab = vec3f(0.0);
    var totalAlpha = 0.0;

    for (var i = 0u; i < params.point_count; i++) {
      let pt = points[i];
      let d = distance(pos, vec2f(pt.x, pt.y));
      let w = 1.0 / pow(max(d, 0.001), params.falloff);
      let lab = srgb_to_oklab(vec3f(pt.r, pt.g, pt.b));
      totalLab += lab * w;
      totalAlpha += pt.a * w;
      totalWeight += w;
    }

    let blendedLab = totalLab / totalWeight;
    let blendedAlpha = totalAlpha / totalWeight;
    let rgb = oklab_to_srgb(blendedLab);
    return clamp(vec4f(rgb, blendedAlpha), vec4f(0.0), vec4f(1.0));
  } else {
    // sRGB interpolation: linearize before blending to avoid gamma-induced dark bands
    var totalColor = vec4f(0.0);

    for (var i = 0u; i < params.point_count; i++) {
      let pt = points[i];
      let d = distance(pos, vec2f(pt.x, pt.y));
      let w = 1.0 / pow(max(d, 0.001), params.falloff);
      let linear = vec4f(srgb_to_linear(pt.r), srgb_to_linear(pt.g), srgb_to_linear(pt.b), pt.a);
      totalColor += linear * w;
      totalWeight += w;
    }

    let blended = totalColor / totalWeight;
    return clamp(vec4f(linear_to_srgb(blended.r), linear_to_srgb(blended.g), linear_to_srgb(blended.b), blended.a), vec4f(0.0), vec4f(1.0));
  }
}
`;
