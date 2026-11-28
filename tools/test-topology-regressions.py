#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Exercise the topology controls and compare their selection with the rendered canvas data."""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def check_filters(page, entry):
    page.goto(entry + "#5.0/topology")
    page.locator("#nl summary").click()
    category = page.locator("#tcats button").filter(has_text="스토리지")
    query = page.locator("#tfind")
    category.click()
    query.fill("Deployment")
    expect(page.locator('#nlist [data-nid="deployment-apps-v1"]')).to_have_count(0)
    query.press("Enter")
    expect(category).to_have_attribute("aria-pressed", "true")
    assert "topology:deployment-apps-v1" not in page.url

    query.fill("StorageClass")
    query.press("Enter")
    current = page.locator('#nlist [aria-current="true"]')
    expect(current.locator(".rk")).to_have_text("StorageClass")
    expect(page.locator("#tinfo .ikind")).to_have_text("StorageClass")
    assert page.evaluate("graph.sel") == current.get_attribute("data-nid")

    category.click()
    row = page.locator('#nlist [data-nid="apirequestcount-apiserver-openshift-io-v1"]')
    row.focus()
    row.press("Enter")
    expect(page.locator("#tinfo .ikind")).to_have_text("APIRequestCount")
    page.locator("#tiso").check()
    expect(row).to_have_count(0)
    expect(page.locator("#tinfo [data-act=focus]")).to_have_count(0)
    assert page.evaluate("graph.sel") is None and page.url.endswith("#5.0/topology")
    page.locator("#tiso").uncheck()
    expect(row).to_have_count(1)
    expect(current).to_have_count(0)


def open_relations(page, entry):
    page.goto(entry + "#5.0/api:deployment-apps-v1")
    page.locator("#ego").scroll_into_view_if_needed()
    expect(page.locator("#egoinfo .ikind")).to_have_text("Deployment")


def check_relations(page, entry):
    open_relations(page, entry)
    for kind in ("mention", "curated", "same", "variant", "group"):
        page.locator(f'#ego [data-type="{kind}"]').click()
    panel = page.locator("#egoinfo")
    links = panel.locator("[data-sel]")
    expect(links).to_have_count(4)
    expect(panel.locator(".isum")).to_contain_text("같은 그룹 4개")
    expected = page.evaluate("graph.edges.filter(e => e.type === 'group').map(e => e.t).sort()")
    assert links.evaluate_all("els => els.map(el => el.dataset.sel).sort()") == expected
    links.first.press("Enter")
    expect(panel.locator(".ikind")).to_be_focused()
    expect(links).to_have_count(1)
    expect(links.first).to_have_attribute("data-sel", "deployment-apps-v1")

    # Re-enter the detail through the router, resetting its local filter state.
    page.goto(entry + "#5.0/topology")
    expect(page.locator("#tstat")).to_be_visible()
    open_relations(page, entry)
    panel.locator('[data-sel="replicaset-apps-v1"]').press("Enter")
    pod = panel.locator('[data-sel="pod-v1"]')
    assert not page.evaluate("graph.map.has('pod-v1')")
    pod.press("Enter")
    expect(panel.locator(".ikind")).to_have_text("Pod")
    expect(panel.locator(".ikind")).to_be_focused()
    expect(page.locator("#ego [data-depth='2']")).to_have_attribute("aria-pressed", "true")
    assert page.evaluate("graph.sel === 'pod-v1' && graph.map.has(graph.sel)")
    page.locator("#ego [data-depth='1']").click()
    expect(panel.locator(".ikind")).to_have_text("Deployment")
    assert page.evaluate("graph.sel === 'deployment-apps-v1' && graph.map.has(graph.sel)")


def check_release(page, entry):
    start = "#5.0/topology:backendtlspolicy-gateway-networking-k8s-io-v1"
    page.goto(entry + start)
    expect(page.locator("#tinfo .ikind")).to_have_text("BackendTLSPolicy")
    page.locator("#ver").select_option("4.20")
    expect(page.locator("#tinfo")).to_contain_text("선택한 API는 이 릴리스에 없습니다.")
    assert page.url.endswith("#4.20/topology") and page.evaluate("graph.sel") is None
    assert page.evaluate("graph.nodes.length") > 0
    page.go_back()
    expect(page.locator("#tinfo .ikind")).to_have_text("BackendTLSPolicy")
    assert page.url.endswith(start)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, default=Path(__file__).resolve().parents[1] / "index.html")
    parser.add_argument("--channel", default="chrome")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=args.channel)
        for width, height, mobile in ((1440, 900, False), (360, 800, True)):
            page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=mobile,
                                    has_touch=mobile, reduced_motion="reduce")
            # Observe the actual GraphView model supplied to the canvas; keep all rendering intact.
            page.add_init_script("""let graphClass;
                Object.defineProperty(window, 'GraphView', {get: () => graphClass, set: base => {
                  graphClass = class extends base {constructor(...args) {super(...args); window.graph = this;}};
                }});""")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            for check in (check_filters, check_relations, check_release):
                check(page, args.entry.resolve().as_uri())
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert not errors, errors
            print(f"{width}x{height}: 5 topology regressions passed", flush=True)
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
