#!/usr/bin/env python3
"""Push the AgentGate tree to fracbitcoin-web/agentgate via the Git Data API.

Uses the custom.github-nonaxon connector credential flow (surrogate token,
swapped by Muse for approved api.github.com requests only). Excludes
node_modules, artifacts and the deploy/ folder (holds the deployer key).
"""
import base64
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

BASE = "https://api.github.com"
CONN = "custom.github-nonaxon"
REPO = "fracbitcoin-web/agentgate"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FILES = [
    "README.md",
    "package.json",
    ".gitignore",
    "contracts/AgentGate.sol",
    "contracts/MockAgentID.sol",
    "docs/index.html",
    "docs/app.js",
    "scripts/compile.js",
    "scripts/deploy.js",
    "scripts/push_github.py",
    "test/test.js",
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("redirect refused")


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "Content-Type": "application/json"},
    )
    add_surrogate_to_request(req, CONN, allowed_hosts=["api.github.com"])
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=60) as r:
        return read_json_response(r)


def check_gate_address():
    """Fail closed: never publish a front end whose GATE_ADDRESS is not bound
    to the deployment record. With no deployment on record, GATE_ADDRESS must
    still be null; once deploy/deployment.json exists, GATE_ADDRESS must match
    it exactly and GATE_DEPLOYED must be true."""
    with open(os.path.join(ROOT, "docs", "app.js")) as f:
        app = f.read()
    m = re.search(r'const GATE_ADDRESS = (null|"(0x[0-9a-fA-F]{40})");', app)
    if not m:
        sys.exit("GATE_ADDRESS line missing or malformed in docs/app.js; refusing to publish")
    gate = m.group(2)
    dep_path = os.path.join(ROOT, "deploy", "deployment.json")
    if os.path.exists(dep_path):
        with open(dep_path) as f:
            deployed = json.load(f)["address"]
        if gate is None:
            sys.exit("A deployment exists in deploy/deployment.json but GATE_ADDRESS is null "
                     "in docs/app.js; refusing to publish")
        if gate.lower() != deployed.lower():
            sys.exit(f"GATE_ADDRESS {gate} does not match deployment record {deployed}; "
                     "refusing to publish")
        if not re.search(r"const GATE_DEPLOYED = true;", app):
            sys.exit("GATE_DEPLOYED is not true in docs/app.js although a deployment exists; "
                     "refusing to publish")
        print("gate address check: GATE_ADDRESS matches deploy/deployment.json")
    elif gate is not None:
        sys.exit("GATE_ADDRESS is set in docs/app.js but no deploy/deployment.json exists; "
                 "refusing to publish")


def main():
    check_gate_address()
    ref = call("GET", f"/repos/{REPO}/git/refs/heads/main")
    parent = ref["object"]["sha"]
    commit = call("GET", f"/repos/{REPO}/git/commits/{parent}")
    base_tree = commit["tree"]["sha"]
    print("parent commit:", parent)

    tree_items = []
    for rel in FILES:
        with open(os.path.join(ROOT, rel), "rb") as f:
            content = base64.b64encode(f.read()).decode()
        blob = call("POST", f"/repos/{REPO}/git/blobs", {"content": content, "encoding": "base64"})
        tree_items.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("blob:", rel)
    tree = call("POST", f"/repos/{REPO}/git/trees", {"base_tree": base_tree, "tree": tree_items})
    new_commit = call("POST", f"/repos/{REPO}/git/commits", {
        "message": "AgentGate: audit run-1 fixes — validated setAgentId, deploy provenance + GATE_ADDRESS binding, wallet session rebind, closeList UI",
        "tree": tree["sha"], "parents": [parent],
    })
    call("PATCH", f"/repos/{REPO}/git/refs/heads/main", {"sha": new_commit["sha"]})
    print("pushed commit:", new_commit["sha"])


if __name__ == "__main__":
    main()
