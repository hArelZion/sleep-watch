// Today's live numbers from queryDailyHealthData (pure function, tested in live_test.ts).
/** Today's block of queryDailyHealthData -> live numbers. */
export function parseLive(daily: string): Record<string, number | null> {
  const blocks = daily.split(/^--- (\d{8}) ---$/m);
  const last = blocks.length >= 3 ? blocks[blocks.length - 1] : daily;
  const num = (re: RegExp) => { const m = last.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
  const ex = last.match(/Exercise: (?:(\d+)h\s*)?(?:(\d+)\s*min)?/);
  return {
    steps: num(/Steps: ([\d,]+)/),
    calories: num(/Calories: ([\d,]+) kcal/),
    exercise_min: ex && (ex[1] || ex[2]) ? Number(ex[1] ?? 0) * 60 + Number(ex[2] ?? 0) : null,
    stress: num(/Stress: Avg (\d+)/),
  };
}
