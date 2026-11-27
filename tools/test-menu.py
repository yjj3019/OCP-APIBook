# SPDX-License-Identifier: Apache-2.0
"""Open index.html directly and exercise its menu pages in an isolated browser profile.

Requires Python Playwright and a locally installed Chrome or Edge browser.
Run from the repo with python tools/test-menu.py, or add --channel msedge --mobile.
"""
import argparse
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def check_topology_rotation(page):
    canvas = page.locator("#topo canvas")
    canvas.scroll_into_view_if_needed()
    # Record the circles that actually reach the canvas, including perspective scaling.
    canvas.evaluate("""canvas => {
        const ctx = canvas.getContext('2d');
        const clear = ctx.clearRect.bind(ctx), arc = ctx.arc.bind(ctx);
        ctx.clearRect = (...args) => { canvas.circles = []; return clear(...args); };
        ctx.arc = (x, y, r, ...args) => {
            const m = ctx.getTransform(), dpr = canvas.width / canvas.clientWidth;
            canvas.circles.push([(x*m.a+m.e)/dpr, (y*m.d+m.f)/dpr, r*m.a/dpr]);
            return arc(x, y, r, ...args);
        };
    }""")
    page.locator('#topo [data-z="fit"]').click()
    def rendered_radii():
        return canvas.evaluate("""async c => {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return c.circles.map(p => p[2].toFixed(3)).sort();
        }""")

    before = rendered_radii()
    assert len(before) > 10
    canvas.press("ArrowRight")
    rotated = rendered_radii()
    assert rotated != before
    bounds = canvas.bounding_box()
    x, y = bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 65, y + 20, steps=6)
    page.mouse.up()
    assert rendered_radii() != rotated
    point = canvas.evaluate("""c => c.circles.slice().reverse().find(([x,y]) =>
        x > 15 && x < c.clientWidth - 60 && y > 30 && y < c.clientHeight - 45)""")
    assert point
    canvas.click(position={"x": point[0], "y": point[1]})
    expect(page.locator("#tinfo .ikind")).to_be_visible()


def check_release(page, version):
    def sidebar(selector):
        if page.locator("#menubtn").is_visible() and not page.locator("body.nav-open").count():
            page.locator("#menubtn").click()
        page.locator("#side " + selector).click()

    def menu(name):
        sidebar(f'[data-nav="{name}"]')
        expect(page.locator(f'#side [data-nav="{name}"]')).to_have_attribute("aria-current", "page")

    page.locator("#ver").select_option(version)
    names = page.locator("#side [data-nav]").evaluate_all("(nodes) => nodes.map(n => n.dataset.nav)")
    assert set(names) == {"home", "browse", "topology", "sim", "compare", "guide"}, names
    menu("home")
    expect(page.locator("main h1")).to_be_visible()
    menu("browse")
    page.locator("#bq").fill("Route")
    route = page.locator("#bl .row").filter(has=page.locator(".kind", has_text="Route")).first
    expect(route.locator(".kind")).to_have_text("Route")
    route.click()
    expect(page.locator("#main h1")).to_have_text("Route")
    expect(page.locator("#fieldhost button").first).to_be_visible()
    for tab in ["#ctab0", "#ctab1", "#ctab2"]:
        page.locator(tab).click()
        assert page.locator("#codeb").inner_text().strip()
    page.locator("#favb").click()
    sidebar(".sideitem[data-key]")
    expect(page.locator("#main h1")).to_have_text("Route")

    menu("topology")
    expect(page.locator("#topo canvas")).to_be_visible()
    expect(page.locator("#tstat")).to_contain_text("API")
    graph = page.locator("#tstat").inner_text()
    check_topology_rotation(page)
    menu("sim")
    expect(page.locator("#sform input").first).to_be_visible()
    expect(page.locator(".simyaml code").first).to_contain_text("apiVersion")

    menu("compare")
    tabs = page.locator("#cres [data-ctab]")
    expect(tabs).to_have_count(4)
    for tab in tabs.all():
        tab.click()
        expect(tab).to_have_attribute("aria-pressed", "true")
        assert page.locator("#cres li").count()

    categories = page.locator('#side a[href*="browse:cat="]').evaluate_all("(nodes) => nodes.map(n => n.hash)")
    for target in categories:
        sidebar(f'a[href="{target}"]')
        expect(page.locator('select[data-f="cat"]')).to_have_value(target.split("cat=")[1])
        expect(page.locator("#bl .row").first).to_be_visible()

    menu("guide")
    expect(page.locator(".guidelist a").first).to_be_visible()
    chapters = page.locator(".guidelist a").evaluate_all("(nodes) => nodes.map(n => n.hash)")
    assert chapters
    for target in chapters:
        page.locator(f'.guidelist a[href="{target}"]').click()
        expect(page.locator("main .guide")).to_be_visible()
        assert page.locator("main .guide").inner_text().strip()
        page.locator("#gb").click()
    for link in ["#helplink", "#aboutlink"]:
        sidebar(link)
        expect(page.locator("#help [role=dialog]")).to_be_visible()
        page.locator("#helpx").click()
    menu("home")
    assert not page.locator("#retry, #fretry").count()
    return {"release": version, "menus": len(names), "categories": len(categories), "chapters": len(chapters), "graph": graph}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, default=Path(__file__).resolve().parents[1] / "index.html")
    parser.add_argument("--channel", default="chrome")
    parser.add_argument("--mobile", action="store_true")
    args = parser.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=args.channel)
        page = browser.new_page(viewport={"width": 390 if args.mobile else 1440, "height": 900}, reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(args.entry.resolve().as_uri())
        expect(page.locator("#side [data-nav]")).to_have_count(6)
        for version in page.locator("#ver option").evaluate_all("(nodes) => nodes.map(n => n.value)"):
            print(json.dumps(check_release(page, version), ensure_ascii=True), flush=True)
            assert not errors, errors
        browser.close()
