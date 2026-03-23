# Primer: Booleans and Enums as Language Design Decisions

## The Boolean Question Across Languages

The history of booleans in programming languages is really a story about **what the language designer thinks truthiness means** — and what they're willing to let the programmer get away with.

### The C Legacy: Booleans Are Just Numbers

C (1972) had no boolean type for 27 years. `0` was false, non-zero was true, and `if`, `while`, `&&`, `||` all operated on integers. This wasn't an oversight — it was a design philosophy. Dennis Ritchie saw booleans as a subset of integers, and adding a separate type would add complexity without enabling anything new. The hardware didn't distinguish them, so why should the language?

This worked because C programmers understood the contract. But it produced a class of bugs that haunted the language for decades: `if (x = 5)` (assignment, not comparison) was valid and always true. `if (flags & MASK)` worked but `if (flags & MASK == expected)` didn't (precedence). The lack of a boolean type meant the compiler couldn't help you distinguish "I'm testing a condition" from "I'm doing arithmetic."

When C99 finally added `_Bool` (and the `stdbool.h` macros `bool`, `true`, `false`), it was sugar — `true` was `1`, `false` was `0`, and `_Bool` was an integer type. The language couldn't afford to break 27 years of `if (count)` idioms.

### Python: Booleans Are Integers, On Purpose

Python didn't have booleans until version 2.3 (2003), eight years after its creation. [PEP 285](https://peps.python.org/pep-0285/) is one of the most instructive language design documents ever written about this question. Guido van Rossum chose to make `bool` a **subclass of `int`**:

```python
>>> isinstance(True, int)
True
>>> True + True
2
>>> True * 10
10
```

His rationale was explicit: vast amounts of existing Python code used `0`/`1` as booleans, and making `bool` a distinct type would break all of it. But more philosophically, he argued that booleans and integers exist on a **spectrum of generality** — a boolean is an integer that happens to be 0 or 1, just as an integer is a rational number that happens to have no fractional part.

What Python's booleans **enabled** that `0`/`1` didn't:

- **`repr()` clarity**: `True` prints as `True`, not `1`. This matters enormously for debugging and REPL exploration.
- **Intent signaling**: `def is_valid(x) -> bool` tells the caller something `-> int` can't.
- **Idiom crystallization**: `if items` (truthy test on a list) became the Pythonic way because `bool` formalized what "truthy" meant, even for non-boolean types.
- **Teaching**: Beginners learn that `==` returns `True`/`False`, which maps to English. Later they learn about truthiness. The boolean type creates a pedagogical on-ramp.

### Java: Booleans Are NOT Numbers

Java (1995) took the opposite stance from C. `boolean` is a completely separate type. `if (1)` is a compile error. `true + 1` is a compile error. There's no implicit conversion between boolean and any other type.

James Gosling designed this as an **explicit safety measure** — a reaction to decades of C bugs. The philosophy: if you mean a condition, write a condition. `if (x)` must fail if `x` is an integer; the programmer must write `if (x != 0)`.

What this enables: the compiler catches an entire class of bugs. What it costs: verbosity. Java programmers write `if (list.isEmpty())` instead of `if (!list)`, `if (count > 0)` instead of `if (count)`. Whether that verbosity is a feature or a tax depends on your perspective.

### Ruby: Only Two Things Are Falsy

Matz made the most radical choice: in Ruby, only `false` and `nil` are falsy. Everything else is truthy — including `0`, `""`, and `[]`.

```ruby
if 0
  puts "zero is truthy in Ruby"  # this prints!
end
```

The philosophy: truthiness should be about **existence**, not **content**. Zero exists. An empty string exists. They're not "nothing." Only `nil` (absence) and `false` (explicit negation) are falsy.

This enables a powerful idiom pattern:

```ruby
name = params[:name] || "Anonymous"    # nil-coalescing
cache[key] ||= expensive_compute(key)  # memoization
```

These work cleanly because `0` and `""` don't accidentally trigger the fallback. In JavaScript, `params.name || "Anonymous"` breaks if the name is `""` or `0` — a bug that led to the introduction of `??` (nullish coalescing).

### JavaScript: Maximum Coercion, Maximum Confusion

JavaScript has a distinct `boolean` type, but it also has the most aggressive implicit coercion of any mainstream language. Six values are falsy: `false`, `0`, `""`, `null`, `undefined`, `NaN`. Everything else — including `[]`, `{}`, and `"false"` — is truthy.

