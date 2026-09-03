// WGSL shaders for Laplace-solver topological gradient rendering
// Three-stage pipeline: init -> Jacobi iteration -> render

// Uniform buffer size for InitParams
// Byte layout: width f32 (4), height f32 (4), contour_count u32 (4), pad u32 (4) = 16 bytes
export const LAPLACE_INIT_PARAMS_SIZE: number = 16;

// Uniform buffer size for JacobiParams
// Byte layout: width u32 (4), height u32 (4) = 8 bytes
export const LAPLACE_JACOBI_PARAMS_SIZE: number = 8;

// Uniform buffer size for RenderParams
// Byte layout: resolution vec2f (8), stop_count u32 (4), easing u32 (4),
//              interpolation u32 (4), pad u32 (4), pad u32 (4), pad u32 (4) = 32 bytes
export const LAPLACE_RENDER_PARAMS_SIZE: number = 32;

// --- Stage 1: Initialization compute shader ---
// Sets boundary conditions from contour geometry.
// Writes initial elevation values and a boundary mask texture.

export const TOPO_LAPLACE_INIT_WGSL: string = /* wgsl */ `
struct InitParams {
  width: f32,
  height: f32,
  contour_count: u32,
  _pad: u32,
};

struct ContourHeader {
  elevation: f32,
  segment_start: u32,
  segment_count: u32,
  _pad: u32,
};

struct Segment {
  data: vec4f,  // x1, y1, x2, y2
};

@group(0) @binding(0) var<uniform> params: InitParams;
@group(0) @binding(1) var<storage, read> contours: array<ContourHeader>;
@group(0) @binding(2) var<storage, read> segments: array<Segment>;
@group(0) @binding(3) var elevation_out: texture_storage_2d<r32float, write>;
@group(0) @binding(4) var mask_out: texture_storage_2d<r32float, write>;

// Ray-casting even-odd containment test
// (Duplicated from topo-shader.js — WGSL has no module imports)
fn isInsideContour(p: vec2f, startIdx: u32, count: u32) -> bool {
  var crossings = 0u;
  for (var i = 0u; i < count; i++) {
    let seg = segments[startIdx + i].data;
    let ax = seg.x; let ay = seg.y;
    let bx = seg.z; let by = seg.w;
    let minY = min(ay, by);
    let maxY = max(ay, by);
    if (p.y < minY || p.y >= maxY) { continue; }
    let t = (p.y - ay) / (by - ay);
    let xIntercept = ax + t * (bx - ax);
    if (xIntercept > p.x) { crossings++; }
  }
  return (crossings & 1u) == 1u;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  let y = gid.y;
  let w = u32(params.width);
  let h = u32(params.height);
  if (x >= w || y >= h) { return; }

  let pos = vec2f(f32(x) + 0.5, f32(y) + 0.5);

  // Image edges are boundary at elevation 0 (base color)
  if (x == 0u || y == 0u || x == w - 1u || y == h - 1u) {
    textureStore(elevation_out, vec2u(x, y), vec4f(0.0, 0.0, 0.0, 0.0));
    textureStore(mask_out, vec2u(x, y), vec4f(1.0, 0.0, 0.0, 0.0));
    return;
  }

  // Detect contour boundary: pixel where containment status differs from a neighbor.
  // These pixels get FIXED at the contour's elevation as Dirichlet boundary conditions.
  // Elevation = innermost contour containing this pixel (lowest->highest, last wins).
  var elevation = 0.0;
  var isBoundary = false;

  for (var i = 0u; i < params.contour_count; i++) {
    let hdr = contours[i];
    let inside = isInsideContour(pos, hdr.segment_start, hdr.segment_count);

    if (inside) {
      elevation = hdr.elevation;
    }

    // Only mark as boundary if pixel is INSIDE this contour AND has a neighbor outside.
    // This creates a 1-pixel boundary on the inner edge — free pixels outside can
    // diffuse toward it, creating smooth gradients between contour levels.
    if (!isBoundary && inside) {
      let left   = isInsideContour(vec2f(pos.x - 1.0, pos.y), hdr.segment_start, hdr.segment_count);
      let right  = isInsideContour(vec2f(pos.x + 1.0, pos.y), hdr.segment_start, hdr.segment_count);
      let up     = isInsideContour(vec2f(pos.x, pos.y - 1.0), hdr.segment_start, hdr.segment_count);
      let down   = isInsideContour(vec2f(pos.x, pos.y + 1.0), hdr.segment_start, hdr.segment_count);
      if (!left || !right || !up || !down) {
        isBoundary = true;
      }
    }
  }

  // Boundary pixels: fixed at contour elevation (Dirichlet condition).
  // Free pixels: initialized to region elevation (innermost contour) as a good
  // initial guess for Jacobi. This is close to the true solution, so convergence
  // is fast — only transition zones between contours need smoothing.
  // Image edges (boundary at 0) provide the gradient that drives diffusion outward.
  textureStore(elevation_out, vec2u(x, y), vec4f(elevation, 0.0, 0.0, 0.0));
  textureStore(mask_out, vec2u(x, y), vec4f(select(0.0, 1.0, isBoundary), 0.0, 0.0, 0.0));
}
`;

