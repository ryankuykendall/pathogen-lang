// Shared predicate for "this program produces different output on recompile".
// Drives the Refresh affordance in both the breadcrumb bar and the preview
// pane's fullscreen chrome — keep the two surfaces in sync by using this only.

export function usesRandomValues(calledStdlib: string[]): boolean {
  return calledStdlib.includes('random') || calledStdlib.includes('randomRange');
}
