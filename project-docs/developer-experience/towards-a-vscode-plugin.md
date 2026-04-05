I have created a programming language, and I want to create a plugin for the language for VSCode. What are the set of features I would need to add to the plugin to create a great developer experience for the users of my programming language? In addition, I would like for our investments here in developer experience improvements to be accessible to users of our playground experience.

Below we have a bit of a checklist for what would constitute a great developer experience for the Pathogen Language. Some of these things we already have, others we need to invest in. While there is a tremendous amount of work described here, I would like for us to come up with a multi-phase plan for working through it all. It's fine if it takes us 30 phases/iterations to get through all of the work catalogged here, so long as we can collaborate through each of the phases in order to achieve an outstanding developer experience.

For a great VS Code experience, think in **layers**:

1. **Make the language feel native**
2. **Make code understanding fast and trustworthy**
3. **Make common workflows effortless**
4. **Make the extension stable, configurable, and portable**

The best way to structure it is usually:

* a thin **VS Code extension** for editor integration
* a separate **language server** for language intelligence, using the Language Server Protocol, so you can potentially reuse it in other editors later. VS Code explicitly recommends this model for richer language features. ([Visual Studio Code][1])

## The feature set to prioritize

### 1. Syntax basics: the minimum needed to feel real

These are the first things users notice.

* syntax highlighting
* comment toggling
* bracket matching
* auto-closing and auto-surrounding pairs
* indentation rules
* folding
* word pattern behavior
* snippets for common constructs

VS Code supports these through language configuration, syntax highlighting, and snippets. The language configuration layer specifically covers comment toggling, brackets, autoclosing, autosurrounding, folding, word patterns, and indentation rules. ([Visual Studio Code][2])

**Why it matters:** even before semantic features exist, the language should already feel pleasant to type.

---

### 2. Diagnostics: precise errors, warnings, and fixes

This is the most important “real IDE” feature.

You want:

* parser errors with exact ranges
* type/checker errors
* warnings and lints
* related information for multi-location errors
* quick fixes attached to diagnostics

VS Code’s language feature model includes diagnostics and code actions, and LSP supports publishing diagnostics and code actions to fix them. ([Visual Studio Code][3])

**Bar for quality:**

* errors should appear quickly
* ranges should be exact
* messages should explain the cause, not just restate the rule
* fixes should be one click when possible

If you only do one advanced feature well, do this one.

---

### 3. Go to Definition and Find References

These are core navigation features.

Add:

* go to definition
* go to declaration if your language distinguishes it
* find references
* go to implementation for interfaces/traits/protocols
* type hierarchy or call hierarchy if the language model supports it

These are standard VS Code language features, and newer LSP versions also include things like type hierarchy. ([Visual Studio Code][3])

**Why it matters:** users stop trusting a language extension when navigation is flaky.

---

### 4. Autocomplete that is actually good

Completion should be context-aware, not just keyword dumping.

Include:

* keywords
* identifiers in scope
* members after `.` or equivalent
* imports/modules/packages
* function names and overload info
* snippet completions for control flow or declarations
* completion documentation and detail text
* lazy resolution for expensive completion details

VS Code and LSP support completion items, completion item resolution, and signature help. ([Visual Studio Code][3])

**What makes completion feel great:**

* rank by relevance, not alphabetically
* adapt to scope and expected type
* avoid noisy low-confidence suggestions
* commit characters and snippet insertion should feel natural

---

### 5. Hover and signature help

When users pause, the editor should answer the obvious question.

Add:

* symbol hover with type and docs
* hover for literals, operators, keywords, attributes, macros, etc.
* signature help while typing function calls
* parameter highlighting for the active argument

Both hover and signature help are standard language features in VS Code/LSP. ([Visual Studio Code][3])

**Good hover content:**

* first line: concise type or declaration
* second: short doc summary
* then: links or expanded docs if available

---

### 6. Rename and symbol-aware refactoring

A language feels mature when refactors are safe.

Start with:

* rename symbol
* prepare-rename validation
* file/module rename handling if your language needs import rewrites
* extract variable / extract function later
* organize imports
* remove unused imports
* fix all auto-fixable issues

Rename and code actions are first-class programmatic language features, and LSP also supports prepare rename. ([Visual Studio Code][3])

**Important:** only offer refactors when you are confident they are semantics-preserving.

---

### 7. Document symbols, workspace symbols, and outline support

These help users understand large codebases.

Add:

* document symbols for outline/breadcrumbs
* workspace symbols for searching types/functions/modules across the repo
* semantic grouping of classes, functions, constants, tests, etc.

These are standard VS Code language features exposed through the programmatic language APIs. ([Visual Studio Code][3])

---

### 8. Formatting

This is table stakes for adoption.

You ideally want:

* full-document formatting
* range formatting
* on-type formatting only if it is very reliable
* stable formatting with minimal diffs
* formatter settings users can trust

VS Code’s language feature set includes formatting, range formatting, and on-type formatting. ([Visual Studio Code][3])

**Strong recommendation:** if your language has an opinionated formatter, ship it or integrate it directly. Formatter inconsistency is a huge source of frustration.

---

### 9. Semantic highlighting

TextMate-style syntax highlighting is useful, but semantic tokens are what make coloring smarter.

Use semantic tokens for:

* variables vs parameters vs fields
* mutable vs readonly
* function vs method vs macro
* type vs interface vs enum vs trait
* deprecated symbols
* namespaces/modules

