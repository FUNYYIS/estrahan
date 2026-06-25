from __future__ import annotations

import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

BASE_COMMIT = "f5acebaea979c1de3ffa883ce63c79d1584946a8"
ROOT = Path(__file__).resolve().parents[1]


def read_text(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write_text(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def old_binary(relative: str) -> bytes:
    return subprocess.check_output([
        "git",
        "show",
        f"{BASE_COMMIT}:{relative}",
    ], cwd=ROOT)


def zoom_icon(source: bytes, output: str, size: int, zoom: float = 0.06) -> None:
    with Image.open(io.BytesIO(source)).convert("RGBA") as image:
        width, height = image.size
        crop_x = round(width * zoom)
        crop_y = round(height * zoom)
        cropped = image.crop((crop_x, crop_y, width - crop_x, height - crop_y))
        resized = cropped.resize((size, size), Image.Resampling.LANCZOS)
        target = ROOT / output
        target.parent.mkdir(parents=True, exist_ok=True)
        resized.save(target, format="PNG", optimize=True)


old_192 = old_binary("assets/icons/icon-192.png")
old_512 = old_binary("assets/icons/icon-512.png")
zoom_icon(old_192, "assets/icons/icon-192-original-zoom.png", 192)
zoom_icon(old_512, "assets/icons/icon-512-original-zoom.png", 512)
zoom_icon(old_512, "assets/icons/apple-touch-icon-original-zoom.png", 180)

main_js = read_text("assets/js/main.js")
main_js = main_js.replace("const APP_ASSET_VERSION = '271';", "const APP_ASSET_VERSION = '272';")
write_text("assets/js/main.js", main_js)

index_html = read_text("index.html")
index_html = index_html.replace("?v=271", "?v=272")
index_html = index_html.replace(
    'rel="icon" href="assets/icons/icon-192.png"',
    'rel="icon" href="assets/icons/icon-192-original-zoom.png?v=272"',
)
index_html = index_html.replace(
    'rel="apple-touch-icon" sizes="180x180" href="assets/icons/apple-touch-icon.png?v=272"',
    'rel="apple-touch-icon" sizes="180x180" href="assets/icons/apple-touch-icon-original-zoom.png?v=272"',
)
if "assets/css/chat-composer-fix.css?v=272" not in index_html:
    index_html = index_html.replace(
        '    <link rel="stylesheet" href="assets/css/layout-theme-fix.css?v=272">',
        '    <link rel="stylesheet" href="assets/css/layout-theme-fix.css?v=272">\n'
        '    <link rel="stylesheet" href="assets/css/chat-composer-fix.css?v=272">',
    )
if "assets/js/chat-layout-fix.js?v=272" not in index_html:
    index_html = index_html.replace(
        '    <script type="module" src="assets/js/page-fixes.js?v=272"></script>',
        '    <script type="module" src="assets/js/page-fixes.js?v=272"></script>\n'
        '    <script type="module" src="assets/js/chat-layout-fix.js?v=272"></script>',
    )
write_text("index.html", index_html)

manifest_path = ROOT / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["icons"] = [
    {
        "src": "assets/icons/icon-192-original-zoom.png",
        "sizes": "192x192",
        "type": "image/png",
        "purpose": "any",
    },
    {
        "src": "assets/icons/icon-512-original-zoom.png",
        "sizes": "512x512",
        "type": "image/png",
        "purpose": "any maskable",
    },
]
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

service_worker = read_text("service-worker.js")
service_worker = service_worker.replace("estraha-cache-v271", "estraha-cache-v272")

entries = [
    "  '/assets/css/chat-composer-fix.css',",
    "  '/assets/js/chat-layout-fix.js',",
    "  '/assets/icons/icon-192-original-zoom.png',",
    "  '/assets/icons/icon-512-original-zoom.png',",
    "  '/assets/icons/apple-touch-icon-original-zoom.png',",
]
anchors = {
    entries[0]: "  '/assets/css/layout-theme-fix.css',",
    entries[1]: "  '/assets/js/page-fixes.js',",
    entries[2]: "  '/assets/icons/icon-192.png',",
    entries[3]: "  '/assets/icons/icon-512.png',",
    entries[4]: "  '/assets/icons/apple-touch-icon.png',",
}
for entry, anchor in anchors.items():
    if entry not in service_worker and anchor in service_worker:
        service_worker = service_worker.replace(anchor, anchor + "\n" + entry)

service_worker = service_worker.replace(
    "icon: '/assets/icons/icon-512.png'",
    "icon: '/assets/icons/icon-512-original-zoom.png'",
)
service_worker = service_worker.replace(
    "badge: '/assets/icons/icon-192.png'",
    "badge: '/assets/icons/icon-192-original-zoom.png'",
)
write_text("service-worker.js", service_worker)

print("Restored the original icon artwork with a small zoom and wired the chat layout fix.")
