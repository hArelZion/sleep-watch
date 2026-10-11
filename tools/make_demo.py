"""Local preview data for the app (app/demo.json, never committed) + the app icons."""
import json
import sys
from datetime import date, datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.engine import model_state  # noqa: E402
from sleepwatch.features import load_nights  # noqa: E402

APP = ROOT / "app"


def icons() -> None:
    for size in (180, 512):
        s = size * 4  # draw large, downsample for smooth edges
        im = Image.new("RGB", (s, s), "#14162b")
        d = ImageDraw.Draw(im)
        r = s * 0.30
        cx, cy = s * 0.5, s * 0.5
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#f0a85a")          # moon
        off = r * 0.55
        d.ellipse([cx - r + off, cy - r - off * 0.45, cx + r + off, cy + r - off * 0.45], fill="#14162b")  # crescent cut
        for (x, y, rr) in [(0.72, 0.30, 0.018), (0.80, 0.52, 0.012), (0.66, 0.70, 0.010)]:
            d.ellipse([s * x - s * rr, s * y - s * rr, s * x + s * rr, s * y + s * rr], fill="#eceaf7")
        im.resize((size, size), Image.LANCZOS).save(APP / f"icon-{size}.png")


def demo() -> None:
    df = load_nights(ROOT / "data" / "nights.csv")
    today = date.today()
    state = model_state(df, today)
    state.update(profile={"height_cm": "182.0", "weight_kg": "78.0", "birthday": "2000-01-19", "gender": "Male"},
                 updated=datetime.now().isoformat(timespec="minutes"), rated_nights=0)
    raw = df.tail(60)
    keep = ["score", "sleep_min", "deep_pct", "light_pct", "rem_pct", "awake_pct", "awake_min", "awake_count",
            "hrv", "hrv_eval", "rhr", "onset", "wake", "steps", "calories", "stress", "sleep_hr"]
    nights = []
    for d, r in raw[keep].iterrows():
        row = {k: (v.isoformat() if hasattr(v, "isoformat") else (None if v != v else (v.item() if isinstance(v, np.generic) else v)))
               for k, v in r.items()}
        nights.append({"date": d.date().isoformat(), "data": row})
    acts = json.loads((ROOT / "data" / "activities.json").read_text("utf-8"))
    ins_path = APP / "demo_insights.json"
    insights = json.loads(ins_path.read_text("utf-8")) if ins_path.exists() else {}
    # keep the insights dated today so the home screen shows them as current
    insights["date"] = today.isoformat()
    fit = [{"date": today.isoformat(), "data": insights.get("coros", {})}]
    def ev(days, hh, mm, kind, title, level, dur):
        from datetime import timedelta, timezone
        s = datetime.combine(today + timedelta(days=days), datetime.min.time()).replace(hour=hh, minute=mm)
        to_utc = lambda d: (d - timedelta(hours=3)).replace(tzinfo=timezone.utc).isoformat()
        return {"id": f"demo-{days}-{hh}", "kind": kind, "title": title, "level": level, "starts_at": to_utc(s),
                "ends_at": to_utc(s + timedelta(minutes=dur)), "reminders": [120, 60], "data": {}, "created_at": "2026-10-01T00:00:00Z"}
    events = [ev(1, 19, 30, "tennis", "טניס עם דני", "קשה", 90), ev(3, 10, 0, "tennis", "טניס זוגות", "בינוני", 120),
              ev(2, 18, 0, "workout", "ריצה קלה", "קל", 40)]
    out = {"control": {"model": state, "insights": insights, "live": {"steps": 6420, "calories": 455, "exercise_min": 0, "stress": 24,
                                                                     "updated": datetime.now().isoformat()},
                       "settings": {"onboarded": True, "deadlines": {"0": "08:00", "1": "08:00", "2": "08:00", "3": "08:00", "4": "08:00"},
                                    "overrides": {}, "calorie_goal": 700, "steps_goal": 8000, "profile": {"age": 26, "weight_kg": 78}}},
           "nights": nights, "plans": {}, "ratings": {}, "activities": [{"label_id": a["label_id"], "date": a["date"], "data": a} for a in acts],
           "fitness_daily": fit, "events": events, "logs": {}}
    (APP / "demo.json").write_text(json.dumps(out, ensure_ascii=False), "utf-8")


if __name__ == "__main__":
    icons()
    demo()
    print("ok")
