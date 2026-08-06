// Methods whose callback may be applied with the `<<` worker operator
// (arr.map() << f). Single source of truth, imported by both evaluators
// (src/evaluator/index.ts, src/evaluator/annotated.ts) and the
// language-services typing bridge.
//
// INVARIANT: any method with one of these names, on any receiver, becomes
// <<-interceptable when written without a trailing block. Adding a method
// with one of these names to a new receiver type makes `recv.method() << f`
// dispatch into that method with the worker attached — the method must
// consume it via resolveCallbackBlock or reject it.
export const CALLBACK_METHODS: ReadonlySet<string> = new Set([
  'map', 'filter', 'reduce', 'sort', // array (map also Grid)
  'fill', 'forEach', // Grid
  'variableOffset', 'compoundVariableOffset', // PathBlock
]);
