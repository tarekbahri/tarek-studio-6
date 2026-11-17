#!/usr/bin/env python3
"""
Configures the generated Capacitor Android project with:
1. TAREK AndroidManifest.xml (landscape, mic, audio media access, hardware acceleration)
2. TAREK MainActivity.java (WebView AUDIO_CAPTURE grant, runtime mic/storage permissions, immersive fullscreen)
3. All Android launcher icon densities + adaptive icon #090503 background
4. Android landscape & portrait dark splash screens
"""

import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
ANDROID_APP = ROOT / "android" / "app"
RES = ANDROID_APP / "src" / "main" / "res"
PUBLIC = ROOT / "public"


def patch_manifest() -> None:
    tpl = (ROOT / "android" / "AndroidManifest.tarek.template.xml").read_text(encoding="utf-8")
    # AGP 8+ forbids package="..." inside AndroidManifest.xml (uses namespace in build.gradle)
    tpl = re.sub(r'\s+package="com\.tarek\.studio"', "", tpl)
    dest = ANDROID_APP / "src" / "main" / "AndroidManifest.xml"
    dest.write_text(tpl, encoding="utf-8")
    print("[TAREK Android] Updated AndroidManifest.xml")


def patch_main_activity() -> None:
    java_dir = ANDROID_APP / "src" / "main" / "java"
    matches = list(java_dir.rglob("MainActivity.java"))
    if not matches:
        raise FileNotFoundError("Could not find Capacitor MainActivity.java")
    target = matches[0]
    src_java = (ROOT / "android" / "MainActivity.tarek.java").read_text(encoding="utf-8")
    target.write_text(src_java, encoding="utf-8")
    print(f"[TAREK Android] Patched {target}")


def patch_icons_and_splash() -> None:
    try:
        from PIL import Image, ImageOps
    except ImportError:
        print("[TAREK Android] Pillow not installed; copying raw 512px PNGs")
        shutil.copy2(PUBLIC / "pwa-512x512.png", RES / "mipmap-xxxhdpi" / "ic_launcher.png")
        shutil.copy2(PUBLIC / "pwa-512x512.png", RES / "mipmap-xxxhdpi" / "ic_launcher_round.png")
        return

    icon_any = Image.open(PUBLIC / "pwa-512x512.png").convert("RGBA")
    maskable_path = PUBLIC / "pwa-maskable-512x512.png"
    icon_fg = (
        Image.open(maskable_path).convert("RGBA")
        if maskable_path.exists()
        else icon_any
    )

    densities = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }

    for density, (launcher_px, fg_px) in densities.items():
        mip_dir = RES / f"mipmap-{density}"
        mip_dir.mkdir(parents=True, exist_ok=True)
        resized = icon_any.resize((launcher_px, launcher_px), Image.Resampling.LANCZOS)
        resized.save(mip_dir / "ic_launcher.png")
        resized.save(mip_dir / "ic_launcher_round.png")

        fg_resized = icon_fg.resize((fg_px, fg_px), Image.Resampling.LANCZOS)
        fg_resized.save(mip_dir / "ic_launcher_foreground.png")

    # Set #090503 adaptive icon background
    values_dir = RES / "values"
    values_dir.mkdir(parents=True, exist_ok=True)
    bg_xml = values_dir / "ic_launcher_background.xml"
    bg_xml.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <color name="ic_launcher_background">#090503</color>\n'
        '</resources>\n',
        encoding="utf-8",
    )

    # Generate dark studio splash screens (#090503 with centered TAREK logo)
    splash_sizes = {
        "drawable": (1280, 720),
        "drawable-land-mdpi": (480, 320),
        "drawable-land-hdpi": (800, 480),
        "drawable-land-xhdpi": (1280, 720),
        "drawable-land-xxhdpi": (1600, 960),
        "drawable-land-xxxhdpi": (1920, 1280),
        "drawable-port-mdpi": (320, 480),
        "drawable-port-hdpi": (480, 800),
        "drawable-port-xhdpi": (720, 1280),
        "drawable-port-xxhdpi": (960, 1600),
    }

    bg_color = (9, 5, 3, 255)
    for folder, (w, h) in splash_sizes.items():
        out_dir = RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        canvas = Image.new("RGBA", (w, h), bg_color)
        emblem_size = int(min(w, h) * 0.36)
        emblem = ImageOps.contain(icon_any, (emblem_size, emblem_size), Image.Resampling.LANCZOS)
        x = (w - emblem.width) // 2
        y = (h - emblem.height) // 2
        canvas.alpha_composite(emblem, (x, y))
        canvas.convert("RGB").save(out_dir / "splash.png")

    print("[TAREK Android] Generated all launcher icons, adaptive foreground, and splash screens")


if __name__ == "__main__":
    patch_manifest()
    patch_main_activity()
    patch_icons_and_splash()
