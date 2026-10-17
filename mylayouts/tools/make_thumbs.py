"""Generate card thumbnails for the layout snippet library.

Reads the `layouts` registry in mylayouts/index.html, opens each snippet in one
headless Microsoft Edge (via Playwright), and writes a small JPEG per snippet to
layouts/thumbs/<same path as the snippet>.jpg. The library cards show these
images; the drawer still loads the live snippet.

Usage (from anywhere):
    python mylayouts/tools/make_thumbs.py            # only snippets without a thumbnail
    python mylayouts/tools/make_thumbs.py --force    # regenerate everything
    python mylayouts/tools/make_thumbs.py web-5050/Web5050VideoMobileStackNoLink.html

Needs: Python 3.9+, Playwright and Pillow (pip install playwright pillow), and
Microsoft Edge installed. Pass --channel chrome to use Google Chrome instead.
"""

import argparse
import asyncio
import io
import re
import sys
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent          # mylayouts/
SNIPPETS = ROOT / 'layouts' / 'snippets'
THUMBS = ROOT / 'layouts' / 'thumbs'

DESKTOP = {'width': 1280, 'height': 900}   # same viewport the cards used to render
MOBILE = {'width': 375, 'height': 812}
DESKTOP_OUT_W = 640                         # 2x the ~320px card width
MOBILE_OUT_W = 300
SETTLE_MS = 1500                            # let sliders initialise and entrance animations finish
JPEG_QUALITY = 72


def read_registry():
    """Return [(file, platform)] from the layouts array in index.html."""
    src = (ROOT / 'index.html').read_text(encoding='utf-8')
    start = src.index('const layouts = [')
    block = src[start:src.index('];', start)]
    return re.findall(r'file:"([^"]+)".*?platform:"([^"]+)"', block)


def thumb_path(rel):
    return THUMBS / Path(rel).with_suffix('.jpg')


async def render(page, rel, out_w):
    """Screenshot one snippet into its thumbnail; returns a status string."""
    note = ''
    try:
        await page.goto((SNIPPETS / rel).as_uri(), wait_until='load', timeout=30000)
    except Exception:
        note = ' (load timed out, captured as rendered)'   # e.g. a stalled video; the page is usually drawn already
    await page.wait_for_timeout(SETTLE_MS)
    png = await page.screenshot(type='png')
    img = Image.open(io.BytesIO(png)).convert('RGB')
    img = img.resize((out_w, round(img.height * out_w / img.width)), Image.LANCZOS)
    out = thumb_path(rel)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
    return f'ok {out.stat().st_size // 1024}KB{note}'


async def worker(browser, queue, results, total):
    # One desktop and one mobile page per worker, reused for every snippet it picks up
    pages = {}
    for kind, viewport in (('desktop', DESKTOP), ('mobile', MOBILE)):
        ctx = await browser.new_context(viewport=viewport)
        pages[kind] = await ctx.new_page()
    while True:
        try:
            rel, platform = queue.get_nowait()
        except asyncio.QueueEmpty:
            break
        mobile = platform == 'mobile'
        try:
            status = await render(pages['mobile' if mobile else 'desktop'], rel, MOBILE_OUT_W if mobile else DESKTOP_OUT_W)
        except Exception as e:
            status = f'failed ({type(e).__name__}: {str(e).splitlines()[0][:80]})'
        results.append((rel, status))
        print(f'[{len(results)}/{total}] {rel}: {status}', flush=True)


async def main_async(args):
    registry = read_registry()
    if args.files:
        wanted = {f.replace('\\', '/') for f in args.files}
        unknown = wanted - {f for f, _ in registry}
        if unknown:
            print('Not in the registry (add them to index.html first):', *sorted(unknown), sep='\n  ')
        registry = [(f, p) for f, p in registry if f in wanted]
    todo = [(f, p) for f, p in registry if args.force or args.files or not thumb_path(f).exists()]
    print(f'{len(todo)} of {len(registry)} snippets to render')
    if not todo:
        return []

    queue = asyncio.Queue()
    for item in todo:
        queue.put_nowait(item)
    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel=args.channel, headless=True,
                                           args=['--mute-audio', '--allow-file-access-from-files'])
        await asyncio.gather(*(worker(browser, queue, results, len(todo)) for _ in range(args.workers)))
        await browser.close()
    return [rel for rel, status in results if not status.startswith('ok')]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='*', help='snippet paths relative to layouts/snippets (default: all registered)')
    ap.add_argument('--force', action='store_true', help='regenerate thumbnails that already exist')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--channel', default='msedge', help='installed browser to drive: msedge (default) or chrome')
    args = ap.parse_args()

    failed = asyncio.run(main_async(args))
    if failed:
        print(f'\n{len(failed)} failed:', *failed, sep='\n  ')
        sys.exit(1)


if __name__ == '__main__':
    main()
