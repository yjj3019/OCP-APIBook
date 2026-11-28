# SPDX-License-Identifier: Apache-2.0
"""Exercise request targets and invalid resource links in a disposable browser profile."""
import argparse
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def invalid_link(page, root):
    target = root + "#5.0/sim:no-such-fixture-resource"
    page.goto(target)
    panel = page.locator("#sim-missing")
    expect(panel.get_by_role("heading")).to_contain_text("리소스를 찾을 수 없습니다")
    expect(panel.locator("code")).to_have_text("5.0 / no-such-fixture-resource")
    expect(panel.get_by_role("link", name="API 찾아보기")).to_have_attribute("href", "#5.0/browse")
    expect(page.locator("#sform, .simyaml, #simres")).to_have_count(0)
    expect(page).to_have_url(target)
    panel.get_by_role("link", name="시뮬레이터 열기").click()
    expect(page.locator(".simyaml code")).to_be_visible()


def check(page, root):
    invalid_link(page, root)
    page.goto(root + "#5.0/sim:configmap-v1")
    expect(page.locator("#obody")).to_contain_text("oc apply -f configmap.yaml")
    page.get_by_role("button", name="YAML 가져오기").click()
    manifest = {"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"generateName": "qa-prefix-"},
                "data": {"fixture": "saved-qa-draft"}}
    page.locator("#imptxt").fill(json.dumps(manifest))
    page.locator("#imp button").click()
    expect(page.locator(".simyaml code")).to_contain_text("saved-qa-draft")
    expect(page.locator("#obody")).not_to_contain_text("oc apply")
    page.locator("#otabs [data-t=req]").click()
    operation = page.locator("#o-op")
    status = page.locator("#simres .statusline b")
    expect(status).to_have_text("201")
    expect(page.locator("#simres .simreq").nth(1)).to_contain_text("qa-prefix-x7k2p")
    for op in ("get", "replace", "patch", "delete"):
        operation.select_option(op)
        expect(page.locator("#simres")).to_contain_text("리소스 이름이 필요합니다")
        expect(page.locator("#simres .simreq, #simres .statusline, #simres details")).to_have_count(0)
    page.locator("#o-name").fill("qa-target")
    expect(status).to_have_text("200")
    expect(page.locator("#simres .simreq").first).to_contain_text("configmaps/qa-target")
    expect(page.locator("#simres details")).to_contain_text("oc delete")
    page.locator("#o-name").fill("   ")
    expect(page.locator("#simres details")).to_have_count(0)
    page.locator("#o-name").fill("qa-target")

    page.locator("#otabs [data-t=yaml]").click()
    invalid_link(page, root)
    expect(page.locator(".simyaml code")).to_contain_text("saved-qa-draft")
    reset = page.get_by_role("button", name="폼 값 초기화")
    expect(reset).to_have_attribute("title", "요청 설정은 유지됩니다.")
    reset.click()
    expect(page.locator(".simyaml code")).not_to_contain_text("saved-qa-draft")
    page.locator("#otabs [data-t=req]").click()
    expect(operation).to_have_value("delete")
    expect(page.locator("#o-name")).to_have_value("qa-target")

    page.goto(root + "#5.0/sim:tokenreview-authentication-k8s-io-v1")
    expect(page.locator("#obody")).to_contain_text("이 리소스가 지원하는 작업")
    expect(page.locator("#obody")).not_to_contain_text("oc apply")
    page.locator("#otabs [data-t=req]").click()
    expect(operation.locator("option")).to_have_count(1)
    expect(operation).to_have_value("create")
    page.locator("#o-name").fill("qa-target")
    expect(operation.locator("option")).to_have_count(1)

    for resource in ("eviction-policy-v1", "scale-autoscaling-v1"):
        page.goto(root + "#5.0/sim:" + resource)
        expect(page.locator("#obody")).to_contain_text("이 리소스가 지원하는 작업")
        expect(page.locator("#obody")).not_to_contain_text("oc apply")
    page.goto(root + "#5.0/sim:configmap-v1")
    expect(page.locator("#obody")).to_contain_text("oc apply")
    page.locator("#allres").check()
    expect(page.locator("#obody")).to_contain_text("이 리소스가 지원하는 작업")
    expect(page.locator("#obody")).not_to_contain_text("oc apply")

    page.goto(root + "#4.20/sim:deviceclass-resource-k8s-io-v1")
    expect(page.locator("#sim-missing code")).to_have_text("4.20 / deviceclass-resource-k8s-io-v1")
    expect(page.locator("#sform")).to_have_count(0)


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--entry", type=Path, default=Path(__file__).resolve().parents[1] / "index.html")
    args.add_argument("--channel", default="chrome")
    options = args.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=options.channel)
        try:
            page = browser.new_page(locale="ko-KR")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            check(page, options.entry.resolve().as_uri())
            assert not errors, errors
            print("Simulator target and draft recovery checks passed")
        finally:
            browser.close()
