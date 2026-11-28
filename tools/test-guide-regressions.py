# SPDX-License-Identifier: Apache-2.0
"""Exercise the published HTTP loader, global search, guide navigation and copy recovery."""
import argparse
import re
import subprocess
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def published_site():
    with subprocess.Popen(
        ["node", "serve.js", "0", "--host", "127.0.0.1", "--no-precompress"],
        cwd=ROOT, stdout=subprocess.PIPE, encoding="utf-8", errors="replace",
    ) as server:
        try:
            address = server.stdout.readline().split()
            assert address and address[0].startswith("http://127.0.0.1:"), address
            yield address[0] + "/"
        finally:
            server.terminate()


def palette(page, base):
    for width in (390, 1440):
        page.set_viewport_size({"width":width, "height":900})
        for menu in ("browse", "topology", "sim", "compare", "guide"):
            page.goto(base + "#4.22/" + menu)
            page.wait_for_function("menu => window.App?.cur === menu", arg=menu)
            expect(page.locator("main h1").first).to_be_visible()
            page.locator("#searchbtn").click()
            search = page.locator("#palin")
            expect(search).to_be_focused()
            initial = page.locator("#palres").inner_text()
            search.fill("Technology Preview")
            expect(page.locator("#palres")).not_to_have_text(initial)
            match = page.locator("#palres button").filter(has_text="Technology Preview").first
            expect(match).to_be_visible()
            match.click()
            expect(page.locator("main h1")).to_have_text("Technology Preview")
            page.keyboard.press("Control+k")
            expect(search).to_be_focused()
            search.fill("Technology Preview")
            search.press("ArrowDown")
            search.press("ArrowUp")
            search.press("Enter")
            expect(search).to_be_hidden()
            page.locator("#searchbtn").click()
            search.press("Escape")
            expect(page.locator("#searchbtn")).to_be_focused()


def guide(page, base):
    for version in page.locator("#ver option").evaluate_all("options => options.map(o => o.value)"):
        page.goto(base + f"#{version}/guide")
        toc = page.locator(".guide-toc")
        expect(toc).to_be_visible()
        expect(toc.locator("a").first).to_have_attribute("href", re.compile("^#" + re.escape(version) + "/guide:"))
        entries = page.evaluate("v => App.prep(v).guide.map(g => [g.id, g.title])", version)
        urls = toc.locator("a").evaluate_all("items => items.map(a => a.hash)")
        assert set(urls) == {f"#{version}/guide:{key}" for key, _ in entries}
        toggle = toc.locator(".guide-toggle").first
        toggle.click()
        expect(toggle).to_have_attribute("aria-expanded", "false")
        toggle.press("Enter")
        expect(toggle).to_have_attribute("aria-expanded", "true")
        for key, title in entries:
            page.evaluate("hash => location.hash = hash", f"#{version}/guide:{key}")
            expect(page.locator("main h1")).to_have_text(title)
            assert page.locator(".guide").inner_text().strip()
            # Every source link to a catalogued section must remain reachable locally.
            missing = page.evaluate("""v => {
              const doc = VERSIONS.sources[v].overview;
              const entries = App.prep(v).guide;
              const source = entries.find(g => App.href('guide:' + g.id) === location.hash);
              const html = new DOMParser().parseFromString(source.html, 'text/html');
              const ids = new Set(entries.map(g=>g.id));
              const required = [...html.querySelectorAll('a[href]')].filter(a =>
                a.href.split('#')[0]===doc && ids.has(a.hash.slice(1)));
              const links = [...document.querySelectorAll('.guide a')];
              return required.filter(a=>!links.some(b=>!b.target && b.hash===App.href('guide:'+a.hash.slice(1)))).length;
            }""", version)
            assert missing == 0
        page.evaluate("v => location.hash=v+'/guide:unavailable-section'", version)
        expect(toc).to_be_visible()
        assert urlsplit(page.url).fragment == version + "/guide"
        page.reload()
        expect(toc).to_be_visible()
        assert page.locator("#main").evaluate("e=>e.scrollWidth-e.clientWidth") <= 1


def clipboard(page, base):
    page.goto(base + "#4.22/guide:modifying-kubelet-one-time_editing-kubelet-log-level-verbosity")
    command = page.locator(".guide pre button").first
    expect(command).to_contain_text("명령 복사")
    page.evaluate("""() => {
      Object.defineProperty(navigator,'clipboard',{configurable:true, value:{
        writeText: async text => {window.copied = text}
      }});
    }""")
    command.click()
    expect(command).to_contain_text("복사됨")
    assert page.evaluate("window.copied") == "oc debug node/<node>"
    page.evaluate("""() => {
      navigator.clipboard.writeText = async () => {throw new Error('denied')};
      document.execCommand = () => false;
    }""")
    command.click()
    dialog = page.locator("dialog.manual-copy")
    expect(dialog).to_be_visible()
    field = dialog.locator("textarea")
    expect(field).to_be_focused()
    expect(field).to_have_value("oc debug node/<node>")
    assert field.evaluate("e=>e.selectionStart===0 && e.selectionEnd===e.value.length")
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    expect(command).to_be_focused()
    page.evaluate("document.execCommand = op => op==='copy'")
    command.click()
    expect(page.locator("#toast")).to_contain_text("클립보드에 복사했습니다")
    expect(dialog).to_have_count(0)


def offline_guide(browser, base):
    with browser.new_context(locale="en-US") as context:
        page = context.new_page()
        page.goto(base + "?lang=en#5.0/guide")
        expect(page.locator(".guide-toc a")).to_have_count(38)
        page.wait_for_function("() => Boolean(navigator.serviceWorker.controller)", timeout=60000)
        context.set_offline(True)
        page.reload()
        expect(page.locator(".guide-toc a")).to_have_count(38)
        page.get_by_role("link", name="Understanding API tiers", exact=True).click()
        expect(page.locator("main h1")).to_have_text("Understanding API tiers")
        expect(page.get_by_role("link", name="View source document")).to_be_visible()
        page.locator(".guide").get_by_role("link", name="API tiers", exact=True).first.click()
        expect(page.locator("main h1")).to_have_text("API tiers")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channel", default="chrome")
    args = parser.parse_args()
    expect.set_options(timeout=12000)
    with published_site() as base, sync_playwright() as pw, pw.chromium.launch(channel=args.channel) as browser:
        page = browser.new_page(locale="ko-KR", reduced_motion="reduce", service_workers="block")
        page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        palette(page, base)
        guide(page, base)
        clipboard(page, base)
        assert not errors, errors
        offline_guide(browser, base)
        print("Global search, release guides, internal links, clipboard recovery and offline navigation passed.")
