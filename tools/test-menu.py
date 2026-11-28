# SPDX-License-Identifier: Apache-2.0
"""Open index.html directly and exercise its menu pages in an isolated browser profile.

Requires Python Playwright and a locally installed Chrome or Edge browser.
The repository entry point also exercises startup and offline recovery using Node.js.
Run from the repo with python tools/test-menu.py, or add --channel msedge --mobile.
"""
import argparse
import json
import re
import subprocess
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


@contextmanager
def local_site(entry):
    server = subprocess.Popen(
        ["node", "serve.js", "0", "--host", "127.0.0.1", "--no-precompress"],
        cwd=entry.resolve().parent, stdout=subprocess.PIPE, encoding="utf-8", errors="replace",
    )
    try:
        origin = server.stdout.readline().split()[0]
        assert origin.startswith("http://127.0.0.1:")
        yield origin
    finally:
        server.terminate()
        server.wait(timeout=10)
        server.stdout.close()


def check_startup(browser, origin, lang):
    # The recovery button must also work when the application itself never starts.
    with browser.new_context(service_workers="block") as ctx:
        page = ctx.new_page()
        page.route("**/boot.js?*", lambda route: route.abort(), times=1)
        page.goto(origin + "/index.html?lang=" + lang + "#4.22/home")
        reload_button = page.get_by_role("button", name="Reload page" if lang == "en" else "페이지 새로고침")
        expect(reload_button).to_be_visible()
        reload_button.click()
        expect(page.locator("#home-query")).to_be_visible()
        expect(page.locator("#ver")).to_have_value("4.22")

    # Hold the first index request until the user navigates, then fail it once.
    with browser.new_context(viewport={"width": 900, "height": 900}, service_workers="block") as ctx:
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        held = []
        pattern = re.compile(r"/data/\d+\.\d+\.fidx\.js\?")
        page.route(pattern, lambda route: held.append(route))
        with page.expect_request(pattern):
            page.goto(origin + "/index.html?lang=" + lang + "#4.22/home", wait_until="domcontentloaded")
        nav = page.locator("#side [data-nav]")
        expect(nav).to_have_count(6)
        page.locator("#menubtn").click()
        page.locator('[data-nav="browse"]').click()
        expect(page.locator("#menubtn")).to_have_attribute("aria-expanded", "false")
        page.locator("#searchbtn").click()
        page.locator("#palin").fill("Route")
        expect(page.locator("#palres")).to_contain_text("Loading" if lang == "en" else "불러오는")
        held.pop().abort()
        retry = page.locator("#retry")
        expect(retry).to_be_visible()
        expect(page.locator("#palette")).to_be_hidden()
        with page.expect_request(pattern):
            retry.click()
        page.keyboard.press("Control+k")
        page.locator("#palin").fill("Route")
        held.pop().continue_()
        expect(page.locator("#palres [role=option] b").first).to_have_text("Route")
        page.locator("#palin").press("Escape")
        page.unroute(pattern)
        expect(page.locator("#bq")).to_be_visible()
        page.locator("#ver").select_option("4.21")
        expect(page.locator('[data-nav="guide"]')).to_have_attribute("href", "#4.21/guide")
        expect(page.locator("#side .sideitem").first).to_have_attribute("href", re.compile(r"^#4\.21/"))
        check_palette(page)
        assert not errors, errors

    # A fresh, unmocked context installs the real worker and caches the visited schema.
    with browser.new_context(viewport={"width": 900, "height": 900}) as ctx:
        page = ctx.new_page()
        page.goto(origin + "/index.html?lang=" + lang + "#4.22/home")
        expect(page.locator("#side [data-nav]")).to_have_count(6)
        expect(page.locator("#home-query")).to_be_visible()
        page.evaluate("""() => new Promise((resolve, reject) => {
            const worker = navigator.serviceWorker;
            if (worker.controller) return resolve();
            const timer = setTimeout(() => reject(new Error("Service worker did not claim this page")), 15000);
            worker.addEventListener("controllerchange", () => { clearTimeout(timer); resolve(); }, {once: true});
        })""")
        page.locator("#home-query").fill("Route")
        page.locator("#home-query").press("Enter")
        page.locator('#bl a[href$="/api:route-route-openshift-io-v1"]').click()
        expect(page.locator("#fq")).to_be_visible()
        ctx.set_offline(True)
        for language in (lang, "en" if lang == "ko" else "ko"):
            if language == lang:
                page.reload()
            else:
                page.locator("#language-switch").click()
            expect(page.locator("html")).to_have_attribute("lang", language)
            expect(page.locator("main h1")).to_have_text("Route")
            expect(page.locator("#fq")).to_be_visible()
            expect(page.locator("#ver")).to_have_value("4.22")


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


