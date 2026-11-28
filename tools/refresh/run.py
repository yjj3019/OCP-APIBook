# SPDX-License-Identifier: MIT
"""Refresh the catalog from the versioned sources of the published API books."""
import html
import http.client
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CACHE = ROOT / "_scrape"
REPO = "openshift/openshift-docs"
SOURCES = json.loads((HERE / "sources.json").read_text(encoding="utf8"))


def download(url, destination):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as response, destination.open("wb") as out:
                shutil.copyfileobj(response, out)
                length = response.headers.get("Content-Length")
                if length and out.tell() != int(length):
                    raise OSError(f"Incomplete download from {url}")
            return
        except (OSError, http.client.HTTPException):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def snapshot(source, work):
    branch = source["branch"]
    meta = work / "commit.json"
    download(f"https://api.github.com/repos/{REPO}/commits/{branch}", meta)
    commit = json.loads(meta.read_bytes())
    sha = commit["sha"]
    if not re.fullmatch("[0-9a-f]{40}", sha):
        raise ValueError(f"Invalid revision for {branch}")
    dest = CACHE / "sources" / sha
    if not dest.exists():
        stage = work / sha
        stage.mkdir()
        archive = work / "docs.tgz"
        download(f"https://codeload.github.com/{REPO}/tar.gz/{sha}", archive)
        with tarfile.open(archive) as tar:
            files = {m.name.partition("/")[2]: m for m in tar if m.isfile()}
            selected = {n for n in files if re.fullmatch(r"rest_api/[\w-]+/[\w.-]+\.adoc", n)}
            selected.add("_topic_maps/_topic_map.yml")
            assembly = [n for n in selected if n.startswith("rest_api/overview/")]
            while assembly:
                name = assembly.pop()
                body = tar.extractfile(files[name]).read().decode()
                for inc in re.findall(r"^include::([^\[]+)\[", body, re.M):
                    if not re.fullmatch(r"(modules|_attributes)/[\w-]+\.adoc", inc):
                        raise ValueError(f"Unexpected guide include {inc} in {name}")
                    if inc not in selected:
                        selected.add(inc)
                        assembly.append(inc)
            for name in sorted(selected, key=lambda n: files[n].offset):
                out = stage / name
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(tar.extractfile(files[name]).read())
        dest.parent.mkdir(exist_ok=True)
        stage.rename(dest)
    return dest, sha, commit["commit"]["committer"]["date"]


def plain(value):
    value = re.sub(r"xref:[^\s\[]+\[([^]]*)\]", r"\1", value)
    value = html.unescape(value.replace("\x60", "").replace(r"\|", "|"))
    return re.sub(r"(?<=[A-Za-z])'(?=[A-Za-z])", "’", value).strip()


def tables(body):
    # openshift-apidocs-gen emits one cell per line and a one-line header.
    for match in re.finditer(r"(?:^\.([^\n]+)\n)?^\[cols=[^\n]+\n\|===\n([^\n]+)\n(.*?)^\|===[ \t]*$", body, re.M | re.S):
        name, header, rows = match.groups()
        width = header.count("|")
        cells = re.split(r"^\|[ \t]?", rows, flags=re.M)
        if cells.pop(0).strip() or width < 2 or len(cells) % width:
            raise ValueError(f"Malformed table: {header}")
        values = [plain(" ".join(c.split())) for c in cells]
        yield name or "", [values[i:i + width] for i in range(0, len(values), width)]


def metadata(body):
    desc = re.search(r"^Description::\n\+\n--\n(.*?)^--[ \t]*$", body, re.S | re.M)
    ty = re.search(r"^Type::\s*\n[ \t]+([^\n]+)", body, re.M)
    req = re.search(r"^Required::\n((?:[ \t]+- [^\n]+\n?)+)", body, re.M)
    # Wrapped AsciiDoc lines form a paragraph. Only blank lines break a paragraph.
    paragraphs = re.split(r"\n\s*\n", desc[1].strip()) if desc else []
    return ("\n".join(plain(" ".join(p.split())) for p in paragraphs), plain(ty[1]) if ty else "",
            [plain(v) for v in re.findall(r"^\s*- (.+)$", req[1], re.M)] if req else [])


def sections(body):
    chunks = re.split(r"^=== (.+)\n", body, flags=re.M)
    return chunks[0], zip(chunks[1::2], chunks[2::2])