// --- Stage 2: Jacobi iteration compute shader ---
// Iteratively relaxes free (non-boundary) pixels toward the Laplace solution.
// Ping-pongs between elevation_in and elevation_out textures.

export const TOPO_LAPLACE_JACOBI_WGSL: string = /* wgsl */ `
struct JacobiParams {
  width: u32,
  height: u32,
};

@group(0) @binding(0) var<uniform> params: JacobiParams;
@group(0) @binding(1) var elevation_in: texture_storage_2d<r32float, read>;
@group(0) @binding(2) var elevation_out: texture_storage_2d<r32float, write>;
@group(0) @binding(3) var mask: texture_storage_2d<r32float, read>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  let y = gid.y;
  if (x >= params.width || y >= params.height) { return; }

  let isBoundary = textureLoad(mask, vec2u(x, y)).r > 0.5;
  let current = textureLoad(elevation_in, vec2u(x, y)).r;

  if (isBoundary) {
    // Boundary: copy through unchanged
    textureStore(elevation_out, vec2u(x, y), vec4f(current, 0.0, 0.0, 0.0));
    return;
  }

  // Free pixel: average of 4 neighbors (edge-clamped)
  let left  = textureLoad(elevation_in, vec2u(max(x, 1u) - 1u, y)).r;
  let right = textureLoad(elevation_in, vec2u(min(x + 1u, params.width - 1u), y)).r;
  let up    = textureLoad(elevation_in, vec2u(x, max(y, 1u) - 1u)).r;
  let down  = textureLoad(elevation_in, vec2u(x, min(y + 1u, params.height - 1u))).r;

  let avg = (left + right + up + down) * 0.25;
  textureStore(elevation_out, vec2u(x, y), vec4f(avg, 0.0, 0.0, 0.0));
}
`;

// --- Stage 3: Render fragment shader ---
// Samples the solved elevation texture and maps through the color ramp.
// Reuses TOPO_VERTEX_WGSL from topo-shader.js for the vertex stage.