READ_DRAFTS = """() => new Promise((resolve, reject) => {
    const open = indexedDB.open('apibook.simulator');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
        const db = open.result, tx = db.transaction('drafts'), read = tx.objectStore('drafts').getAll();
        tx.oncomplete = () => { db.close(); resolve(read.result.filter(record => Array.isArray(record?.items))); };
        tx.onabort = () => { db.close(); reject(tx.error); };
    };
})"""


def saved(tab, value):
    tab.wait_for_function(f"async value => JSON.stringify(await ({READ_DRAFTS})()).includes(value)", arg=value)


def stored(tab):
    return json.dumps(tab.evaluate(READ_DRAFTS))


def check_palette(page):
    page.locator("#searchbtn").click()
    query = page.locator("#palin")
    expect(query).to_have_attribute("role", "combobox")
    expect(query).to_be_focused()
    query.fill("Route")
    first = page.locator("#palres [role=option]").first
    expect(first.locator("b")).to_have_text("Route")
    query.press("Enter")
    expect(page.locator("main h1")).to_have_text("Route")
    expect(page.locator("#palette")).to_be_hidden()
    page.keyboard.press("Control+k")
    expect(query).to_be_focused()
    query.fill("ConfigMap")
    match = page.locator("#palres [role=option]").first
    expect(match.locator("b")).to_have_text("ConfigMap")
    match.click()
    expect(page.locator("main h1")).to_have_text("ConfigMap")
    expect(page.locator("#palette")).to_be_hidden()


def check_languages(page, entry):
    url = entry.resolve().as_uri()
    page.goto(url + "#4.22/home")
    expect(page.locator("html")).to_have_attribute("lang", "ko")
    expect(page.locator("#catalog-heading")).to_have_text("API 레퍼런스")
    page.locator("#language-switch").click()
    expect(page.locator("html")).to_have_attribute("lang", "en")
    expect(page.locator("#catalog-heading")).to_have_text("API reference")
    expect(page.locator("#ver")).to_have_value("4.22")
    page.locator("#home-query").fill("Route")
    page.locator("#home-query").press("Enter")
    page.locator("#bl .row").first.click()
    expect(page.locator("main h1")).to_have_text("Route")
    target = page.url.split("#")[1]
    page.locator("#language-switch").click()
    expect(page.locator("html")).to_have_attribute("lang", "ko")
    expect(page.locator("main h1")).to_have_text("Route")
    assert page.url.split("#")[1] == target
    page.locator("#language-switch").click()
    expect(page.locator("#ctab1")).to_be_visible()
    page.locator("#ctab1").click()
    expect(page.locator("#codeb")).to_contain_text("oc explain")
    expect(page.locator("#codeb")).not_to_contain_text("목록 보기")

    for route, title in [("browse", "Search across releases"), ("compare", "What changed between releases?"),
                         ("topology", "API relationships"), ("guide", "API support levels and policies"),
                         ("sim", "API design simulator")]:
        page.goto(url + "?lang=en#4.22/" + route)
        expect(page.locator("main h1")).to_have_text(title)
        expect(page.locator("#ver")).to_have_value("4.22")
    page.locator("#sform").get_by_role("button", name="Import YAML").click()
    editor = page.locator("#imptxt")
    draft = "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: demo}\ndata: {label: 검색}"
    editor.fill(draft)
    with page.context.expect_page() as popup:
        page.locator("#language-switch").click()
    try:
        expect(popup.value.locator("html")).to_have_attribute("lang", "ko")
        expect(popup.value.locator("#sroot")).to_be_visible()
        expect(editor).to_have_value(draft)
    finally:
        popup.value.close()
    page.locator("#imp button").click()
    expect(page.locator("#import-report")).to_contain_text("Opened 1 of 1 documents in the editor.")
    expect(page.locator(".simyaml")).to_contain_text("검색")


