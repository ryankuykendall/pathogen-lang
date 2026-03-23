# Chained Bezier Curves

The beauty of Bezier curves is that they provide a way of seamlessly connecting the curves together through a potenetially shared tangent at curve start and end points. The trickiest part of this connection is ensuring that the exit out of one curve and the entry into the next curve have their control points on the same line.

With this in mind, we could make it much easier for users to create chained bezier curves by simply removing the calculation they have to do to place their control points on the same line. 

Conceptually, all of the following methods use the same framing

  start point >> exiting tangent line (extl) >> entering tangent line (entl) >> point >> extl >> entl >> point (0 or many) >> extl >> entl >> end point

If we provided them the following interface (NOTE: All points would be considered relative in order for chained bezier methods to work within PathBlocks):

  chainedCubicBezierCurve(Array<ChainedCubicBezierPoint>): Array<RelativePathCommands>

...where:

interface ChainedCubicBezierPoint {
  point: Point; //-- start point and/or end point for cubic bezier curve
  angle: Angle; //-- polar angle of exit to the first control point
  exit?: number;  //-- polar distance from point to the exit control point;
                  //-- This should be the distance along a line at the declared angle.
                  //-- exit must be a positive number.
                  //-- exit must be omitted (null) if this is the last point in the chained array.
  entry?: number; //-- polar distance to point from the approaching control point;
                  //-- This should be the distance along a line at the declared angle.
                  //-- entry must be a negative number.
                  //-- Should be omitted (null) if this is the first item in an 
                  //-- Array<ChainedCubicBezierPoint>
}

_exit_ is the distance to the control point after leaving the point. It is always expected to be a positive number
_entry_ is the appoaching distance to the point. It is always expected to be a negative number.

We should also be providing a complentary chained function for quadratic beziers:

  chainedQuadraticBezierCurve(
    start: ChainedQuadraticBezierStartPoint,
    points: Array<PointExit>
    end: Point): Array<RelativePathCommands>

interface PointExit extends Point {
  exit: number; //-- Distance exiting the point on the line defined by the given angle.
  //-- NOTE: This angle will be determined by a line defined by the last shared control
  //--   point and the point. The exit is the distance extension of that line.
}

interface ChainedQuadraticBezierStartPoint extends Point {
  angle: Angle;
}

interface ChainedQuadraticBezierStartPoint extends ChainedQuadraticBezierPoint {
  exit: number; 
}

A third version of this chained style bezier curve would be to anchor on the lines that connect the start and end points to the control point, but allow the user to specify an exit time and/or an entry time as a percentage of these control line lengths. This would permit the user some degree of control to dampen the eccentricity of the curves.

  chainedClippedQuadraticBezierCurve(
    start: TimedQuadraticBezierStartPoint,
    points: Array<TimedQuadraticBezierPoint>
    end: TimedQuadraticBezierEndPoint): Array<RelativePathCommands>

interface TimedQuadraticBezierStartPoint extends ChainedQuadraticBezierStartPoint {
  exitTime: number; //-- Float between 0 and 1 representing the percentage of the distance from the point to the exit control point.
}

interface TimedQuadraticBezierPoint extends PointExit {
  exitTime: number; //-- Float between 0 and 1 representing the percentage of the distance from the point to the exit control point.
  entryTime: number: //-- Float between 0 and 1 representing the percentage of the distance from the point to the entry control point.
}

I would like to approach the planning and implementation of this feature in multiple phases. Initially I would like for us to try to implement these functions by employing our APIs in the Pathogen Language. Then, once we have verified that this is the direction that we would like to take, we can add support for these functions to the compiler.

Please provide a feedback, critique, suggestions, and recommendations for this project. Please ask me any questions that might identify and resolve any ambiguity around what we are trying to create here. In addition, I would be happy to consider other names and conventions if you know of similar capabilities in other languages or systems.