"""Shared HTTP, MCP, XLSX, cache, env, and fault-tolerant storage helpers."""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import subprocess
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any

from .config import CACHE_DIR, RAW_DIR, USER_ENV_FILE

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_env_file() -> dict[str, str]:
    vals: dict[str, str] = {}
    for candidate in (Path.cwd() / ".env", USER_ENV_FILE):
        if candidate.exists():
            for raw in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and v and k not in vals:
                    vals[k] = v
    return vals


_ENV_CACHE: dict[str, str] | None = None


def get_key(name: str, default: str = "") -> str:
    global _ENV_CACHE
    env_val = os.environ.get(name, "").strip()
    if env_val:
        return env_val
    if _ENV_CACHE is None:
        _ENV_CACHE = load_env_file()
    return _ENV_CACHE.get(name, default).strip()


def http_get_bytes(
    url: str,
    headers: dict[str, str] | None = None,
    timeout: int = 45,
    retries: int = 2,
    use_curl: bool = False,
    use_browser_ua: bool = True,
) -> bytes:
    hdrs: dict[str, str] = {}
    if use_browser_ua:
        hdrs["User-Agent"] = USER_AGENT
    if headers:
        hdrs.update(headers)

    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            if not use_curl:
                req = urllib.request.Request(url, headers=hdrs)
                try:
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        return resp.read()
                except urllib.error.HTTPError as exc:
                    if exc.code in (403, 429):
                        use_curl = True
                    else:
                        body = exc.read().decode("utf-8", errors="ignore")[:300]
                        raise RuntimeError(f"HTTP {exc.code} for {url}: {body}") from exc
                except Exception:
                    use_curl = True

            cmd = [
                "curl.exe" if os.name == "nt" else "curl",
                "-sSL",
                "--fail-with-body",
                "--max-time",
                str(timeout),
            ]
            for k, v in hdrs.items():
                cmd.extend(["-H", f"{k}: {v}"])
            cmd.append(url)
            proc = subprocess.run(cmd, capture_output=True, check=False)
            if proc.returncode != 0:
                err = (proc.stderr or proc.stdout).decode("utf-8", errors="ignore")[:350]
                raise RuntimeError(f"curl({proc.returncode}) {url}: {err}")
            return proc.stdout
        except Exception as exc:
            last_err = exc
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET failed after retries: {last_err}")


def http_post_json(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: int = 45,
) -> tuple[bytes, dict[str, str]]:
    hdrs = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "User-Agent": USER_AGENT,
    }
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=hdrs, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(), {k.lower(): v for k, v in resp.headers.items()}


def mcp_call(
    url: str,
    tool_name: str,
    arguments: dict[str, Any],
    extra_headers: dict[str, str] | None = None,
    timeout: int = 35,
    stateful: bool = False,
) -> Any:
    """Invoke a Streamable HTTP MCP server tool via JSON-RPC 2.0."""
    hdrs = dict(extra_headers or {})
    if stateful:
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "us-economy-atlas", "version": "1.0"},
            },
        }
        _, resp_hdrs = http_post_json(url, init_payload, headers=hdrs, timeout=timeout)
        sid = resp_hdrs.get("mcp-session-id")
        if sid:
            hdrs["mcp-session-id"] = sid

    call_payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    raw_bytes, _ = http_post_json(url, call_payload, headers=hdrs, timeout=timeout)
    text = raw_bytes.decode("utf-8", errors="ignore").strip()
    parsed: dict[str, Any] = {}
    if text.startswith("{"):
        parsed = json.loads(text)
    else:
        for line in text.splitlines():
            if line.startswith("data:"):
                try:
                    obj = json.loads(line[5:].strip())
                    if "result" in obj or "error" in obj:
                        parsed = obj
                except Exception:
                    continue
    if "error" in parsed:
        raise RuntimeError(f"MCP {tool_name} JSON-RPC error: {parsed['error']}")
    res = parsed.get("result", {})
    if res.get("isError"):
        msg = res.get("content", [{}])[0].get("text", "MCP tool error")
        raise RuntimeError(f"MCP {tool_name} error: {msg[:300]}")
    if res.get("structuredContent") is not None:
        return res["structuredContent"]
    content_items = res.get("content", [])
    if not content_items:
        return res
    txt = content_items[0].get("text", "")
    try:
        return json.loads(txt)
    except Exception:
        return txt