def check_settings_reset(page, entry, lang="ko"):
    base = entry.resolve().as_uri() + "?lang=" + lang + "#5.0/"
    page.goto(base + "sim")
    page.locator("#sform").get_by_role("button", name="Import YAML" if lang == "en" else "YAML 가져오기").click()
    page.locator("#imptxt").fill("apiVersion: v1\nkind: ConfigMap\nmetadata: {name: reset-check-current}")
    page.locator("#imp button").click()
    saved(page, "reset-check-current")
    legacy_key = "apibook.sim.4.20"
    legacy = {"items": [{"id": "configmap-v1", "M": {"apiVersion": "v1", "kind": "ConfigMap",
               "metadata": {"name": "reset-check-legacy"}}}], "active": 0}
    page.locator("#autosave").uncheck()
    detail = base + "api:route-route-openshift-io-v1"
    page.goto(detail)
    favorite = page.locator("#favb")
    if favorite.get_attribute("aria-pressed") != "true":
        favorite.click()
    page.goto(base + "home")
    expect(page.locator(".saved-panel .lrow").first).to_contain_text("Route")
    page.evaluate("([k,v])=>localStorage.setItem(k, JSON.stringify(v))", [legacy_key, legacy])
    page.locator("#aboutlink2").click()
    page.locator("#clrstore").click()
    expect(page.locator(".saved-panel .lrow")).to_have_count(0)
    expect(page.locator("#saved-resources .dash-link")).to_be_visible()
    assert page.evaluate("['fav','recent','theme','ver'].every(k => localStorage.getItem('apibook2.' + k) === null)")
    assert page.evaluate("k => JSON.parse(localStorage.getItem(k))", legacy_key) == legacy
    assert "reset-check-current" in stored(page)
    assert page.evaluate("localStorage.getItem('apibook.simulation.autosave')") == "off"
    page.locator("#helpx").click()
    page.goto(detail)
    favorite.click()
    expect(favorite).to_have_attribute("aria-pressed", "true")
    if page.locator("#menubtn").is_visible():
        page.locator("#menubtn").click()
    page.locator("#aboutlink").click()
    page.locator("#clrstore").click()
    expect(favorite).to_have_attribute("aria-pressed", "false")
    page.locator("#helpx").click()
    page.goto(base + "sim")
    page.locator("#clear-drafts").click()
    expect(page.locator("#storage-note")).to_contain_text("Cleared saved drafts" if lang == "en" else "지웠습니다")
    assert page.evaluate(READ_DRAFTS) == []
    assert page.evaluate("k => localStorage.getItem(k)", legacy_key) is None
    page.locator("#autosave").check()


def check_dashboard(page, entry):
    page.goto(entry.resolve().as_uri() + "#5.0/home")
    page.locator('.release-chart a[href="#4.20/home"]').click()
    expect(page.locator("#ver")).to_have_value("4.20")
    expect(page.locator('.release-chart [aria-current]')).to_contain_text("4.20")
    for tab in ("added", "removed", "changed"):
        link = page.locator(f'.change-links a[href$="tab={tab}"]')
        link.click()
        expect(page.locator("#cf")).to_have_value("4.20")
        expect(page.locator("#ct")).to_have_value("4.21")
        expect(page.locator(f'#cres [data-ctab="{tab}"]')).to_have_attribute("aria-pressed", "true")
        page.go_back()
    page.locator("#home-query").fill("  spec.tls  ")
    page.locator("#home-query").press("Enter")
    expect(page.locator("#bq")).to_have_value("spec.tls")
    expect(page.locator("#bl .row").first).to_be_visible()
    page.go_back()
    page.locator(".more-topics summary").click()
    last = page.locator(".more-topics .catalog-topic").last
    category = last.get_attribute("href").split("cat=")[1]
    last.click()
    expect(page.locator('select[data-f="cat"]')).to_have_value(category)


