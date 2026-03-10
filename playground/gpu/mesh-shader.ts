// WGSL shaders for mesh gradient rendering
// Full-screen triangle approach: 3 vertices, no vertex buffer needed.

// Uniform buffer size for MeshParams (see byte layout comment in fragment shader)
export const MESH_PARAMS_SIZE: number = 32;

// Each MeshVertex is 6 x f32 = 24 bytes
export const MESH_VERTEX_STRIDE: number = 24;

export const MESH_VERTEX_WGSL: string = /* wgsl */ `
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

export const MESH_FRAGMENT_WGSL: string = /* wgsl */ `
// Byte layout (with WGSL alignment rules):
//   offset  0: resolution     vec2f    (8 bytes)
//   offset  8: grad_size      vec2f    (8 bytes) — gradient width/height
//   offset 16: rows           u32      (4 bytes)
//   offset 20: cols           u32      (4 bytes)
//   offset 24: interpolation  u32      (4 bytes) — 0=sRGB, 1=OKLab
//   offset 28: _pad           u32      (4 bytes)
//   Total: 32 bytes
struct MeshParams {
  resolution: vec2f,
  grad_size: vec2f,
  rows: u32,
  cols: u32,
  interpolation: u32,
  _pad: u32,
};

struct MeshVertex {
  x: f32,
  y: f32,
  r: f32,
  g: f32,
  b: f32,
  a: f32,
};

@group(0) @binding(0) var<uniform> params: MeshParams;
@group(0) @binding(1) var<storage, read> vertices: array<MeshVertex>;

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

// --- Inverse bilinear mapping ---

fn cross2d(a: vec2f, b: vec2f) -> f32 {
  return a.x * b.y - a.y * b.x;
}

// Maps a 2D point inside an arbitrary quad to parametric (u, v) coordinates.
// a=p00 (top-left), b=p10 (top-right), c=p01 (bottom-left), d=p11 (bottom-right)
fn inverseBilinear(p: vec2f, a: vec2f, b: vec2f, c: vec2f, d: vec2f) -> vec2f {
  let e = b - a;  // top edge
  let f = c - a;  // left edge
  let g = a - b + d - c;  // non-linearity
  let h = p - a;  // offset from corner

  let k2 = cross2d(g, f);
  let k1 = cross2d(e, f) + cross2d(h, g);
  let k0 = cross2d(h, e);

  // Solve quadratic k2*v^2 + k1*v + k0 = 0
  if (abs(k2) < 0.0001) {
    // Linear case (axis-aligned grid)
    let v = -k0 / k1;
    let u_denom = e.x + g.x * v;
    var u: f32;
    if (abs(u_denom) > 0.0001) {
      u = (h.x - f.x * v) / u_denom;
    } else {
      u = (h.y - f.y * v) / (e.y + g.y * v);
    }
    return vec2f(u, v);
  }

  let disc = k1 * k1 - 4.0 * k0 * k2;
  if (disc < 0.0) { return vec2f(-1.0); }

  let sqrtDisc = sqrt(disc);
  let v1 = (-k1 - sqrtDisc) / (2.0 * k2);
  let v2 = (-k1 + sqrtDisc) / (2.0 * k2);

  // Pick the root in [0,1]
  var v = v1;
  if (v < -0.01 || v > 1.01) { v = v2; }

  let u_denom = e.x + g.x * v;
  var u: f32;
  if (abs(u_denom) > 0.0001) {
    u = (h.x - f.x * v) / u_denom;
  } else {
    u = (h.y - f.y * v) / (e.y + g.y * v);
  }
  return vec2f(u, v);
}

// --- Bilinear patch interpolation ---

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Map UV to gradient coordinate space
  let gx = uv.x * params.grad_size.x;
  let gy = uv.y * params.grad_size.y;

  // Iterate patches. Each patch: (r,c), (r,c+1), (r+1,c), (r+1,c+1)
  var best_color = vec4f(0.0);
  var found = false;

  for (var r = 0u; r < params.rows - 1u; r++) {
    for (var c = 0u; c < params.cols - 1u; c++) {
      let p00 = vertices[r * params.cols + c];
      let p10 = vertices[r * params.cols + c + 1u];
      let p01 = vertices[(r + 1u) * params.cols + c];
      let p11 = vertices[(r + 1u) * params.cols + c + 1u];

      // Bounding box check
      let minX = min(min(p00.x, p10.x), min(p01.x, p11.x));
      let maxX = max(max(p00.x, p10.x), max(p01.x, p11.x));
      let minY = min(min(p00.y, p10.y), min(p01.y, p11.y));
      let maxY = max(max(p00.y, p10.y), max(p01.y, p11.y));

      if (gx < minX || gx > maxX || gy < minY || gy > maxY) { continue; }

      // Inverse bilinear mapping to find (u, v) parametric coords
      let uv_param = inverseBilinear(
        vec2f(gx, gy),
        vec2f(p00.x, p00.y),
        vec2f(p10.x, p10.y),
        vec2f(p01.x, p01.y),
        vec2f(p11.x, p11.y)
      );

      if (uv_param.x >= -0.01 && uv_param.x <= 1.01 && uv_param.y >= -0.01 && uv_param.y <= 1.01) {
        // smoothstep creates an S-curve (zero derivative at 0 and 1),
        // so the color change rate eases to zero at patch boundaries
        // instead of jumping abruptly between adjacent patches.
        let uc = smoothstep(0.0, 1.0, clamp(uv_param.x, 0.0, 1.0));
        let vc = smoothstep(0.0, 1.0, clamp(uv_param.y, 0.0, 1.0));

        if (params.interpolation == 1u) {
          // OKLab: convert corner colors, blend in OKLab, convert back
          let lab00 = srgb_to_oklab(vec3f(p00.r, p00.g, p00.b));
          let lab10 = srgb_to_oklab(vec3f(p10.r, p10.g, p10.b));
          let lab01 = srgb_to_oklab(vec3f(p01.r, p01.g, p01.b));
          let lab11 = srgb_to_oklab(vec3f(p11.r, p11.g, p11.b));

          let blendedLab = mix(mix(lab00, lab10, uc), mix(lab01, lab11, uc), vc);
          let blendedAlpha = mix(mix(p00.a, p10.a, uc), mix(p01.a, p11.a, uc), vc);
          let rgb = oklab_to_srgb(blendedLab);
          best_color = clamp(vec4f(rgb, blendedAlpha), vec4f(0.0), vec4f(1.0));
        } else {
          // sRGB: linearize before blending to avoid gamma-induced dark bands
          let c00 = vec4f(srgb_to_linear(p00.r), srgb_to_linear(p00.g), srgb_to_linear(p00.b), p00.a);
          let c10 = vec4f(srgb_to_linear(p10.r), srgb_to_linear(p10.g), srgb_to_linear(p10.b), p10.a);
          let c01 = vec4f(srgb_to_linear(p01.r), srgb_to_linear(p01.g), srgb_to_linear(p01.b), p01.a);
          let c11 = vec4f(srgb_to_linear(p11.r), srgb_to_linear(p11.g), srgb_to_linear(p11.b), p11.a);

          let blended = mix(mix(c00, c10, uc), mix(c01, c11, uc), vc);
          best_color = vec4f(linear_to_srgb(blended.r), linear_to_srgb(blended.g), linear_to_srgb(blended.b), blended.a);
        }
        found = true;
      }
    }
  }

  if (!found) { return vec4f(0.0); }
  return best_color;
}
`;
