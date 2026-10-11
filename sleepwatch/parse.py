"""Turn the text COROS MCP returns into one row per night (keyed by wake-up date)."""
import re
from datetime import datetime

DUR = re.compile(r"(?:(\d+)h)?\s*(?:(\d+)\s*min)?")


def minutes(text: str) -> int | None:
    m = DUR.fullmatch(text.strip())
    if not m or not any(m.groups()):
        return None
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


def _num(text: str) -> float | None:
    m = re.search(r"-?\d[\d,]*(?:\.\d+)?", text)
    return float(m.group().replace(",", "")) if m else None


def _blocks(text: str, header: re.Pattern) -> dict[str, str]:
    """Split text into {date: block} using a header regex whose group(1) is the date."""
    parts = header.split(text)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def parse_sleep(text: str) -> dict[str, dict]:
    nights = {}
    for d, block in _blocks(text, re.compile(r"^(\d{4}-\d{2}-\d{2})$", re.M)).items():
        kv = dict(re.findall(r"^([A-Za-z][^:\n]*?):\s*(.+)$", block, re.M))
        if "Sleep Score" not in kv:
            continue
        row = {
            "score": _num(kv["Sleep Score"]),
            "sleep_min": minutes(kv.get("Main Sleep (asleep)", kv.get("Main Sleep", ""))),
            "deep_pct": _num(kv.get("Deep Sleep Ratio", "")),
            "light_pct": _num(kv.get("Light Sleep Ratio", "")),
            "rem_pct": _num(kv.get("REM Ratio", "")),
            "awake_pct": _num(kv.get("Awake Ratio", "")),
            "awake_min": minutes(kv.get("Awake Time", "")),
            "awake_count": _num(kv.get("Awake Count (>5 min)", "0")),
            "naps_min": minutes(kv.get("Naps Total", "0 min")) or 0,
        }
        w = re.match(r"(\S+ \S+) - (\S+ \S+)", kv.get("Main Sleep Window", ""))
        if w:
            row["onset"] = datetime.strptime(w.group(1), "%Y-%m-%d %H:%M")
            row["wake"] = datetime.strptime(w.group(2), "%Y-%m-%d %H:%M")
        nights[d] = row
    return nights


def parse_hrv(text: str) -> dict[str, dict]:
    out = {}
    pat = re.compile(
        r"^(\d{4}-\d{2}-\d{2}):\n\s+HRV Avg: (\d+) ms — ([^\n]+)\n\s+Normal Range: (\d+) - (\d+) ms\n\s+Baseline: (\d+) ms",
        re.M,
    )
    for d, avg, ev, lo, hi, base in pat.findall(text):
        out[d] = {"hrv": int(avg), "hrv_eval": ev, "hrv_lo": int(lo), "hrv_hi": int(hi), "hrv_base": int(base)}
    return out


def parse_daily(text: str) -> dict[str, dict]:
    out = {}
    for d, block in _blocks(text, re.compile(r"^--- (\d{8}) ---$", re.M)).items():
        key = f"{d[:4]}-{d[4:6]}-{d[6:]}"
        row = {}
        if m := re.search(r"Steps: ([\d,]+)", block):
            row["steps"] = _num(m.group(1))
        if m := re.search(r"Calories: ([\d,]+) kcal", block):
            row["calories"] = _num(m.group(1))
        if m := re.search(r"Exercise: ([^\n|]+)", block):
            row["exercise_min"] = minutes(m.group(1))
        if m := re.search(r"Stress: Avg (\d+)", block):
            row["stress"] = int(m.group(1))
        if m := re.search(r"Sleep HR: Avg (\d+) bpm \| Min (\d+) bpm \| Max (\d+) bpm", block):
            row.update(sleep_hr=int(m.group(1)), sleep_hr_min=int(m.group(2)), sleep_hr_max=int(m.group(3)))
        out[key] = row
    return out


def parse_rhr(text: str) -> dict[str, dict]:
    return {d: {"rhr": int(v)} for d, v in re.findall(r"^(\d{4}-\d{2}-\d{2}): (\d+) bpm", text, re.M)}
