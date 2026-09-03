/**
 * Built-in enum definitions — constant map of enum name → member name → string value.
 * Single source of truth for both evaluators (the annotated evaluator's former
 * hand-copied subset had drifted: BBoxAnchor, GridPatternType, HexagonOrientation,
 * VerticalAnchor, NoiseFilterStyle, NoiseFilterScale, GlowMode, MotionBlurType,
 * and BlendMode were missing there, so e.g. `BlendMode.Multiply` failed to
 * resolve in annotated mode).
 */
import { easingEnumMembers } from '../stdlib/easing-curves';

export const BUILTIN_ENUMS: Record<string, Record<string, string>> = {
  // Linear, Smoothstep, EaseIn, EaseOut, EaseInOut, then SineIn … BounceInOut —
  // derived from the curve table so the enum, ease(), and the gradient
  // renderers cannot disagree about which curves exist.
  Easing: easingEnumMembers(),
  Interpolation: { SRGB: 'srgb', OKLCH: 'oklch', LinearRGB: 'linearRGB' },
  SpreadMethod: { Pad: 'pad', Reflect: 'reflect', Repeat: 'repeat' },
  GradientUnits: { ObjectBoundingBox: 'objectBoundingBox', UserSpaceOnUse: 'userSpaceOnUse' },
  Direction: { CW: 'cw', CCW: 'ccw' },
  CurveContinuity: { G0: 'position', G1: 'tangent', G2: 'curvature' },
  ConicSpread: { Clamp: 'clamp', Repeat: 'repeat', Transparent: 'transparent' },
  InnerFill: { Transparent: 'transparent', TransparentBlend: 'transparent-blend', Center: 'center' },
  TopoMethod: { Distance: 'distance', Laplace: 'laplace' },
  BBoxAnchor: {
    TopLeft: 'top-left',
    Top: 'top',
    TopRight: 'top-right',
    Right: 'right',
    BottomRight: 'bottom-right',
    Bottom: 'bottom',
    BottomLeft: 'bottom-left',
    Left: 'left',
    Center: 'center',
  },
  GridPatternType: { Shape: 'shape', Dot: 'dot', Intersection: 'intersection', Partial: 'partial' },
  HexagonOrientation: { Edge: 'edge', Vertex: 'vertex' },
  VerticalAnchor: { Descender: 'descender', Baseline: 'baseline', Midline: 'midline', CapHeight: 'cap-height' },
  MarkerUnits: { StrokeWidth: 'strokeWidth', UserSpaceOnUse: 'userSpaceOnUse' },
  MarkerOrient: { Auto: 'auto', AutoStartReverse: 'auto-start-reverse' },
  MarkerRefX: { Left: 'left', Center: 'center', Right: 'right' },
  MarkerRefY: { Top: 'top', Center: 'center', Bottom: 'bottom' },
  NoiseFilterStyle: {
    Grain: 'grain',
    Paper: 'paper',
    Speckle: 'speckle',
    Static: 'static',
    Gradient: 'gradient',
  },
  NoiseFilterScale: {
    Fine: 'fine',
    Medium: 'medium',
    Coarse: 'coarse',
  },
  GlowMode: {
    Outer: 'outer',
    Inner: 'inner',
  },
  MotionBlurType: {
    Linear: 'linear',
    Progressive: 'progressive',
  },
  BlendMode: {
    Normal: 'normal',
    Multiply: 'multiply',
    Screen: 'screen',
    Overlay: 'overlay',
    ColorBurn: 'color-burn',
    ColorDodge: 'color-dodge',
    HardLight: 'hard-light',
    SoftLight: 'soft-light',
    Darken: 'darken',
    Lighten: 'lighten',
    Difference: 'difference',
    Exclusion: 'exclusion',
  },
  MarkerPreserveAspectRatio: {
    None: 'none',
    XMinYMinMeet: 'xMinYMin meet',
    XMinYMinSlice: 'xMinYMin slice',
    XMidYMinMeet: 'xMidYMin meet',
    XMidYMinSlice: 'xMidYMin slice',
    XMaxYMinMeet: 'xMaxYMin meet',
    XMaxYMinSlice: 'xMaxYMin slice',
    XMinYMidMeet: 'xMinYMid meet',
    XMinYMidSlice: 'xMinYMid slice',
    XMidYMidMeet: 'xMidYMid meet',
    XMidYMidSlice: 'xMidYMid slice',
    XMaxYMidMeet: 'xMaxYMid meet',
    XMaxYMidSlice: 'xMaxYMid slice',
    XMinYMaxMeet: 'xMinYMax meet',
    XMinYMaxSlice: 'xMinYMax slice',
    XMidYMaxMeet: 'xMidYMax meet',
    XMidYMaxSlice: 'xMidYMax slice',
    XMaxYMaxMeet: 'xMaxYMax meet',
    XMaxYMaxSlice: 'xMaxYMax slice',
  },
};
