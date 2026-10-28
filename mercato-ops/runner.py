#!/usr/bin/env python3
"""Read-only OpenCart bridge runner. Never writes to the store."""
import datetime as dt
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
REQUESTS = BASE / "requests"
RESULTS = BASE / "results"
ALLOWED_ACTIONS = {"health", "version", "product_search", "product_read", "product_audit_list", "content_read"}
ALLOWED_HOST = "mercato.com.ua"
MAX_BYTES = 512_000


def integer(value, default, lower, upper):
    try:
        v = int(value)
    except (TypeError, ValueError):
        v = default
    return max(lower, min(upper, v))


def same_store_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST:
        raise ValueError("Product URL must use https://mercato.com.ua")
    return value[:500]


def build_params(request):
    action = request.get("action")
    if action not in ALLOWED_ACTIONS:
        raise ValueError("Action not in read-only allowlist")
    supplied = request.get("params", {})
    if not isinstance(supplied, dict):
        raise ValueError("params must be an object")
    args = {"action": action}
    if action == "product_search":
        q = str(supplied.get("q", "")).strip()
        if not 1 <= len(q) <= 100:
            raise ValueError("q is required (1-100 characters)")
        args.update(q=q, limit=integer(supplied.get("limit"), 8, 1, 20))
    elif action == "product_read":
        product_id = integer(supplied.get("product_id"), 0, 0, 2_000_000_000)
        if product_id:
            args["product_id"] = product_id
        elif supplied.get("url"):
            args["url"] = same_store_url(str(supplied["url"]))
        elif supplied.get("slug"):
            args["slug"] = str(supplied["slug"])[:150]
        else:
            raise ValueError("product_id, URL or slug is required")
    elif action == "product_audit_list":
        args.update(page=integer(supplied.get("page"), 1, 1, 1000),
                    limit=integer(supplied.get("limit"), 30, 1, 100))
    elif action == "content_read":
        content_type = supplied.get("type", "product")
        if content_type not in {"product", "category", "information"}:
            raise ValueError("type must be product, category or information")
        args["type"] = content_type
        item_id = integer(supplied.get("id"), 0, 0, 2_000_000_000)
        if item_id:
            args["id"] = item_id
        elif supplied.get("url"):
            args["url"] = same_store_url(str(supplied["url"]))
        elif supplied.get("slug"):
            args["slug"] = str(supplied["slug"])[:150]
        else:
            raise ValueError("id, URL or slug is required")
    return args


def fetch_json(params):
    base_url = os.environ.get("BRIDGE_URL", "https://mercato.com.ua/mercato-bridge.php")
    secret = os.environ.get("BRIDGE_SECRET", "")
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_HOST or parsed.path != "/mercato-bridge.php":
        raise ValueError("BRIDGE_URL must be https://mercato.com.ua/mercato-bridge.php")
    if not secret:
        raise ValueError("BRIDGE_SECRET GitHub Actions secret is missing")
    query = urllib.parse.urlencode(dict(params, secret=secret))
    url = base_url + "?" + query
    req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json", "User-Agent": "Mercato-GH-ReadOnly/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("Bridge response exceeded size limit")
            data = json.loads(body.decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")
            return data
    except urllib.error.HTTPError as e:
        raise ValueError("Bridge HTTP status {}".format(e.code))
    except urllib.error.URLError:
        raise ValueError("Bridge network/SSL connection failed")


def execute_request(file):
    request_id = file.stem
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,60}", request_id):
        return
    dest = RESULTS / (request_id + ".json")
    if dest.exists():
        return
    timestamp = dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        request = json.loads(file.read_text(encoding="utf-8"))
        if not isinstance(request, dict):
            raise ValueError("Request must be an object")
        params = build_params(request)
        result = fetch_json(params)
        output = {"request_id": request_id, "action": params["action"], "ok": "error" not in result, "read_only": True, "at": timestamp, "data": result}
    except (ValueError, json.JSONDecodeError, UnicodeError) as error:
        output = {"request_id": request_id, "ok": False, "read_only": True, "at": timestamp, "error": str(error)[:300]}
    except Exception:
        output = {"request_id": request_id, "ok": False, "read_only": True, "at": timestamp, "error": "Unexpected failure (credentials not logged)"}
    dest.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("{}: {}".format(request_id, "ok" if output["ok"] else "failed"))


def main():
    REQUESTS.mkdir(exist_ok=True)
    RESULTS.mkdir(exist_ok=True)
    pending = [file for file in sorted(REQUESTS.glob("*.json")) if not (RESULTS / file.name).exists()]
    for file in pending[:25]:
        execute_request(file)
    if len(pending) > 25:
        print("More pending requests; run workflow again")


if __name__ == "__main__":
    main()
