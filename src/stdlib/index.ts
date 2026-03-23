import { gridFunctions } from './grid';
import { mathFunctions } from './math';
import { pathFunctions } from './path';

export const stdlib = {
  ...mathFunctions,
  ...pathFunctions,
  ...gridFunctions,
};

/**
 * Functions that require path context and are evaluated specially.
 * These functions have access to the current position, tangent direction, etc.
 */
export const contextAwareFunctions = new Set([
  'polarPoint',
  'polarOffset',
  'polarMove',
  'polarLine',
  'arcFromCenter',
  'arcFromPolarOffset',
  'tangentLine',
  'tangentArc',
  'heading',
  'turn',
]);

export { mathFunctions } from './math';
export { pathFunctions } from './path';