export const TOPO_LAPLACE_RENDER_WGSL: string = /* wgsl */ `
// Byte layout (with WGSL alignment rules):
//   offset  0: resolution     vec2f     (8 bytes)
//   offset  8: stop_count     u32       (4 bytes)
//   offset 12: easing         u32       (4 bytes) — index into EASING_ORDER (src/stdlib/easing-curves.ts): 0=linear 1=smoothstep 2=ease-in 3=ease-out 4=ease-in-out 5+=named family
//   offset 16: interpolation  u32       (4 bytes) — 0=sRGB 1=OKLab
//   offset 20: _pad1          u32       (4 bytes)
//   offset 24: _pad2          u32       (4 bytes)
//   offset 28: _pad3          u32       (4 bytes)
//   Total: 32 bytes
struct RenderParams {
  resolution: vec2f,
  stop_count: u32,
  easing: u32,
  interpolation: u32,
  _pad1: u32,
  _pad2: u32,
  _pad3: u32,
};

// Color stop: offset + RGB
// 16 bytes per entry
struct ColorStop {
  offset: f32,
  r: f32,
  g: f32,
  b: f32,
};

@group(0) @binding(0) var<uniform> params: RenderParams;
@group(0) @binding(1) var<storage, read> stops: array<ColorStop>;
@group(0) @binding(2) var elevation_tex: texture_2d<f32>;

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
  return vec3f(linear_to_srgb(clamp(lr, 0.0, 1.0)), linear_to_srgb(clamp(lg, 0.0, 1.0)), linear_to_srgb(clamp(lb, 0.0, 1.0)));
}

// --- Easing functions: spliced in by playground/gpu/easing-wgsl.ts from the
// compiler's buildEasingWgsl() (src/stdlib/easing-curves.ts) ---
//__EASING_FUNCTIONS__

// --- Color ramp sampling ---

// Sample the color ramp at a given elevation value in [0,1].
// Linear scan through sorted stops, interpolate between adjacent pair.
fn sampleColorRamp(elevation: f32) -> vec3f {
  let count = params.stop_count;

  if (count == 0u) {
    return vec3f(0.0);
  }
  if (count == 1u || elevation <= stops[0].offset) {
    return vec3f(stops[0].r, stops[0].g, stops[0].b);
  }
  let last = count - 1u;
  if (elevation >= stops[last].offset) {
    return vec3f(stops[last].r, stops[last].g, stops[last].b);
  }

  // Find bracketing stops
  var lo = 0u;
  var hi = last;
  for (var i = 0u; i < count - 1u; i = i + 1u) {
    if (elevation >= stops[i].offset && elevation <= stops[i + 1u].offset) {
      lo = i;
      hi = i + 1u;
      break;
    }
  }

  let loStop = stops[lo];
  let hiStop = stops[hi];
  let range = hiStop.offset - loStop.offset;

  if (range < 0.00001) {
    return vec3f(hiStop.r, hiStop.g, hiStop.b);
  }

  let f = (elevation - loStop.offset) / range;

  if (params.interpolation == 1u) {
    // OKLab interpolation
    let lab_lo = srgb_to_oklab(vec3f(loStop.r, loStop.g, loStop.b));
    let lab_hi = srgb_to_oklab(vec3f(hiStop.r, hiStop.g, hiStop.b));
    let blended = mix(lab_lo, lab_hi, f);
    return oklab_to_srgb(blended);
  }

  // sRGB interpolation (linearize to avoid gamma-induced dark bands)
  let lin_lo = vec3f(srgb_to_linear(loStop.r), srgb_to_linear(loStop.g), srgb_to_linear(loStop.b));
  let lin_hi = vec3f(srgb_to_linear(hiStop.r), srgb_to_linear(hiStop.g), srgb_to_linear(hiStop.b));
  let blended = mix(lin_lo, lin_hi, f);
  return vec3f(linear_to_srgb(blended.x), linear_to_srgb(blended.y), linear_to_srgb(blended.z));
}

// --- Fragment main ---

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Bilinear sample the Laplace-solved elevation field
  // (r32float is not filterable, so we interpolate manually)
  let texSize = vec2f(textureDimensions(elevation_tex));
  let tc = uv * texSize - 0.5;
  let x0 = u32(clamp(floor(tc.x), 0.0, texSize.x - 1.0));
  let y0 = u32(clamp(floor(tc.y), 0.0, texSize.y - 1.0));
  let x1 = min(x0 + 1u, u32(texSize.x) - 1u);
  let y1 = min(y0 + 1u, u32(texSize.y) - 1u);
  let fx = clamp(fract(tc.x), 0.0, 1.0);
  let fy = clamp(fract(tc.y), 0.0, 1.0);

  let e00 = textureLoad(elevation_tex, vec2u(x0, y0), 0).r;
  let e10 = textureLoad(elevation_tex, vec2u(x1, y0), 0).r;
  let e01 = textureLoad(elevation_tex, vec2u(x0, y1), 0).r;
  let e11 = textureLoad(elevation_tex, vec2u(x1, y1), 0).r;

  let elevation = mix(mix(e00, e10, fx), mix(e01, e11, fx), fy);

  // Apply easing to the elevation value
  let eased = applyEasing(elevation, params.easing);

  // Map through color ramp
  let color = sampleColorRamp(eased);
  return vec4f(color, 1.0);
}
`;
