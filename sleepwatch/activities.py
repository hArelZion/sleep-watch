"""Workouts: parse COROS records/details and summarize FIT files (heart rate, movement, court map)."""
from __future__ import annotations

import io
import math
import re
from datetime import datetime

SPORT_HE = {
    "Tennis": "טניס", "Outdoor Run": "ריצה", "Indoor Run": "ריצה בפנים", "Cycling": "אופניים",
    "Indoor Cycling": "אופניים בפנים", "Strength": "כוח", "Jump Rope": "קפיצה בחבל", "Yoga": "יוגה",
    "Indoor Row": "חתירה", "Basketball": "כדורסל", "Boxing": "אגרוף", "Floor Climb": "עליית מדרגות",
    "Custom Indoor Other": "אימון בפנים", "Sport(9807)": "אימון אחר", "Hike": "הליכה בשטח",
    "Pool Swim": "שחייה", "Walk": "הליכה",
}


def _dur_s(text: str) -> int | None:
    parts = [int(p) for p in text.strip().split(":")]
    if not parts:
        return None
    while len(parts) < 3:
        parts.insert(0, 0)
    h, m, s = parts
    return h * 3600 + m * 60 + s


def parse_records(text: str) -> list[dict]:
    """querySportRecords text -> list of workouts (coordinates are dropped on purpose)."""
    out = []
    for block in re.split(r"^\d+\. ", text, flags=re.M)[1:]:
        head = re.match(r"(.+?) — (\d{4}-\d{2}-\d{2})", block)
        if not head:
            continue
        a = {"sport": head.group(1).strip(), "date": head.group(2)}
        a["sport_he"] = SPORT_HE.get(a["sport"], a["sport"])
        if m := re.search(r"Location: (.+)", block):
            a["place"] = m.group(1).strip()
        if m := re.search(r"startTimestamp=(\d+) \| endTimestamp=(\d+)", block):
            a["start_ts"], a["end_ts"] = int(m.group(1)), int(m.group(2))
        if m := re.search(r"Duration: ([\d:]+)", block):
            a["duration_s"] = _dur_s(m.group(1))
        if m := re.search(r"Distance: ([\d.]+) km", block):
            a["distance_km"] = float(m.group(1))
        if m := re.search(r"Avg HR: (\d+) bpm", block):
            a["avg_hr"] = int(m.group(1))
        if m := re.search(r"Calories: ([\d,]+) kcal", block):
            a["calories"] = int(m.group(1).replace(",", ""))
        if m := re.search(r"LabelId: (\d+) \| SportType: (\d+)", block):
            a["label_id"], a["sport_type"] = m.group(1), int(m.group(2))
        if "label_id" in a:
            out.append(a)
    return out


def parse_detail(text: str) -> dict:
    """getActivityDetail text -> training load / training effect fields."""
    out = {}
    for key, field, conv in (("Training Load", "load", float), ("Aerobic TE", "aerobic_te", float),
                             ("Anaerobic TE", "anaerobic_te", float), ("Training Focus", "focus", str),
                             ("Max Heart Rate", "max_hr", int)):
        if m := re.search(rf"{key}: ([^\n]+)", text):
            try:
                out[field] = conv(re.sub(r"[^\d.]", "", m.group(1)) if conv is not str else m.group(1).strip())
            except ValueError:
                pass
    return out


# ---- FIT summary ---------------------------------------------------------------------------

def hr_zones(max_hr: int) -> list[tuple[str, int, int]]:
    """Five zones as % of max heart rate (simple, widely used split)."""
    edges = [0.5, 0.6, 0.7, 0.8, 0.9, 1.01]
    names = ["התאוששות", "קל", "אירובי", "סף", "מקסימלי"]
    return [(names[i], round(max_hr * edges[i]), round(max_hr * edges[i + 1])) for i in range(5)]


def summarize_fit(data: bytes, max_hr: int = 194) -> dict:
    """Heart-rate curve (30 s), time in zones, speed bursts and a court map in local metres.
    Absolute GPS coordinates are not kept: the map is relative to the session's own centre."""
    import warnings

    import fitdecode  # tolerant of the non-standard field sizes some COROS files have

    recs, session = [], {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with fitdecode.FitReader(io.BytesIO(data), check_crc=fitdecode.CrcCheck.DISABLED,
                                 error_handling=fitdecode.ErrorHandling.WARN) as fr:
            for fm in fr:
                if isinstance(fm, fitdecode.FitDataMessage):
                    if fm.name == "record":
                        recs.append({f.name: f.value for f in fm.fields})
                    elif fm.name == "session":
                        session = {f.name: f.value for f in fm.fields if f.value is not None}
    hr = [(r["timestamp"], r["heart_rate"]) for r in recs if r.get("heart_rate")]
    out: dict = {"sport": session.get("sport"), "temp_c": session.get("avg_temperature"),
                 "max_hr": session.get("max_heart_rate"), "min_hr": session.get("min_heart_rate")}
    if hr:
        t0 = hr[0][0]
        buckets: dict[int, list[int]] = {}
        for ts, v in hr:
            buckets.setdefault(int((ts - t0).total_seconds() // 30), []).append(v)
        out["hr_curve"] = [round(sum(v) / len(v)) for _, v in sorted(buckets.items())]
        zones = hr_zones(max_hr)
        secs = [0] * 5
        for _, v in hr:
            for i, (_, lo, hi) in enumerate(zones):
                if lo <= v < hi:
                    secs[i] += 1
                    break
        out["zones_min"] = [round(s / 60, 1) for s in secs]
        out["zone_bounds"] = [[lo, hi] for _, lo, hi in zones]
        # hardest 10 minutes (rolling mean of the 30 s curve)
        c = out["hr_curve"]
        if len(c) >= 20:
            best = max(range(len(c) - 19), key=lambda i: sum(c[i:i + 20]))
            out["peak10_start_min"] = round(best / 2, 1)
            out["peak10_hr"] = round(sum(c[best:best + 20]) / 20)
    speeds = [r.get("enhanced_speed") or r.get("speed") or 0 for r in recs]
    bursts, in_burst = 0, False
    for v in speeds:
        if v >= 2.0 and not in_burst:
            bursts, in_burst = bursts + 1, True
        elif v < 1.0:
            in_burst = False
    out["bursts"] = bursts
    out["max_speed_kmh"] = round(max(speeds) * 3.6, 1) if speeds else None
    pts = [(r["position_lat"], r["position_long"]) for r in recs
           if r.get("position_lat") is not None and r.get("position_long") is not None]
    if len(pts) >= 50:
        k = 180 / 2 ** 31  # semicircles -> degrees
        lat = [p[0] * k for p in pts]
        lon = [p[1] * k for p in pts]
        clat, clon = sorted(lat)[len(lat) // 2], sorted(lon)[len(lon) // 2]
        mx = 111320 * math.cos(math.radians(clat))
        xy = [((lo - clon) * mx, (la - clat) * 111320) for la, lo in zip(lat, lon)]
        xy = [(x, y) for x, y in xy if abs(x) < 60 and abs(y) < 60]  # drop GPS jumps off the court area
        out["court_xy"] = [[round(x, 1), round(y, 1)] for x, y in xy[::3]]
    return out


def local_dt(ts: int) -> datetime:
    """Unix time -> Israel wall clock (naive), handling summer/winter time."""
    from zoneinfo import ZoneInfo
    return datetime.fromtimestamp(ts, ZoneInfo("Asia/Jerusalem")).replace(tzinfo=None)
