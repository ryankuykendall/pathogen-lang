// WGSL shaders for topological (SDF-based) gradient rendering
// Full-screen triangle approach: 3 vertices, no vertex buffer needed.

// Uniform buffer size for TopoParams (see byte layout comment in fragment shader)
export const TOPO_PARAMS_SIZE: number = 32;

// Each ContourHeader is 4 x u32/f32 = 16 bytes
export const CONTOUR_HEADER_STRIDE: number = 16;

// Each Segment is 4 x f32 = 16 bytes (x1, y1, x2, y2 packed as vec4f)
export const SEGMENT_STRIDE: number = 16;

// Each ColorStop is 4 x f32 = 16 bytes (offset, r, g, b)
export const TOPO_COLOR_STOP_STRIDE: number = 16;

export const TOPO_VERTEX_WGSL: string = /* wgsl */ `
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

/**
 * Returns the WGSL fragment shader code for topo gradient rendering.
 * Exported as a function for consistency with the pipeline's lazy initialization.
 */
export function getTopoShaderCode(): string {
  return TOPO_FRAGMENT_WGSL;
}

export const TOPO_FRAGMENT_WGSL: string = /* wgsl */ `
// Byte layout (with WGSL alignment rules):
//   offset  0: resolution     vec2f     (8 bytes)
//   offset  8: grad_size      vec2f     (8 bytes)
//   offset 16: contour_count  u32       (4 bytes)
//   offset 20: stop_count     u32       (4 bytes)
//   offset 24: easing         u32       (4 bytes) — index into EASING_ORDER (src/stdlib/easing-curves.ts): 0=linear 1=smoothstep 2=ease-in 3=ease-out 4=ease-in-out 5+=named family
//   offset 28: interpolation  u32       (4 bytes) — 0=sRGB 1=OKLab
//   Total: 32 bytes
struct TopoParams {
  resolution: vec2f,
  grad_size: vec2f,
  contour_count: u32,
  stop_count: u32,
  easing: u32,
  interpolation: u32,
};

// Each contour header: elevation + segment range
// 16 bytes per entry
struct ContourHeader {
  elevation: f32,
  segment_start: u32,
  segment_count: u32,
  _pad: u32,
};

// Segments packed as vec4f (x1, y1, x2, y2)
// 16 bytes per entry
struct Segment {
  data: vec4f,
};

// Color stop: offset + RGB
// 16 bytes per entry
struct ColorStop {
  offset: f32,
  r: f32,
  g: f32,
  b: f32,
};

@group(0) @binding(0) var<uniform> params: TopoParams;
@group(0) @binding(1) var<storage, read> contours: array<ContourHeader>;
@group(0) @binding(2) var<storage, read> segments: array<Segment>;
@group(0) @binding(3) var<storage, read> stops: array<ColorStop>;

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

// --- SDF utility functions ---

// Point-to-line-segment distance
fn distToSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let ap = p - a;
  let t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  let closest = a + t * ab;
  return distance(p, closest);
}

// Ray-casting even-odd containment test
// Casts a horizontal ray from p to the right, counts crossings
fn isInsideContour(p: vec2f, startIdx: u32, count: u32) -> bool {
  var crossings = 0u;
  for (var i = 0u; i < count; i++) {
    let seg = segments[startIdx + i].data;
    let ax = seg.x; let ay = seg.y;
    let bx = seg.z; let by = seg.w;

    // Check if the segment crosses the horizontal ray from p
    let minY = min(ay, by);
    let maxY = max(ay, by);

    if (p.y < minY || p.y >= maxY) { continue; }

    // Compute x-intercept of the segment at y = p.y
    let t = (p.y - ay) / (by - ay);
    let xIntercept = ax + t * (bx - ax);

    if (xIntercept > p.x) {
      crossings++;
    }
  }
  return (crossings & 1u) == 1u;
}

// Minimum distance from point to all segments of a contour
fn minDistToContour(p: vec2f, startIdx: u32, count: u32) -> f32 {
  var minDist = 1e10;
  for (var i = 0u; i < count; i++) {
    let seg = segments[startIdx + i].data;
    let a = vec2f(seg.x, seg.y);
    let b = vec2f(seg.z, seg.w);
    let d = distToSegment(p, a, b);
    minDist = min(minDist, d);
  }
  return minDist;
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
// Smooth signed-distance blending: each contour contributes its elevation
// via a smooth blend of its signed distance. Contours must be sorted by
// elevation (lowest first) in the buffer. Processing from lowest to highest,
// each contour's blend smoothly overrides the current elevation.

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pos = uv * params.grad_size;

  // Bandwidth: half-width of the smooth transition zone around each contour
  let bw = min(params.grad_size.x, params.grad_size.y) * 0.08;

  var elevation = 0.0;

  // Process contours from lowest to highest elevation.
  // Each contour smoothly blends its elevation into the running value.
  for (var i = 0u; i < params.contour_count; i++) {
    let hdr = contours[i];

    // Signed distance: negative inside, positive outside
    let inside = isInsideContour(pos, hdr.segment_start, hdr.segment_count);
    let uDist = minDistToContour(pos, hdr.segment_start, hdr.segment_count);
    let sd = select(uDist, -uDist, inside);

    // Smooth blend: 1.0 deep inside, 0.0 far outside, smooth transition at boundary
    let rawBlend = clamp(0.5 - sd / (2.0 * bw), 0.0, 1.0);
    let blend = applyEasing(rawBlend, params.easing);

    elevation = mix(elevation, hdr.elevation, blend);
  }

  let color = sampleColorRamp(elevation);
  return vec4f(color, 1.0);
}
`;
