#!/usr/bin/env python3
"""
Builds /public/tarek-complete-source.zip containing the complete TAREK source code,
assets, audio engines, DSP worklets, Android Capacitor templates, and GitHub Actions
APK workflow — excluding generated caches, node_modules, and the zip file itself.
"""

import os
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_ZIP = ROOT / "public" / "tarek-complete-source.zip"

EXCLUDE_DIRS = {
    "node_modules",
    "dist",
    "dev-dist",
    ".git",
    ".aistudio",
    "build",
    "coverage",
    "__pycache__",
}

EXCLUDE_FILES = {
    "tarek-complete-source.zip",
    ".DS_Store",
}


def should_include(path: pathlib.Path) -> bool:
    rel = path.relative_to(ROOT)
    for part in rel.parts[:-1]:
        if part in EXCLUDE_DIRS:
            return False
    # Skip AI Studio temp reference screenshots inside public/assets/aistudio
    if "aistudio" in rel.parts:
        return False
    if path.name in EXCLUDE_FILES or path.name.endswith(".log"):
        return False
    return True


def main() -> None:
    OUT_ZIP.parent.mkdir(parents=True, exist_ok=True)
    if OUT_ZIP.exists():
        OUT_ZIP.unlink()

    files_added = 0
    with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dp = pathlib.Path(dirpath)
            rel_dir = dp.relative_to(ROOT)
            # Prune excluded directories in-place
            dirnames[:] = sorted(
                d for d in dirnames
                if d not in EXCLUDE_DIRS and not (rel_dir.parts == ("public", "assets") and d == "aistudio")
            )
            for fname in sorted(filenames):
                fpath = dp / fname
                if not should_include(fpath):
                    continue
                arcname = fpath.relative_to(ROOT).as_posix()
                zf.write(fpath, arcname)
                files_added += 1

    size_kb = OUT_ZIP.stat().st_size / 1024.0
    print(f"Created {OUT_ZIP} ({files_added} files, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