This design reflects Brendan Eich's 10-day creation constraint and the browser context: web forms produce strings, and you want `if (inputValue)` to do something reasonable. But the coercion rules are so complex they became interview folklore. The "truthy/falsy table" is a right of passage, not a teaching tool.

JavaScript's history illustrates the **cost of implicit truthiness** — it enables terse code but creates a category of bugs that are nearly impossible to reason about locally. The `===` operator (strict equality) and the `??` operator (nullish coalescing) were both introduced specifically to work around truthiness surprises.

### Swift and Rust: No Implicit Truthiness at All

The most modern statically-typed languages — Swift (2014) and Rust (2015) — reject implicit truthiness entirely. `if 1 {}` is a compile error in both. You must write `if x != 0 {}`.

Swift's Bool conforms to the `ExpressibleByBooleanLiteral` protocol, and only types conforming to it can appear in conditions. Rust's `bool` is a primitive with no implicit conversion to or from integers.

The philosophy: in a language with a strong type system, implicit truthiness is **actively harmful** because it weakens the types that the rest of the language is trying to enforce. If `if (x)` works for any type, you lose the information that the condition should be a boolean expression.

What this enables: the compiler becomes a much more effective bug-catcher. What it costs: you can't write `if let data = fetchData()` style optional-binding without dedicated syntax for it (Swift has `if let`, Rust has `if let` and `match`).

### Lua: Booleans Added Late, Zero Is Truthy

Lua 5.0 added `true`/`false` but kept the Ruby-like truthiness model: only `nil` and `false` are falsy. `0` is truthy. This is notable because Lua is embedded in game engines and systems where `0` frequently appears as a valid value (position, health, count), and treating it as falsy would cause bugs.

---

## What Booleans Enable in Pathogen

Setting aside implementation cost, here's what `true`/`false` would unlock for the language:

### 1. Intent Declaration

```pathogen
let visible = true;
let closed = true;
let clockwise = false;
let largeArc = true;
```

Each of these tells the reader "this is a binary toggle" — not a count, not an index, not a value that might be 2 or 3. With `let visible = 1`, the reader must infer from context that this is boolean. With `let visible = true`, the intent is the syntax.

### 2. Self-Documenting Arc Flags

SVG arc commands have two boolean flags — large-arc and sweep — that are notoriously hard to read:

```pathogen
// Current — which 1 is which?
A 50 50 0 1 0 200 100

// With boolean naming in variables
let largeArc = true;
let sweep = false;
A 50 50 0 largeArc sweep 200 100
```

This doesn't require `true`/`false` to exist (you can do `let largeArc = 1`), but booleans make the binary nature of these flags explicit.

### 3. Natural Toggle Patterns

```pathogen
let alternate = true;
for ([item, i] in items) {
  let style = if (alternate) ${ fill: #0066ff; } else ${ fill: #ff6600; };
  alternate = !alternate;
}
```

`!alternate` reads as "not alternate." `!1` reads as... negating the number one? Booleans give `!` its natural English meaning.

### 4. Foundation for Property Contracts

If Pathogen ever grows property accessors, visibility controls, or conditional layer rendering, booleans are the natural type:

```pathogen
// Hypothetical future features
layer.visible = false;
layer.interactive = true;
path.closed = true;
```

These read as English sentences. `layer.visible = 0` reads as... setting visibility to zero?

### 5. Teaching and Onboarding

Pathogen targets designers and SVG authors, not systems programmers. For this audience, `true`/`false` maps to how they think about binary state. `0`/`1` maps to how a computer stores it. The language should speak the user's language.

### 6. Display and Debugging

When `log(x > 5)` prints `true` instead of `1`, the output immediately communicates that a condition was tested, not that a calculation produced one. This is Python's insight — `repr()` clarity matters for the REPL/playground experience.

---

## The Design Spectrum for Pathogen

Given the language's current truthiness model (`null` and `0` are falsy, everything else truthy), there's a spectrum of how deep to make booleans:

**Level 1 — Display-only**: `true`/`false` are keywords that evaluate to `1`/`0`, but comparison operators and `log()` display results as `true`/`false` when they originate from a boolean context. This is essentially Python's approach: booleans are numbers with a nicer printer.