def download_cached(url: str, filename: str, ttl_hours: int = 168, timeout: int = 150) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / filename
    if target.exists() and target.stat().st_size > 0:
        age_h = (time.time() - target.stat().st_mtime) / 3600.0
        if age_h < ttl_hours:
            return target
    tmp = CACHE_DIR / f"{filename}.tmp"
    cmd = [
        "curl.exe" if os.name == "nt" else "curl",
        "-sSL",
        "--fail",
        "--max-time",
        str(timeout),
        "-A",
        USER_AGENT,
        "-o",
        str(tmp),
        url,
    ]
    proc = subprocess.run(cmd, capture_output=True, check=False)
    if proc.returncode != 0:
        if tmp.exists():
            tmp.unlink()
        err = proc.stderr.decode("utf-8", errors="ignore")[:350]
        raise RuntimeError(f"Download failed for {url}: {err}")
    tmp.replace(target)
    return target


def _col_ref_to_idx(ref: str) -> int:
    col = 0
    for ch in ref:
        if "A" <= ch <= "Z":
            col = col * 26 + (ord(ch) - ord("A") + 1)
        elif "a" <= ch <= "z":
            col = col * 26 + (ord(ch) - ord("a") + 1)
        else:
            break
    return max(0, col - 1)


def iter_xlsx_rows(path: Path):
    ns_uri = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    ns = {"s": ns_uri}
    v_tag = f"{{{ns_uri}}}v"
    t_tag = f"{{{ns_uri}}}t"
    with zipfile.ZipFile(path) as z:
        sst: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("s:si", ns):
                sst.append("".join(t.text or "" for t in si.findall(".//s:t", ns)))
        sheets = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
        if not sheets:
            return
        for _ev, elem in ET.iterparse(z.open(sheets[0]), events=("end",)):
            if elem.tag == f"{{{ns_uri}}}row":
                row_map: dict[int, str] = {}
                max_col = -1
                for idx_fb, c in enumerate(elem):
                    ref = c.attrib.get("r", "")
                    ci = _col_ref_to_idx(ref) if ref else idx_fb
                    max_col = max(max_col, ci)
                    ct = c.attrib.get("t", "")
                    if ct == "inlineStr":
                        t_el = c.find(f".//{t_tag}")
                        row_map[ci] = t_el.text if (t_el is not None and t_el.text) else ""
                    else:
                        v_el = c.find(v_tag)
                        if v_el is None or v_el.text is None:
                            row_map[ci] = ""
                        elif ct == "s":
                            row_map[ci] = sst[int(v_el.text)]
                        else:
                            row_map[ci] = v_el.text
                if max_col >= 0:
                    yield [row_map.get(i, "") for i in range(max_col + 1)]
                elem.clear()


def safe_float(val: Any) -> float | None:
    if val is None:
        return None
    s = str(val).strip().replace(",", "").replace("$", "").replace("%", "")
    if not s or s in (".", "-", "(D)", "(NA)", "(NM)", "(L)", "N/A", "null", "None"):
        return None
    try:
        num = float(s)
        if math.isnan(num) or math.isinf(num):
            return None
        return num
    except ValueError:
        return None


def safe_int(val: Any) -> int | None:
    f = safe_float(val)
    return int(round(f)) if f is not None else None


RAW_BUNDLE_PATH = RAW_DIR.parent / "state" / "raw_snapshots.tar.gz"


def unpack_raw_bundle() -> None:
    if not RAW_BUNDLE_PATH.exists():
        return
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with tarfile.open(RAW_BUNDLE_PATH, "r:gz") as tf:
        for member in tf.getmembers():
            if member.isfile() and member.name.endswith(".json") and "/" not in member.name and "\\" not in member.name:
                target = RAW_DIR / member.name
                if not target.exists():
                    src = tf.extractfile(member)
                    if src:
                        target.write_bytes(src.read())


def pack_raw_bundle() -> None:
    if not RAW_DIR.exists():
        return
    RAW_BUNDLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = RAW_BUNDLE_PATH.with_suffix(".tmp")
    with tarfile.open(tmp, "w:gz") as tf:
        for p in sorted(RAW_DIR.glob("*.json")):
            tf.add(p, arcname=p.name)
    tmp.replace(RAW_BUNDLE_PATH)


def save_raw(source_id: str, payload: dict[str, Any]) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    path = RAW_DIR / f"{source_id}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_raw(source_id: str) -> dict[str, Any] | None:
    path = RAW_DIR / f"{source_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json_clean(path: Path, data: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(
        data,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":") if compact else None,
        indent=None if compact else 2,
    )
    path.write_text(txt, encoding="utf-8")
