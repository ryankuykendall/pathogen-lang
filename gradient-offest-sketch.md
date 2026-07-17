## Objective

I would like to describe a new feature that would allow users to essentially trace a path defined in a PathBlock by using a gradient style syntax (using stops or compound stops) to define a sequence of offsets from the beginning of a path and one or two normal offsets at the chosen tangent point, to plot an unclosed or closed path based the point offsets on those normals. In addition, the user should be able to choose curve continuity in order to produce sharp or smooth intersections for that series of points. The gradient offset methods on PathBlocks return a new PathBlock with a path defined by the set stops and curvature preferences.

While PathBlock currently offers an offset() method, it only produces a uniform offset at a single fixed distance rather than allowing a user to specify offsets at variable distances from the source path.

Simple gradient offsets should generally produce a new unclosed PathBlock.

Compound gradient offsets can be used to create new closed PathBlocks, however the user has the option of creating the compound gradient offset without including a start or end definition which would result in an unclosed PathBlock comprised of unconnected paths.

## Workflows

Logical set of steps necessary to define a simple gradient offset from a PathBlock
1. Define an unclosed PathBlock
2. Initialize simple gradient offset (sgo) block
3. Define sgo starting point
4. Define sgo stops (repeated step)
5. Define sgo end point

Logical set of steps necessary to define a compound gradient offset from a PathBlock
1. Define an unclosed PathBlock
2. Initialize compound gradient offset (cgo) block
3. Define cgo starting point and EndCapStyle
4. Define cgo stops (repeated step)
5. Define cgo end point and EndCapStyle

## Interfaces

enum CurveContinuity {
  G0,
  G1,
  G2,
}

enum EndCapStyle {
  Linear = 'linear',
  SemiCircle = 'semi-circle',
  Elliptical = 'elliptical',
  Tapered = 'tapered',
}

let simpleGradientOffsetFromMyUnclosedPB = myUnclosedPB.simpleGradientOffset() {|go: SimpleGradientOffsetRef, pb: PathBlockRef|
  go.start(x: number, y: number);
  // Repeatable
  go.stop(time: number | Percent,
    normalOffset: number, curveContinuity: CurveContinuity);
  go.end(x: number, y: number);
}: PathBlockValue;

let compoundGradientOffsetFromMyUnclosedPB = myUnclosedPB.compoundGradientOffset() {|go: CompoundGradientOffsetRef, pb: PathBlockRef|
  // Optional starting definition
  go.start(x1: number, y1: number, x2: number, y2: number, endCapStyle: EndCapStyle);
  // Repeatable:
  go.stop(time: number | Percent,
    normalOffset1: number, curveContinuity1: CurveContinuity, 
    normalOffset2: number, curveContinuity2: CurveContinuity);
  // Optional end definition
  go.end(x1: number, y1: number, x2: number, y2: number, endCapStyle: EndCapStyle);
}: PathBlockValue;

## Examples

let myUnclosedPB = @{
  h 20
  tangentArc(20, 45deg);
  tangentLine(20);
  tangentArc(20, 45deg);
  v 20
};

let gradientOffsetFromMyUnclosedPB = myUnclosedPB.simpleGradientOffset() {|go, pb|
  go.stop(10%, 5, CurveContinuity.G1);
  go.stop(90%, 20, CurveContinuity.G1);
};

let myClosedPB = @{
  turn(60deg);
  tangentLine(20);
  turn(60deg);
  tangentLine(20);
  z
};

let gradientOffetFromMyClosedPB = myClosedPB.compoundGradientOffset() {|go, pb| 
  go.start(20, 20, EndCapStyle.SemiCircle);
  go.stop(10%, 5, CurveContinuity.G0, -10, CurveContinuity.G0);
  go.stop(20%, 5, CurveContinuity.G0, -10, CurveContinuity.G0);
  go.stop(50%, 10, CurveContinuity.G0, -5, CurveContinuity.G1);
  go.end(0, 0, EndCapStyle.Tapered);
}