def check_workspace_features(page, entry):
    root = entry.resolve().as_uri()
    page.goto(root + "#5.0/home")
    source = page.locator("details:has(#catalog-source)")
    source.locator("summary").click()
    expect(source.locator('a[href*="/commit/"]')).to_have_count(1)
    api_url = "https://api.github.com/repos/openshift/openshift-docs/commits/*"
    page.route(api_url, lambda route: route.fulfill(json={"sha": "a" * 40}, headers={"access-control-allow-origin": "*"}))
    source.get_by_role("button").click()
    expect(source.locator('[role=status]')).to_contain_text("새 원본")
    page.unroute(api_url)
    page.route(api_url, lambda route: route.fulfill(json={}, headers={"access-control-allow-origin": "*"}))
    source.get_by_role("button").click()
    expect(source.locator('[role=status]')).to_contain_text("다시 시도")
    page.unroute(api_url)

    page.goto(root + "#5.0/compare:from=4.22&to=5.0&tab=changed")
    page.locator("#cq").fill("CronJob")
    page.locator("#cres details summary").first.click()
    expect(page.locator("#cres details").first).to_contain_text("spec · 선택 → 필수")

    page.goto(root + "#5.0/topology")
    page.locator("#path-panel summary").click()
    for kind in ("mention", "same", "variant"):
        page.locator(f'#ttypes [data-type="{kind}"]').click()
    for field, kind in [("from", "Route"), ("to", "Pod")]:
        select = page.locator("#path-" + field)
        option = select.locator("option").evaluate_all("(nodes, k) => nodes.find(n => n.text.startsWith(k + ' · ')).value", kind)
        select.select_option(option)
    expect(page.locator("#path-result li")).to_have_count(2)
    expect(page.locator("#path-result")).to_contain_text("Route → Service · 일반 관계")
    page.locator('#ttypes [data-type="curated"]').click()
    expect(page.locator("#path-result")).to_contain_text("경로가 없습니다")
    page.locator("#path-clear").click()

    page.evaluate("""() => localStorage.setItem('apibook.sim.4.20', JSON.stringify({
        items: [{id: 'secret-v1', M: {kind:'Secret', stringData:{test:'old-marker'}}}],active:0}))""")
    page.goto(root + "#5.0/sim")
    expect(page.locator("#sroot")).to_be_visible()
    assert "old-marker" not in page.evaluate("localStorage.getItem('apibook.sim.4.20') || ''")
    docs = [{"apiVersion": "v1", "kind": k, "metadata": {"name": n}}
            for k, n in [("ConfigMap", "review-one"), ("ConfigMap", "review-two"), ("Secret", "sensitive")]]
    docs[-1]["stringData"] = {"example": "synthetic-review-marker"}
    page.locator("#sform").get_by_role("button", name="YAML 가져오기").click()
    page.locator("#imptxt").fill("\n---\n".join(map(json.dumps, docs)) + "\n---\nkind: &anchor ConfigMap")
    page.locator("#imp button").click()
    expect(page.locator("#import-report ol > li")).to_have_count(4)
    expect(page.locator("#import-report")).to_contain_text("4개 중 3개")
    saved(page, "review-two")
    raw = stored(page)
    assert "review-one" in raw and "review-two" in raw and "synthetic-review-marker" not in raw
    page.reload()
    expect(page.locator("#rtabs")).to_contain_text("review-one")
    expect(page.locator("#rtabs")).to_contain_text("review-two")
    page.locator("#autosave").uncheck()
    assert "review-one" in stored(page)
    page.locator("#clear-drafts").click()
    expect(page.locator("#storage-note")).to_contain_text("지웠습니다")
    assert page.evaluate(READ_DRAFTS) == []
    assert not page.evaluate("Object.keys(localStorage).some(k=>k.startsWith('apibook.sim.'))")
    page.reload()
    expect(page.locator("#autosave")).not_to_be_checked()
    expect(page.locator("#rtabs")).not_to_contain_text("review-one")
    page.locator("#autosave").check()


