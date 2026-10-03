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
RECV = {'block': 'Point(40, 25)', 'flat': 'Point(0, 0)', 'projected': 'Point(200, 300)'}

# Methods whose whole purpose is to change the value's kind.
BY_DESIGN = {'draw', 'drawTo', 'project', 'toPathBlock'}

EXPECTED = {'block': 'PathBlock', 'flat': 'PathBlock', 'projected': 'ProjectedPath',
            'text': 'ProjectedText', 'projectedText': 'ProjectedText'}

# Text rows (V9). Every text producer returns a ProjectedText by design; what varies is
# whether `origin` is the cumulative translation. The row carries `origin` in the start
# column and `drift=dx,dy` (boundingBox − local boundingBox − origin) in the d column.
TEXT = {'text', 'projectedText'}


def classify_text(start, d):
    if start == 'THREW':
        return 'n/a', 'throws', d[:58]
    dx, dy = (float(v) for v in d.removeprefix('drift=').split(','))
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        place = 'origin cumulative'
    else:
        place = f'origin is a DELTA ({dx:g},{dy:g} off)'
    return 'ProjectedText', place, start


# Methods that move the value because the caller asked: the destination is an argument,
# so neither "re-based" nor "receiver's frame" describes them.
TRANSLATES = {'translateStartPointTo', 'translateCenterPointTo'}


def classify(rid, start, d, label=''):
    if rid in TEXT:
        return classify_text(start, d)
    if start == 'THREW':
        return 'n/a', 'throws', d[:58]
    kind = 'ProjectedPath' if d[:2] == 'M ' else 'PathBlock'
    if label in TRANSLATES:
        return kind, 'moved, as asked', start
    if start == 'Point(0, 0)':
        # A flat block's own first point IS (0,0), so re-basing is unobservable there.
        place = 'at (0,0) — n/a' if rid == 'flat' else 'RE-BASED to (0,0)'
    elif start == RECV[rid]:
        place = "receiver's frame"
    else:
        place = "receiver's frame *"
    return kind, place, start


print('| receiver      | method               | result type   | placement          | flip? | startPoint / origin |')
print('|---------------|----------------------|---------------|--------------------|-------|---------------------|')
for rid, label, start, d in rows:
    kind, place, shown = classify(rid, start, d, label)
    flip = ''
    if kind != 'n/a' and kind != EXPECTED[rid]:
        flip = 'by design' if label in BY_DESIGN else 'YES'
    print(f'| {rid:13} | {label:20} | {kind:13} | {place:18} | {flip:5} | {shown} |')

print()
print("* the geometry moved inside the receiver's frame (offset steps out, fillet trims,")
print("  scale multiplies) — the frame itself was kept. Only (0,0) means re-based.")
print("† text rows: the last column is `origin`; placement says whether it is the cumulative")
print("  translation (drift = boundingBox − local boundingBox − origin is zero) or a delta.")
