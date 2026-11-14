// Where Cmd+click (Ctrl+click) on a name goes when its definition is in
// another file of the workspace (2d, step 7b; docs/workspace-files.md "Errors
// in other files"): that file, at its declaration. getDefinition gives other
// files as project paths (`/parts/gears.pathogen`); a click on an import's
// path, or a namespace's name, gives that file's top.

interface DefinitionLike {
  /** A project path, when the definition is in another file. */
  file?: string;
  range: { start: { line: number; character: number } };
}

/**
 * The file to open and where (1-based), or null when the definition is in
 * `openFile` itself, there's none, or its file isn't one the workspace holds
 * (`isFile`: a graph built before a delete). Null leaves the jump as it was:
 * within the file open.
 */
export function otherFileDefinition(
  definition: DefinitionLike | null | undefined,
  openFile: string | null,
  isFile: (path: string) => boolean = () => true,
): { path: string; line: number; column: number } | null {
  if (!definition?.file) return null;
  const path = definition.file.replace(/^\/+/, '');
  if (path === openFile || !isFile(path)) return null;
  return { path, line: definition.range.start.line + 1, column: definition.range.start.character + 1 };
}
