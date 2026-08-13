#!/usr/bin/env python3
"""
trim_silence.py — cut the quiet air off the front (and optionally the back)
of game audio files, so footsteps and effects fire instantly.

Why: leading silence in a step sound plays as perceived input lag, because
step sounds are synced to the visible foot-plant.

Usage (from the folder that CONTAINS your audio category folders):

    python trim_silence.py --dry-run          # see what WOULD be trimmed
    python trim_silence.py                    # trim heads, backups kept
    python trim_silence.py --tail             # also trim trailing silence
    python trim_silence.py --root path/to/audio --threshold -42

Defaults: threshold -45 dBFS (anything quieter counts as silence),
8 ms of pre-roll kept so attacks don't click, originals backed up to
_originals/ next to each file the first time it's touched.

Requires: pip install pydub   — and ffmpeg on your PATH
(Windows: winget install ffmpeg   then reopen the terminal).
"""

import argparse
import shutil
import sys
from pathlib import Path

try:
    from pydub import AudioSegment
    from pydub.silence import detect_leading_silence
except ImportError:
    sys.exit(
        "pydub is not installed.\n"
        "  pip install pydub\n"
        "Also make sure ffmpeg is on your PATH (Windows: winget install ffmpeg)."
    )

AUDIO_EXTS = {".mp3", ".ogg", ".wav"}
BACKUP_DIR_NAME = "_originals"


def trim_segment(seg: AudioSegment, threshold_dbfs: float, pad_ms: int, tail: bool):
    """Return (trimmed_segment, head_ms_removed, tail_ms_removed)."""
    head = detect_leading_silence(seg, silence_threshold=threshold_dbfs, chunk_size=1)
    head = max(0, head - pad_ms)

    end = len(seg)
    tail_removed = 0
    if tail:
        rev = detect_leading_silence(
            seg.reverse(), silence_threshold=threshold_dbfs, chunk_size=1
        )
        tail_removed = max(0, rev - pad_ms)
        end = len(seg) - tail_removed

    if head >= end:  # whole file under threshold — leave it alone
        return seg, 0, 0
    return seg[head:end], head, tail_removed


def export_in_place(seg: AudioSegment, path: Path):
    fmt = path.suffix.lstrip(".").lower()
    kwargs = {"bitrate": "192k"} if fmt == "mp3" else {}
    seg.export(path, format=fmt, **kwargs)


def main():
    ap = argparse.ArgumentParser(description="Trim leading silence from audio files.")
    ap.add_argument("--root", default=".", help="folder to scan (recursive)")
    ap.add_argument("--threshold", type=float, default=-45.0,
                    help="silence threshold in dBFS (default -45; raise toward -35 to trim more aggressively)")
    ap.add_argument("--pad", type=int, default=8,
                    help="milliseconds of pre-roll to keep before the first sound (default 8)")
    ap.add_argument("--tail", action="store_true", help="also trim trailing silence")
    ap.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    ap.add_argument("--no-backup", action="store_true",
                    help="skip the _originals backup (not recommended)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        sys.exit(f"Root folder not found: {root}")

    files = sorted(
        p for p in root.rglob("*")
        if p.suffix.lower() in AUDIO_EXTS and BACKUP_DIR_NAME not in p.parts
    )
    if not files:
        sys.exit(f"No audio files found under {root}")

    print(f"{'DRY RUN — ' if args.dry_run else ''}scanning {len(files)} files "
          f"under {root} (threshold {args.threshold} dBFS, pad {args.pad} ms)\n")

    touched = 0
    total_head = 0
    for path in files:
        try:
            seg = AudioSegment.from_file(path)
        except Exception as e:  # unreadable file — report and move on
            print(f"  SKIP (decode failed): {path.name}  [{e}]")
            continue

        trimmed, head, tail_removed = trim_segment(seg, args.threshold, args.pad, args.tail)
        if head == 0 and tail_removed == 0:
            continue

        touched += 1
        total_head += head
        note = f"-{head} ms head" + (f", -{tail_removed} ms tail" if tail_removed else "")
        print(f"  {path.relative_to(root)}: {note}")

        if args.dry_run:
            continue

        if not args.no_backup:
            backup_dir = path.parent / BACKUP_DIR_NAME
            backup_dir.mkdir(exist_ok=True)
            backup = backup_dir / path.name
            if not backup.exists():  # keep the FIRST original only
                shutil.copy2(path, backup)

        export_in_place(trimmed, path)

    verb = "would be trimmed" if args.dry_run else "trimmed"
    print(f"\nDone: {touched} of {len(files)} files {verb} "
          f"({total_head} ms of leading silence total).")
    if not args.dry_run and not args.no_backup and touched:
        print(f"Originals saved in {BACKUP_DIR_NAME}/ folders next to each file.")


if __name__ == "__main__":
    main()