def parse_api(text, params):
    head, spec = text.split("\n== Specification\n", 1)
    spec, endpoints = spec.split("\n== API endpoints\n", 1) if "\n== API endpoints\n" in spec else (spec, "")
    desc, ty, required = metadata(head)
    root, fields = sections(spec)
    rows = next(tables(root), ("", []))[1]
    if not desc or not ty or not rows:
        raise ValueError("Missing API description or specification")
    api = dict(desc=desc, type=ty, required=required,
               props=[dict(n=n, t=t, d=d) for n, t, d in rows], fields=[], eps=[])
    for path, body in fields:
        d, t, q = metadata(body)
        api["fields"].append(dict(p=plain(path), t=t, q=q, d=d, r=next(tables(body), ("", []))[1]))
    summary, paths = sections(endpoints)
    for path, body in paths:
        methods = []
        preamble, *method_blocks = re.split(r"^HTTP method::\n", body, flags=re.M)
        common = dict(tables(preamble)).get("Global query parameters", [])
        for method in method_blocks:
            m = plain(method.splitlines()[0])
            d = re.search(r"^Description::\s*\n[ \t]+([^\n]+)", method, re.M)
            tags = dict(tables(method))
            if not re.fullmatch("[A-Z]+", m) or not d or not tags.get("HTTP responses"):
                raise ValueError(f"Incomplete method details for {path}")
            query = {row[0]: row for row in [*common, *tags.get("Query parameters", [])]}
            for n, t, description in query.values():
                params.setdefault(n, [t, description])
            body_rows = tags.get("Body parameters", [])
            methods.append(dict(m=m, d=plain(d[1]) if d else "", q=list(query),
                                b=body_rows[0][1] if body_rows else "", r=tags.get("HTTP responses", [])))
        if not methods:
            raise ValueError(f"Missing methods for {path}")
        api["eps"].append(dict(p=path, ms=methods))
    listed = re.findall(r"^\* \x60([^\x60]+)\x60", summary, re.M)
    verbs = re.findall(r"^- \x60([A-Z]+)\x60:", summary, re.M)
    if not listed or listed != [e["p"] for e in api["eps"]] or verbs != [
        m["m"] for e in api["eps"] for m in e["ms"]
    ]:
        raise ValueError("Endpoint summary and detail paths disagree")
    return api


def collect(version, source, work):
    folder, sha, date = snapshot(source, work)
    prefix = f"https://github.com/{REPO}/blob/{source['branch']}/"
    index_path = source["index"].removeprefix(prefix)
    if not re.fullmatch(r"rest_api/[\w-]+/[\w-]+\.adoc", index_path):
        raise ValueError(f"Invalid source index: {source['index']}")
    index = (folder / index_path).read_text(encoding="utf8")
    rows = re.findall(r"^\| xref:\.\./([\w-]+)/([\w-]+)\.adoc#([\w-]+)\[([\w]+)\]\s*\n\| ([\w./-]+)[ \t]*$", index, re.M)
    if not rows or len(rows) != index.count("xref:"):
        raise ValueError(f"{version}: incomplete API index")
    reference = source["overview"].split("/api_overview/")[0]
    result = dict(index=[], apis={}, params={}, completeText=True,
                  source=dict(**source, revision=sha, revisionDate=date))
    for book, filename, anchor, kind, gv in rows:
        url = f"{reference}/{book}/index#{anchor}"
        result["index"].append(dict(url=url, kind=kind, gv=gv))
        if anchor in result["apis"]:
            continue
        text = (folder / f"rest_api/{book}/{filename}.adoc").read_text(encoding="utf8")
        if f'[id="{anchor}"]' not in text or f"\n= {kind} [{gv}]\n" not in text:
            raise ValueError(f"{version}: index and chapter disagree at {anchor}")
        try:
            result["apis"][anchor] = parse_api(text, result["params"])
        except ValueError as exc:
            raise ValueError(f"{version} {filename}: {exc}") from exc
    guide = subprocess.check_output(["node", str(HERE / "guide.cjs"), str(folder), version, source["overview"]])
    result["guide"] = json.loads(guide)
    result["source"]["books"] = sorted({r["url"].split("#")[0] for r in result["index"]})
    dest = work / f"v{version}.json"
    dest.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"{version}: {len(result['apis'])} APIs at {sha[:12]}", flush=True)


def main():
    CACHE.mkdir(exist_ok=True)
    lock = CACHE / "refresh.lock"
    # OS locks are released on process exit, including a forcibly stopped refresh.
    # Keep the inode in place so concurrent runs always lock the same file.
    with lock.open("a+b") as owner:
        owner.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(owner.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(dir=CACHE) as temporary:
            work = Path(temporary)
            for version, source in SOURCES.items():
                collect(version, source, work)
            env = dict(os.environ, OCP_API_SNAPSHOT=str(work), OCP_API_PUBLISH_SNAPSHOT="1")
            subprocess.run(["node", "build.js"], cwd=ROOT, env=env, check=True)


if __name__ == "__main__":
    main()