VS Code has a semantic highlight guide, and semantic tokens are part of the modern LSP feature set. ([Visual Studio Code][4])

**Why it matters:** code becomes easier to scan, especially in large files or languages with heavy inference.

---

### 10. Inlay hints

These are a major quality-of-life feature in modern editors.

Good uses:

* inferred types
* parameter names for positional arguments
* implicit conversions or lifetime/effect information
* return type hints where ambiguity is common

LSP 3.17 explicitly added inlay hints. ([Microsoft GitHub][5])

**Use sparingly:** hints should reduce cognitive load, not wallpaper the file.

---

### 11. Code actions and code lenses

These help users act directly from the editor.

Useful code actions:

* add missing imports
* qualify/unqualify symbol
* create missing function/type/module
* convert syntax forms
* apply safe quick fixes
* suppress/disable lint rule with proper syntax

Useful code lenses:

* run test
* debug test
* reference counts
* implementations count
* generated code actions

VS Code supports both code actions and code lenses as language features. ([Visual Studio Code][3])

---

### 12. Find all related structure: folding, selection ranges, linked editing

These are “small” features that make the editor feel polished.

Nice additions:

* folding ranges based on AST, not just indentation
* selection ranges that expand syntactically
* linked editing for paired constructs
* matching token navigation

Modern LSP versions include several of these richer structural features. ([Microsoft GitHub][5])

---

### 13. Workspace and build integration

This often matters more than fancy editor features.

Consider:

* detect project/workspace roots
* read project config files
* understand multi-package repos
* watch files efficiently
* show build/check/test tasks
* problem matchers if you have a CLI
* debugger support, if your language runtime allows it

VS Code extensions can contribute tasks/debuggers, while the language server can provide the semantic side. ([Visual Studio Code][6])

**For adoption, this is huge.** A language that can open a repo, infer the project layout, and immediately show correct diagnostics feels professional.

---

### 14. Embedded-language support, if your language needs it

If your language appears inside strings, templates, notebooks, or mixed documents, support that explicitly. VS Code documents approaches for embedded languages. ([Visual Studio Code][7])

Examples:

* SQL inside string literals
* HTML/CSS inside templates
* config DSL inside larger source files

---

## A practical priority order

If you want the shortest path to “this feels good”:

**Phase 1**

* syntax highlighting
* language configuration
* snippets
* diagnostics
* completion
* hover
* go to definition
* find references
* document symbols
* formatting

**Phase 2**

* rename
* code actions / quick fixes
* semantic tokens
* signature help
* workspace symbols
* folding from AST
* organize imports

**Phase 3**

* inlay hints
* code lens
* call hierarchy / type hierarchy / implementation
* advanced refactors
* debugger/test integration
* embedded-language support

That ordering aligns with the core VS Code language feature model and with what users tend to notice first. ([Visual Studio Code][3])

## Non-feature things that matter just as much

A great developer experience is not only about feature count.

### Performance

Your extension should:

* start fast
* avoid blocking the extension host
* debounce reparsing/checking
* support incremental analysis where possible
* handle large files and large workspaces gracefully

The language server architecture is specifically meant to separate language analysis from the VS Code extension host and improve reuse/performance characteristics. ([Visual Studio Code][1])

### Correctness

A smaller set of reliable features beats a large set of flaky ones.

### Good defaults, good settings

Let users configure:

* formatter behavior
* diagnostics severity or rule toggles
* inlay hint categories
* path/toolchain/runtime configuration
* project-root detection overrides

### Remote/web compatibility

If you care about Codespaces, remote dev, or browser-based use, design for that early. VS Code documents remote and web extension scenarios in its extension platform docs. ([Visual Studio Code][8])

### Testing

You want:

* parser fixture tests
* completion snapshot tests
* rename safety tests
* formatting golden tests
* large-workspace smoke tests

---

## My strongest recommendation

Build the extension around a **language server** and aim for this “golden set” first:

* syntax highlighting + language config
* diagnostics
* completion
* hover
* definition/references
* formatting
* rename
* code actions
* semantic tokens
* inlay hints

That combination gives users the feeling that your language is both **pleasant to type** and **safe to work in**. It is also well aligned with VS Code’s language extension architecture and the modern LSP feature set. ([Visual Studio Code][1])

A useful rule is:

* **parser features** make it usable
* **navigation features** make it productive
* **refactoring and fix features** make it lovable

I can also turn this into a concrete **roadmap/checklist for building your VS Code extension**, broken down by MVP, v1, and v2.

[1]: https://code.visualstudio.com/api/language-extensions/language-server-extension-guide?utm_source=chatgpt.com "Language Server Extension Guide"
[2]: https://code.visualstudio.com/api/language-extensions/language-configuration-guide?utm_source=chatgpt.com "Language Configuration Guide"
[3]: https://code.visualstudio.com/api/language-extensions/programmatic-language-features?utm_source=chatgpt.com "Programmatic Language Features"
[4]: https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide?utm_source=chatgpt.com "Syntax Highlight Guide | Visual Studio Code Extension API"
[5]: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/?utm_source=chatgpt.com "Language Server Protocol Specification - 3.17"
[6]: https://code.visualstudio.com/api/references/vscode-api?utm_source=chatgpt.com "VS Code API | Visual Studio Code Extension API"
[7]: https://code.visualstudio.com/api/language-extensions/embedded-languages?utm_source=chatgpt.com "Embedded Programming Languages"
[8]: https://code.visualstudio.com/api?utm_source=chatgpt.com "Visual Studio Code Extension API"