**Level 2 — Python model**: `true`/`false` are a semantic subtype of number. `true == 1` is true. `true + 1` is `2`. But `typeof(true)` (if you ever add it) returns `'boolean'`. Display always shows `true`/`false` for values that originated as booleans or comparison results.

**Level 3 — Java/Swift model**: `boolean` is a distinct type. `true + 1` is an error. `if (1)` is an error — you must write `if (1 != 0)`. Comparison operators return booleans, not numbers.

Level 3 is clearly wrong for Pathogen — it would break every existing program that uses `if (count)` or `if (visible)` where visible is `1`. Level 1 or 2 is the question, and it's mostly a question about **what `typeof` and arithmetic on booleans should do**, which can be deferred.

---

## The Enum Question Across Languages

### What Enums Actually Are

Enums exist on a spectrum from "named integers" to "algebraic data types":

**C/C++ enums**: Named integers. `enum Color { RED, GREEN, BLUE }` → `RED` is `0`, `GREEN` is `1`, `BLUE` is `2`. No type safety — you can assign any integer to an enum variable. C++11 added `enum class` for scoped, type-safe enums.

**Java enums**: Classes with a fixed set of instances. Each member can have fields, methods, and implement interfaces. `Planet.EARTH.surfaceGravity()`. Extremely powerful but heavy.

**TypeScript enums**: Two flavors — numeric (auto-incrementing integers) and string (explicit string values). Numeric enums have reverse mapping (`Color[0] === "RED"`). String enums don't. Both are essentially namespaced constants with some compiler support.

**Rust/Swift enums**: Algebraic data types. Each variant can carry associated data: `enum Shape { Circle(f64), Rect(f64, f64) }`. Combined with pattern matching, this is one of the most powerful features in both languages. Exhaustiveness checking means adding a new variant forces you to handle it everywhere.

**Python enums**: Classes inheriting from `enum.Enum`. Members are instances. Rich API (`Color.RED.name`, `Color.RED.value`, iteration). But added in 3.4, 13 years after the language — most Python code still uses string constants or module-level ALL_CAPS variables.

### What Enums Enable

**1. Closed sets.** An enum declares: "these are ALL the valid values." A string property can't make this claim — there's always the possibility of another valid string you haven't seen yet. Enums turn an open set into a closed one.

**2. Discoverability.** `Easing.` + autocomplete shows you every option. `'...'` + docs shows you nothing. For a playground-first language, this is significant — the editor becomes the documentation.

**3. Refactoring safety.** Rename `Easing.Smoothstep` to `Easing.SmoothStep` and every usage updates (with tooling). Rename the string `'smoothstep'` to `'smooth-step'` and you have silent runtime failures.

**4. Domain modeling vocabulary.** Enums let users name the concepts in their domain. A generative art program might define `enum Symmetry { None, Bilateral, Radial, Rotational }`. This isn't just a set of strings — it's a statement about the problem space.

**5. Pattern matching (future).** If Pathogen ever adds `match` expressions, enums are the natural companion. Without enums, `match` operates on strings or numbers, which can't provide exhaustiveness guarantees.

### What Enums Cost

**1. A second way to do everything.** If `topo.easing = 'smoothstep'` still works alongside `topo.easing = Easing.Smoothstep`, users must learn both, and code style diverges. If the old way is deprecated, it's a breaking change.

**2. Naming ceremony.** Every valid-value set needs a name, and the members need names that may differ from the string values they represent. `ease-in` → `EaseIn` is a mapping users must memorize.

**3. Import/scope complexity.** Where do enums live? If they're global, they pollute the namespace. If they need importing, the language needs an import system.

**4. Diminishing returns without static types.** The deepest value of enums — exhaustiveness checking, type-narrowing, compiler-enforced contracts — requires a type checker. Without one, enums are syntactic sugar for namespaced string constants. Still useful, but the cost/benefit ratio shifts.

---

## The Interaction Question

If you add booleans and enums both, an interesting design question emerges: **is a boolean a two-member enum?**

In Rust and Swift, the answer is essentially yes — `Bool` behaves like `enum Bool { True, False }` with special syntax support. In TypeScript, no — `boolean` and `enum` are unrelated features.

For Pathogen, the practical question is whether `true`/`false` should be members of an implicit `Bool` enum or standalone keywords. Standalone keywords are simpler and sufficient — the enum interpretation only matters if you need to iterate over boolean values or match on them exhaustively, which isn't a realistic Pathogen use case.