def check_review_regressions(page, entry):
    root = entry.resolve().as_uri()
    sim = root + "#5.0/sim"
    key = "apibook.sim.5.0"

    def apply(tab, doc):
        tab.locator("#sform").get_by_role("button", name="YAML 가져오기").click()
        tab.locator("#imptxt").fill(json.dumps(doc))
        tab.locator("#imp button").click()
        expect(tab.locator("#import-report")).to_contain_text("1개 중 1개")

    def config(ns, value):
        return {"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"name": "shared", "namespace": ns}, "data": {"edit": value}}

    page.goto(sim)
    apply(page, config("first", "initial"))
    saved(page, "initial")
    other = page.context.new_page()
    try:
        other.goto(sim)
        expect(other.locator("#sroot")).to_be_visible()
        apply(page, config("first", "edit-from-first"))
        saved(page, "edit-from-first")
        apply(other, config("second", "independent"))
        saved(other, "independent")
        apply(other, config("first", "edit-from-second"))
        saved(other, "edit-from-second")
        expect(other.locator("#storage-note")).to_contain_text("다른 탭")
        # Queue both writes behind an active database transaction.
        page.evaluate("""key => new Promise((ready, reject) => {
            const open = indexedDB.open('apibook.simulator');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result, tx = db.transaction('drafts','readwrite'), records = tx.objectStore('drafts');
                let hold = true;
                window.releaseDraftLock = () => { hold = false; };
                function next() { records.get(key).onsuccess = () => { ready(); if (hold) next(); }; }
                next();
                tx.oncomplete = () => db.close();
            };
        })""", key)
        try:
            apply(page, config("first", "continued-first"))
            apply(other, config("first", "continued-second"))
        finally:
            page.evaluate("window.releaseDraftLock()")
        saved(page, "continued-first")
        saved(page, "continued-second")
        page.reload()
        expect(page.locator("#rtabs")).to_contain_text("충돌 보관본")
        expect(page.locator("#rtabs .rt").filter(has_text="first/shared")).to_have_count(2)
        for value in ["continued-first", "continued-second", "independent"]:
            saved(page, value)
    finally:
        other.close()

    route = {"kind": "Route", "apiVersion": "route.openshift.io/v1", "metadata": {"name": "privacy-test"},
             "spec": {"to": {"kind": "Service", "name": "app"}, "tls": {"termination": "edge", "key": "synthetic-route-marker"}}}
    apply(page, route)
    expect(page.locator("#draft-status")).to_contain_text("메모리")
    assert "privacy-test" not in stored(page)
    template = {"apiVersion": "template.openshift.io/v1", "kind": "Template", "metadata": {"name": "embedded-private-route"},
                "objects": [route]}
    apply(page, template)
    expect(page.locator("#draft-status")).to_contain_text("메모리")
    assert "embedded-private-route" not in stored(page)
    for kind, item in [
        ("SecretList", {"data": {"example": "synthetic"}}),
        ("RouteList", {"spec": route["spec"]}),
        ("TokenReviewList", {"spec": {"token": "synthetic"}}),
    ]:
        template["metadata"]["name"] = "contains-" + kind.lower()
        template["objects"] = [{"kind": kind, "items": [item]}]
        apply(page, template)
        expect(page.locator("#draft-status")).to_contain_text("메모리")
        assert template["metadata"]["name"] not in stored(page)

    annotation = "kubectl.kubernetes.io/last-applied-configuration"
    annotated = config("annotations", "ordinary-draft")
    annotated["metadata"]["annotations"] = {annotation: json.dumps(config("old", "ordinary"))}
    apply(page, annotated)
    saved(page, "ordinary-draft")
    annotated["metadata"]["annotations"][annotation] = json.dumps(route)
    apply(page, annotated)
    expect(page.locator("#draft-status")).to_contain_text("메모리")
    page.wait_for_function(f"async () => !JSON.stringify(await ({READ_DRAFTS})()).includes('ordinary-draft')")
    assert "synthetic-route-marker" not in stored(page)
    old = {"items": [{"id": "route-route-openshift-io-v1", "M": route},
                     {"id": "configmap-v1", "M": config("legacy", "legacy-preserved")}], "active": 1}
    page.evaluate("old => localStorage.setItem('apibook.sim.4.21', JSON.stringify(old))", old)
    page.reload()
    expect(page.locator("#sroot")).to_be_visible()
    assert "synthetic-route-marker" not in stored(page) + page.evaluate("JSON.stringify(localStorage)")

    # Upgrading an existing IndexedDB must also scrub inactive releases.
    page.evaluate("""() => new Promise((resolve, reject) => {
        const open = indexedDB.open('apibook.simulator');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, tx = db.transaction('drafts','readwrite');
            const data = {kind: 'SecretList', items: [{data: {example: 'synthetic-database-marker'}}]};
            const M = {apiVersion:'template.openshift.io/v1', kind:'Template', objects:[data]};
            tx.objectStore('drafts').put({items:[{id:'template-template-openshift-io-v1', M}], active:0}, 'apibook.sim.4.20');
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => reject(tx.error);
        };
    })""")
    page.reload()
    expect(page.locator("#sroot")).to_be_visible()
    assert "synthetic-database-marker" not in stored(page)

    review = {"kind": "SelfSubjectAccessReview", "apiVersion": "authorization.k8s.io/v1",
              "spec": {"resourceAttributes": {"verb": "get", "resource": "pods"}}}
    apply(page, review)
    expect(page.locator("#import-report")).to_contain_text("검증 통과")
    expect(page.locator(".simyaml")).not_to_contain_text("metadata:")

    page.goto(root + "#4.21/sim")
    expect(page.locator("#sroot")).to_be_visible()
    expect(page.locator(".simyaml")).to_contain_text("legacy-preserved")
    saved(page, "legacy-preserved")
    assert page.evaluate("localStorage.getItem('apibook.sim.4.21')") is None

    page.goto(root + "#5.0/compare:from=4.22&to=5.0&tab=same")
    page.locator("#cq").fill("Image")
    expect(page.locator('[data-ctab="same"]')).to_contain_text("구조 동일")
    row = page.locator('#cres li:has(> a.row[href*="image-config-openshift-io"])').first
    row.locator("summary").click()
    expect(row).to_contain_text("1024")
    page.locator(".impact summary").click()
    manifest = {"apiVersion": "batch/v1", "kind": "CronJob", "metadata": {"name": "impact-only", "namespace": "default"}}
    field = page.locator("#impact-yaml")
    field.fill(json.dumps(manifest) + "\n---\nkind: &anchor X")
    page.locator("#impact-form button").click()
    result = page.locator("#impact-form output")
    expect(result).to_contain_text("4.22 통과 → 5.0 오류")
    expect(result).to_contain_text("새로 발생")
    expect(result).to_contain_text("spec")
    expect(result).to_contain_text("문서 2")
    page.locator("#ct").select_option("4.22")
    expect(result).to_be_empty()
    expect(page.locator("#impact-form button")).to_be_disabled()
    page.locator("#cf").select_option("5.0")
    page.locator("#impact-form button").click()
    expect(result).to_contain_text("해소")
    field.fill(" ")
    expect(result).to_be_empty()
    assert "impact-only" not in stored(page) + page.evaluate("JSON.stringify(localStorage)")


def check_draft_recovery(browser, entry):
    root = entry.resolve().as_uri()
    key = "apibook.sim.5.0"
    context = browser.new_context()
    try:
        page = context.new_page()
        page.goto(root + "#5.0/sim")
        expect(page.locator("#sroot")).to_be_visible()

        def draft(name, value):
            return {"id": "configmap-v1", "M": {"apiVersion": "v1", "kind": "ConfigMap",
                    "metadata": {"name": name}, "data": {"value": value}}}

        def put_legacy(items):
            page.evaluate("([key, items]) => localStorage.setItem(key, JSON.stringify({items, active: 0}))", [key, items])

        current = [draft("primary", "current-one"), draft("second", "current-two")]
        page.locator("#sform").get_by_role("button", name="YAML 가져오기").click()
        page.locator("#imptxt").fill(json.dumps([it["M"] for it in current]))
        page.locator("#imp button").click()
        saved(page, "current-two")
        page.locator("#rtabs .rt").filter(has_text="second").click()
        page.wait_for_function(f"""async () => (await ({READ_DRAFTS})()).some(s =>
            s.items[s.active]?.M.metadata?.name === 'second')""")
        page.reload()
        expect(page.locator(".simyaml")).to_contain_text("current-two")

        # A returning user can have a newer database and a second, older editor writing localStorage.
        same_content = {**current[1], "M": dict(reversed(current[1]["M"].items()))}
        legacy = [same_content, draft("primary", "older-edit"), draft("legacy-only", "recovered-draft")]
        # An interrupted migration must keep the old copy until the database commit succeeds.
        page.add_init_script("""const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function(value, key) {
                if (key === 'apibook.sim.5.0' && sessionStorage.getItem('abort-migration')) {
                    sessionStorage.removeItem('abort-migration');
                    this.transaction.abort();
                    return;
                }
                return put.apply(this, arguments);
            };""")
        put_legacy(legacy)
        page.evaluate("sessionStorage.setItem('abort-migration', 'once')")
        page.reload()
        expect(page.locator("#storage-note")).to_contain_text("메모리")
        expect(page.locator("#sroot")).to_be_visible()
        assert page.evaluate("key => JSON.parse(localStorage.getItem(key)).items.length", key) == len(legacy)
        assert "recovered-draft" not in stored(page)

        for _ in range(2):
            put_legacy(legacy)
            page.reload()
            expect(page.locator(".simyaml")).to_contain_text("current-two")
            rows = page.evaluate(READ_DRAFTS)[0]["items"]
            values = sorted(it["M"]["data"]["value"] for it in rows if it["id"] == "configmap-v1")
            assert values == ["current-one", "current-two", "older-edit", "recovered-draft"], values
            assert page.evaluate("key => localStorage.getItem(key)", key) is None
    finally:
        context.close()

    blocked = browser.new_context()
    try:
        blocked.add_init_script("""Object.defineProperty(window, 'indexedDB', {get() {
            throw new DOMException('Storage disabled', 'SecurityError');
        }});""")
        page = blocked.new_page()
        page.goto(root + "#5.0/sim")
        expect(page.locator("#sroot")).to_be_visible()
        expect(page.locator("#autosave")).to_be_disabled()
        expect(page.locator(".simyaml")).to_contain_text("apiVersion")
    finally:
        blocked.close()


def check_release(page, version):
    def sidebar(selector):
        if page.locator("#menubtn").is_visible() and not page.locator("body.nav-open").count():
            page.locator("#menubtn").click()
        link = page.locator("#side " + selector)
        navigates = link.evaluate("a => a.matches('a.navitem, a.sideitem')")
        changes_page = navigates and link.evaluate("a => a.hash !== location.hash")
        old_page = page.locator("#main > .page").element_handle() if changes_page else None
        link.click()
        if old_page:
            old_page.wait_for_element_state("hidden")
            old_page.dispose()
        if navigates and page.locator("#menubtn").is_visible():
            expect(page.locator("#menubtn")).to_have_attribute("aria-expanded", "false")

    def menu(name):
        sidebar(f'[data-nav="{name}"]')
        expect(page.locator(f'#side [data-nav="{name}"]')).to_have_attribute("aria-current", "page")

    if page.locator("#ver").input_value() != version:
        page.locator("#ver").select_option(version)
    names = page.locator("#side [data-nav]").evaluate_all("(nodes) => nodes.map(n => n.dataset.nav)")
    assert set(names) == {"home", "browse", "topology", "sim", "compare", "guide"}, names
    menu("home")
    expect(page.locator("main h1")).to_be_visible()
    menu("browse")
    if page.locator("#menubtn").is_visible():
        menu("browse")  # Selecting the current route must also dismiss the drawer.
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
        context = browser.new_context(viewport={"width": 390 if args.mobile else 1440, "height": 900}, reduced_motion="reduce")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(args.entry.resolve().as_uri())
        expect(page.locator("#side [data-nav]")).to_have_count(6)
        for version in page.locator("#ver option").evaluate_all("(nodes) => nodes.map(n => n.value)"):
            print(json.dumps(check_release(page, version), ensure_ascii=True), flush=True)
            assert not errors, errors
        check_languages(page, args.entry)
        check_palette(page)
        check_dashboard(page, args.entry)
        check_settings_reset(page, args.entry)
        check_workspace_features(page, args.entry)
        check_review_regressions(page, args.entry)
        check_draft_recovery(browser, args.entry)
        if args.entry.resolve() == Path(__file__).resolve().parents[1] / "index.html":
            with local_site(args.entry) as origin:
                for lang in ("ko", "en"):
                    check_startup(browser, origin, lang)
        assert not errors, errors
        browser.close()
