---
title: "Say It Once: switch and case Come to Pathogen"
slug: switch-case-comes-to-pathogen
date: 2026-09-06
description: "Pathogen has a switch statement. It borrows the keyword from JavaScript, the pattern matching from Swift, and the range cases from Ruby, then drops fallthrough. Values, ranges over numbers and angles, destructured Points and arrays, where guards, and an expression form that drops straight into a let or a path argument."
---

> **Prerequisites:** the samples lean on [enums](/docs#syntax-enums),
> [`let` destructuring](/docs#syntax-destructuring), and
> [`layer().apply`](/docs#layers-writing-to-layers) without introducing them.
> If those are new, the linked docs sections are short.

Every drawing program has a moment where one value decides several
things. A marker kind picks a shape. An angle picks a quadrant. A score
picks a label and a bar width. Until now, Pathogen spelled that moment as
an `if` / `else if` chain that names the value on every branch. Now it
has a `switch`:

```pathogen
switch (marker) {
  case "dot", "bullet" {
    circle(cx, cy, 6);
  }
  case "ring" {
    circle(cx, cy, 10);
    circle(cx, cy, 5);
  }
  default {
    rect(cx - 6, cy - 6, 12, 12);
  }
}
```

The value in parentheses is evaluated once. Cases are tried in order, the
first one that matches runs its body, and the switch ends. There is no
fallthrough, so there is no `break` to remember. That much will look
familiar from JavaScript. The rest of this post is about what a case can
be, because that is where Pathogen's version stops looking like
JavaScript's.

## The chain it replaces

Here is the shape of code this feature exists for. Two rows of markers,
and the marker kind is compared up to three times per marker:

<mini-workspace src="samples/post50/01-else-if-chain.pathogen" caption="Two rows of markers drawn by an if / else if chain. Every branch repeats the comparison against kind, and a reader has to check each one to be sure they all compare the same thing." code-open></mini-workspace>

The same drawing with a switch. The value is named once and the enum
members read as a list:

<mini-workspace src="samples/post50/02-switch-on-values.pathogen" caption="The same markers, dispatched by switch. One case each for Dot, Ring, and Box; Spark names no case and falls to default. The render is identical to the chain above." code-open></mini-workspace>

A case pattern can be any expression: a number, a string, an enum member,
a variable, or arithmetic like `case cols - 1`. The match uses the same
rules as `==`, with one difference worth stating early: a value that `==`
cannot compare, such as a Point against a number, is simply not a match.
It falls through to the next case or to `default` instead of raising an
error. Several patterns separated by commas share one body, and a
switch with no `default` simply does nothing when nothing matches; the
second switch in the next sample relies on exactly that.

## Ranges, including angles

This is the case that a drawing language needs most, and the one that
comes from Ruby rather than JavaScript. A range pattern buckets a
continuous value. `0..10` matches 0 through 10 inclusive, the same
spelling `for` loops use. `0..<10` is half-open, which means it excludes
the upper bound, so two adjacent bands never both claim the number on
their shared boundary. Leave off a bound and the range is open-ended:
`..<0` is everything below zero, `100..` is everything from 100 up.

Ranges work over angles too, using the same comparison as `<` and `<=`,
so a quadrant test is one line per quadrant:

<mini-workspace src="samples/post50/03-ranges-and-angles.pathogen" caption="Twenty-four spokes. Each spoke's length comes from a switch over its heading with half-open angle ranges, so 90deg belongs to exactly one quadrant. The dot at each tip is sized by a second switch over the spoke index, mixing an inclusive range, a half-open one, and two open-ended ones." code-open></mini-workspace>

One rule to know: a range pattern always reads low to high. `case 5..<0`
matches nothing, while the same range in a `for` loop counts down. And
the half-open spelling is now accepted by `for` loops as well, so
`for (i in 0..<points.length)` visits every index exactly once without
the off-by-one arithmetic.

## Shapes, bindings, and guards

The pattern that comes from Swift. A destructuring pattern tests a
value's shape and binds its parts for the body. `case {x, y}` matches any
object or struct with those properties, a `Point` included, and makes `x`
and `y` available inside the case. `case [first, second]` matches an
array of exactly that length; add `...rest` to accept longer ones.

A `where` guard narrows a match after the bindings exist. When the guard
is false the whole case is skipped and matching moves on, which is how
the second `{x, y}` case below catches everything the first one turned
down:

<mini-workspace src="samples/post50/04-destructuring-and-guards.pathogen" caption="Five values in one array: three Points and two plain arrays. Points above the diagonal get a ring, points on or below it a box, and the arrays dispatch on their length. Nothing here compares with ==; every case is a shape test." code-open></mini-workspace>

Bindings live only inside their case body. A bare name in a pattern is
always the variable's current value, never a new binding, so
`case limit` compares against `limit` rather than capturing it. And
because array and object literals in a pattern are read as shapes,
`case [1, 2]` is a compile error rather than a value to compare against;
to match on contents, bind them and test in a guard.

## A switch that is a value

Pathogen is an expression-first language, and a switch that could only
run statements would leave the most common use on the table: picking a
number. So a switch can also produce a value. Put one expression inside
each pair of braces, end with `default`, and use the whole thing wherever
an expression goes:

```pathogen
let radius = switch (level) {
  case 1, 2 { 4 }
  case 3..<7 { 8 }
  default { 12 }
};
```

Only the chosen arm's expression runs. `default` is required because the
expression must always produce something. It works on the right of
`let`, in function arguments, inside a backtick template's `${ }`, and
inside `calc()`, which is also how it goes into a path command's
arguments:

<mini-workspace src="samples/post50/05-switch-expressions.pathogen" caption="The size and the vertical lift of each marker are switch expressions dropped into a let; the shape itself is a switch statement. The underline's right end is a switch inside calc() in a path argument, so the box gets a wider bar without a separate branch." code-open></mini-workspace>

## Inside text

A switch works inside `text(x, y) { }` bodies too, where the case bodies
hold text items instead of path commands. That lets a label and the
geometry beside it come from the same value with the same ranges:

<mini-workspace src="samples/post50/06-switch-in-text.pathogen" caption="Four scores, shown in the labels. Inside each text body a switch picks the tspan word; outside it a switch expression picks the bar width. The two switches share the 40 and 75 boundaries, so the word and the bar can never disagree." code-open></mini-workspace>

## The fine print

The sharp edges, stated plainly:

- **A `break;` inside a case is not harmless.** There is no fallthrough to
  stop, and `break` always means the enclosing loop. Inside a loop it
  exits that loop; outside one it fails to compile. `continue` behaves the
  same way. This is the JavaScript habit most worth unlearning.
- **`switch`, `case`, and `where` are reserved words** and can no longer be
  used as variable names. No published sample used them, but a private
  file might.
- **A range never matches a non-numeric value.** A string or a Point
  against `case 0..10` is a non-match, not an error. Booleans count as
  numeric. The bounds themselves must be numeric, and a non-numeric bound
  is a runtime error.
- **A guard runs once per case, not once per pattern.** With comma
  alternatives, `where` is checked against the bindings of the first
  pattern that matched, and a false result does not send the switch back
  to try the rest. Every alternative in such a case must bind the same
  names, or the program fails to parse.
- **Two places cannot hold a switch expression directly.** A style value's
  `${ }` allows one level of braces, and a bare path argument outside
  `calc()` accepts only simple values. In both, compute the value with
  `let` first.
- **A statement-position `switch` is always the statement form.** Add a
  trailing `;` and the parser reads it as a switch *expression* instead,
  which means `default` becomes mandatory and each arm may hold only one
  expression, so a body of path commands stops parsing.

## When to reach for it

Reach for `switch` when one value decides the branch. If your `else if`
chain compares the same thing on every line, that is the signal. If the
branches compare different things, keep the chain. And if the decision
is a number or a string rather than a set of statements, use the
expression form and let the value land where it is needed.

The full reference is in the [Switch Statements docs](/docs#syntax-switch-statements),
the expression form under [Switch Expressions](/docs#syntax-switch-expressions),
and the loop side of the new range spelling under
[Half-Open Ranges](/docs#syntax-half-open-ranges). Every sample on this
page is live: open the code pane, change a kind or a score, and watch the
right case take over.

The value was always the thing being decided. Now the code says so once.
