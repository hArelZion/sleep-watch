"""Check that app/planner.js gives exactly the same plans as the Python engine.

Builds the model state from the real history, plans a set of nights/deadlines/settings in
Python, runs the same cases through Node, and compares every field.
"""
import json
import subprocess
import sys
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.engine import Settings, model_state, plan_from_state  # noqa: E402
from sleepwatch.features import load_nights  # noqa: E402

NODE = """
import { planFromState } from "./app/planner.js";
import { readFileSync } from "node:fs";
const cases = JSON.parse(readFileSync(0, "utf8"));
const out = cases.map((c) => {
  try { return planFromState(c.state, c.night_of, c.settings, c.deadline); }
  catch (e) { return { error: e.message }; }
});
process.stdout.write(JSON.stringify(out));
"""


def main() -> None:
    df = load_nights(ROOT / "data" / "nights.csv")
    cases, expected = [], []
    nights = [date(2026, 10, 11), date(2026, 10, 15), date(2026, 10, 16), date(2026, 3, 1), date(2025, 12, 31)]
    deadlines = [None, "06:00", "07:30", "08:00", "09:45", "04:30", "02:00"]
    variants = [Settings(), Settings(prep_min=25, latency_min=20, wind_down_min=45),
                Settings(min_sleep_h=7.5, max_sleep_h=8.5, max_advance_h=1.0)]
    for n in nights:
        state = model_state(df, n)
        for dl in deadlines:
            for s in variants:
                dl_iso = None if dl is None else f"{n + timedelta(days=1)}T{dl}"
                try:
                    exp = plan_from_state(state, n, s, datetime.fromisoformat(dl_iso) if dl_iso else None).to_dict()
                except ValueError as e:
                    exp = {"error": str(e)}
                settings = {k: v for k, v in asdict(s).items() if k != "age"}
                cases.append({"state": state, "night_of": n.isoformat(), "settings": settings, "deadline": dl_iso})
                expected.append(exp)

    run = subprocess.run(["node", "--input-type=module", "-e", NODE], input=json.dumps(cases),
                         capture_output=True, text=True, encoding="utf-8", cwd=ROOT)
    if run.returncode:
        sys.exit(run.stderr)
    got = json.loads(run.stdout)
    bad = 0
    for c, e, g in zip(cases, expected, got):
        if e != g:
            bad += 1
            if bad <= 5:
                diff = {k: (e.get(k), g.get(k)) for k in set(e) | set(g) if e.get(k) != g.get(k)}
                print("MISMATCH", c["night_of"], c["deadline"], c["settings"], diff)
    print(f"{len(cases) - bad}/{len(cases)} cases identical")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
