"""One-time upload from this computer to Supabase:
- the COROS login (.coros_oauth.json), so the cloud job can use and refresh it;
- all workouts with their FIT summaries (data/activities.json), which would take the cloud
  several days to download because COROS limits FIT files per day.
Run again only if COROS asks to log in again (then just the login is needed: --login-only).

Needs SUPABASE_URL and SUPABASE_SECRET_KEY in .env (this script never prints them).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.store import Store, load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
store = Store()
store.set_control("coros_auth", json.loads((ROOT / ".coros_oauth.json").read_text("utf-8")))
print("COROS login copied to Supabase.")
if "--login-only" not in sys.argv:
    acts = json.loads((ROOT / "data" / "activities.json").read_text("utf-8"))
    for i in range(0, len(acts), 50):
        store.upsert("activities", [{"label_id": a["label_id"], "date": a["date"], "data": a} for a in acts[i:i + 50]])
    print(f"{len(acts)} workouts uploaded.")
