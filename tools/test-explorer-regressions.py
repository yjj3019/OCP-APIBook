# SPDX-License-Identifier: Apache-2.0
"""Exercise catalog-backed command examples, browse pagination, and compare history offline."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ENTRY = (ROOT / "index.html").as_uri()


def read_catalog(file, marker):
    text = (ROOT / "data" / file).read_text(encoding="utf-8")
    return json.JSONDecoder().raw_decode(text.split(marker, 1)[1].lstrip())[0]


def open_commands(page, version, api):
    page.goto(f"{ENTRY}#{version}/api:{api['id']}")
    expect(page.locator("#codeb")).to_contain_text(f"kind: {api['kind']}")
    page.locator("#ctab1").click()
    return [s for s in page.locator("#codeb").inner_text().splitlines() if s.startswith("oc ")]


def check_commands(page, versions):
    checked = 0
    for version in versions:
        apis = read_catalog(version + ".js", f'["{version}"]=')["apis"]
        for api in apis:
            detail = api.get("d") or {}
            paths = detail.get("eps", [])
            methods = {op["m"] for path in paths for op in path["ms"]}
            if methods != {"POST"}:
                continue
            commands = open_commands(page, version, api)
            verbs = [s.split()[1] for s in commands]
            assert verbs.count("create") == 1 and set(verbs) <= {"create", "explain"}, (version, api["id"], commands)
            create = next(s for s in commands if s.startswith("oc create "))
            if all("/{name}/" in path["p"] for path in paths):
                # Generic manifest creation cannot address a parent's named subresource.
                assert " --raw " in create and create.endswith(".json"), create
                assert any(path["p"].replace("{name}", "<이름>").replace("{namespace}", "<네임스페이스>") in create
                           for path in paths), create
            else:
                assert create == "oc create -f " + api["kind"].lower() + ".yaml", create
            checked += 1
        pod = next(api for api in apis if api["kind"] == "Pod" and not api["group"])
        commands = open_commands(page, version, pod)
        for verb in ("get", "explain", "apply", "edit", "delete"):
            assert any(s.startswith("oc " + verb + " ") for s in commands), (version, verb)
        assert "oc apply --dry-run=server -f pod.yaml" in commands
        checked += 1
        scale = next(api for api in apis if api["kind"] == "Scale" and api["group"] == "autoscaling")
        commands = open_commands(page, version, scale)
        assert any(s.startswith("oc get --raw ") and "/scale" in s for s in commands), commands
        assert any(s.startswith("oc replace --raw ") and "/scale" in s for s in commands), commands
        assert not any(s.startswith(("oc edit ", "oc apply ")) for s in commands), commands
        checked += 1
    return checked


def check_more(page, version):
    page.goto(f"{ENTRY}#{version}/browse")
    rows, more = page.locator("#bl .row"), page.locator("#bm #more")
    expect(rows).to_have_count(60)
    total = int(page.locator("#bc b").inner_text())
    while rows.count() < total:
        before = rows.count()
        assert int(re.search(r"\d+", more.inner_text()).group()) == min(120, total - before)
        more.click()
        expect(rows).to_have_count(min(before + 120, total))
    expect(more).to_have_count(0)
    page.locator("#bq").fill("qnotfoundzz991")
    expect(rows).to_have_count(0)
    expect(more).to_have_count(0)


def check_compare(page, version):
    compare_url = f"{ENTRY}#{version}/compare:from=4.22&to=5.0&tab="
    page.goto(compare_url + "changed")
    query, rows = page.locator("#cq"), page.locator("#cres a.row")
    query.fill("CronJob")
    expect(rows).to_have_count(1)
    shared = compare_url + "changed&q=CronJob"
    expect(page).to_have_url(shared)
    rows.click()
    expect(page.locator("#codeb")).to_contain_text("kind: CronJob")
    page.go_back()
    expect(query).to_have_value("CronJob")
    expect(rows).to_have_count(1)
    page.locator('[data-ctab="added"]').click()
    page.locator("#cf").select_option("4.21")
    page.go_back()
    expect(page.locator("#cf")).to_have_value("4.22")
    expect(page.locator('[data-ctab="added"]')).to_have_attribute("aria-pressed", "true")
    page.go_back()
    expect(page.locator('[data-ctab="changed"]')).to_have_attribute("aria-pressed", "true")
    expect(rows).to_have_count(1)
    page.go_forward()
    expect(page.locator('[data-ctab="added"]')).to_have_attribute("aria-pressed", "true")
    special_query = " a+b & 한글%=#:/ "
    query.fill(special_query)
    # Chromium can report the same-document navigation after fill() returns.
    expect(page).to_have_url(compare_url + "added&q=" + quote(special_query, safe=""))
    page.reload()
    expect(query).to_have_value(special_query)
    expect(rows).to_have_count(0)
    query.fill("")
    expect(page).to_have_url(compare_url + "added")
    page.goto(shared)
    expect(rows).to_have_count(1)
    expect(query).to_have_value("CronJob")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channel", help="Installed browser channel, e.g. chrome or msedge")
    args = parser.parse_args()
    versions = read_catalog("merged.js", "window.MERGED=")["list"]
    with sync_playwright() as playwright:
        with playwright.chromium.launch(channel=args.channel) as browser:
            page = browser.new_page()
            page.route(re.compile(r"^https?://"), lambda route: route.abort())
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            count = check_commands(page, versions)
            for version in versions:
                check_more(page, version)
                check_compare(page, version)
            assert not errors, errors
            print(f"{count} command examples, pagination and comparison history for {len(versions)} releases passed")
