// WGSL shaders for conic gradient rendering
// Full-screen triangle approach: 3 vertices, no vertex buffer needed.

// Uniform buffer size for ConicParams (see byte layout comment in fragment shader)
export const CONIC_PARAMS_SIZE: number = 64;

// Each ColorStop is 5 x f32 = 20 bytes
export const COLOR_STOP_STRIDE: number = 20;

export const CONIC_VERTEX_WGSL: string = /* wgsl */ `
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

export const CONIC_FRAGMENT_WGSL: string = /* wgsl */ `
const PI: f32 = 3.14159265358979323846;
const TWO_PI: f32 = 6.28318530717958647692;

// Byte layout (with WGSL alignment rules):
//   offset  0: center           vec2f    (8 bytes)
//   offset  8: from_angle       f32      (4 bytes)
//   offset 12: to_angle         f32      (4 bytes)
//   offset 16: inner_radius     f32      (4 bytes)
//   offset 20: direction        f32      (4 bytes)
//   offset 24: spread           f32      (4 bytes)
//   offset 28: inner_fill_mode  u32      (4 bytes)  0=transparent, 1=center, 2=custom
//   offset 32: resolution       vec2f    (8 bytes)
//   offset 40: stop_count       u32      (4 bytes)
//   offset 44: _pad             -        (4 bytes — vec4f needs 16-byte align)
//   offset 48: inner_fill_color vec4f    (16 bytes) only used when mode=2
//   Total: 64 bytes
struct ConicParams {
  center: vec2f,
  from_angle: f32,
  to_angle: f32,
  inner_radius: f32,
  direction: f32,
  spread: f32,
  inner_fill_mode: u32,    // 0=transparent, 1=center (first stop), 2=custom color
  resolution: vec2f,
  stop_count: u32,
  _pad: u32,
  inner_fill_color: vec4f, // RGBA used when inner_fill_mode == 2
};

struct ColorStop {
  offset: f32,
  r: f32,
  g: f32,
  b: f32,
  a: f32,
};

@group(0) @binding(0) var<uniform> params: ConicParams;
@group(0) @binding(1) var<storage, read> stops: array<ColorStop>;

// Sample the color ramp at parameter t in [0,1].
// Finds the two bracketing stops and linearly interpolates between them.
fn sampleRamp(t: f32) -> vec4f {
  let count = params.stop_count;

  // Edge cases: before first stop or only one stop
  if (count == 0u) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  if (count == 1u || t <= stops[0].offset) {
    return vec4f(stops[0].r, stops[0].g, stops[0].b, stops[0].a);
  }
  // Past the last stop
  let last = count - 1u;
  if (t >= stops[last].offset) {
    return vec4f(stops[last].r, stops[last].g, stops[last].b, stops[last].a);
  }

  // Find the two bracketing stops
  var lo = 0u;
  var hi = last;
  for (var i = 0u; i < count - 1u; i = i + 1u) {
    if (t >= stops[i].offset && t <= stops[i + 1u].offset) {
      lo = i;
      hi = i + 1u;
      break;
    }
  }

  let loStop = stops[lo];
  let hiStop = stops[hi];
  let range = hiStop.offset - loStop.offset;

  // Avoid division by zero if two stops share the same offset (hard edge)
  if (range < 0.00001) {
    return vec4f(hiStop.r, hiStop.g, hiStop.b, hiStop.a);
  }

  let f = (t - loStop.offset) / range;
  return mix(
    vec4f(loStop.r, loStop.g, loStop.b, loStop.a),
    vec4f(hiStop.r, hiStop.g, hiStop.b, hiStop.a),
    f,
  );
}

// Resolve the inner fill color based on mode.
// 0 = transparent (hard edge), 1 = center (smooth), 2 = custom (smooth), 3 = transparent-blend (smooth)
fn getInnerColor() -> vec4f {
  if (params.inner_fill_mode == 1u) {
    // 'center' — use first stop color
    return sampleRamp(0.0);
  }
  if (params.inner_fill_mode == 2u) {
    // Custom color
    return params.inner_fill_color;
  }
  // 'transparent' (mode 0) and 'transparent-blend' (mode 3)
  return vec4f(0.0, 0.0, 0.0, 0.0);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Convert UV to pixel coordinates relative to center
  let pixel = uv * params.resolution;
  let center_px = params.center * params.resolution;
  let dx = pixel.x - center_px.x;
  let dy = pixel.y - center_px.y;

  let dist = sqrt(dx * dx + dy * dy);

  // Compute angle via atan2. atan2(y, x) returns [-PI, PI].
  // Normalize to [0, TWO_PI) with 0 = right (3 o'clock), increasing clockwise
  // in screen space (since Y points down).
  var angle = atan2(dy, dx);
  if (angle < 0.0) {
    angle = angle + TWO_PI;
  }

  // Apply direction: if counter-clockwise, reverse the angle
  if (params.direction < 0.0) {
    angle = TWO_PI - angle;
  }

  // Map angle into [from_angle, to_angle] range -> t in [0, 1]
  let sweep = params.to_angle - params.from_angle;

  // Normalize angle relative to from_angle
  var relative_angle = angle - params.from_angle;
  // Wrap into [0, TWO_PI)
  relative_angle = relative_angle - floor(relative_angle / TWO_PI) * TWO_PI;

  var t = relative_angle / sweep;

  // Handle spread modes when t is outside [0, 1]
  if (t < 0.0 || t > 1.0) {
    // spread: 0.0 = clamp, 1.0 = repeat, 2.0 = transparent
    if (params.spread > 1.5) {
      // Transparent outside the sweep
      return vec4f(0.0, 0.0, 0.0, 0.0);
    } else if (params.spread > 0.5) {
      // Repeat: wrap t into [0, 1)
      t = t - floor(t);
    } else {
      // Clamp to [0, 1]
      t = clamp(t, 0.0, 1.0);
    }
  }

  // Sample the color ramp
  let sweep_color = sampleRamp(t);

  // Inner radius handling
  if (params.inner_radius > 0.0) {
    if (params.inner_fill_mode == 0u) {
      // 'transparent' — hard cutoff with 1px anti-alias at edge
      if (dist < params.inner_radius + 0.5) {
        let edge = smoothstep(params.inner_radius - 0.5, params.inner_radius + 0.5, dist);
        return mix(vec4f(0.0, 0.0, 0.0, 0.0), sweep_color, edge);
      }
    } else {
      // 'center', custom color, 'transparent-blend' — smooth blend from fill to sweep
      let inner_color = getInnerColor();
      let blend = smoothstep(0.0, params.inner_radius, dist);
      return mix(inner_color, sweep_color, blend);
    }
  }

  return sweep_color;
}
`;
