#!/usr/bin/env python3
"""Format the raw ROW| lines produced by run-probes.sh into the audit matrix.

Reads one raw file (argv[1]) of `ROW|receiver|method|startPoint|d` lines.
"""
import sys

rows = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line.startswith('ROW|'):
        continue
    _, rid, label, start, d = line.split('|', 4)
    rows.append((rid, label, start, d))

# The receiver's own first inked point. A result still expressed in the receiver's
# frame keeps coordinates of that magnitude even when the geometry legitimately
# moves (offset steps out by d, fillet trims the corner, scale multiplies). A
# result that was RE-BASED reports (0,0) regardless of the receiver.
RECV = {'block': 'Point(40, 25)', 'projected': 'Point(200, 300)'}

# Methods whose whole purpose is to change the value's kind.
BY_DESIGN = {'draw', 'drawTo', 'project', 'toPathBlock'}

EXPECTED = {'block': 'PathBlock', 'projected': 'ProjectedPath'}


def classify(rid, start, d):
    if start == 'THREW':
        return 'n/a', 'throws', d[:58]
    kind = 'ProjectedPath' if d[:2] == 'M ' else 'PathBlock'
    if start == 'Point(0, 0)':
        place = 'RE-BASED to (0,0)'
    elif start == RECV[rid]:
        place = "receiver's frame"
    else:
        place = "receiver's frame *"
    return kind, place, start


print('| receiver  | method               | result type   | placement          | flip? | startPoint |')
print('|-----------|----------------------|---------------|--------------------|-------|------------|')
for rid, label, start, d in rows:
    kind, place, shown = classify(rid, start, d)
    flip = ''
    if kind != 'n/a' and kind != EXPECTED[rid]:
        flip = 'by design' if label in BY_DESIGN else 'YES'
    print(f'| {rid:9} | {label:20} | {kind:13} | {place:18} | {flip:5} | {shown} |')

print()
print("* the geometry moved inside the receiver's frame (offset steps out, fillet trims,")
print("  scale multiplies) — the frame itself was kept. Only (0,0) means re-based.")
