// Stage 9: science-based tips for waking up alert. Each tip says how strong the evidence is and
// where it comes from. `when` decides when the home screen shows it.
export const TIPS = [
  { id: "caffeine", when: "afternoon", title: "קפה אחרון 8 שעות לפני השינה",
    text: "קפאין נשאר בגוף שעות ארוכות. מנה גדולה גם 6 שעות לפני השינה קיצרה שינה ביותר משעה במחקר מעבדה. האפליקציה מחשבת לך את השעה כל יום.",
    evidence: "strong", source: "Drake et al., J Clin Sleep Med 2013" },
  { id: "alcohol", when: "evening", title: "אלכוהול פוגע בשינה הטובה",
    text: "אלכוהול עוזר להירדם, אבל מקטין את שינת ה-REM ומגביר התעוררויות בהמשך הלילה, וזה מוריד את ציון השינה.",
    evidence: "strong", source: "Ebrahim et al., Alcohol Clin Exp Res 2013 (סקירה)" },
  { id: "shower", when: "evening", title: "מקלחת חמה שעה-שעתיים לפני השינה",
    text: "מקלחת או אמבטיה חמה (40–42 מעלות) שעה עד שעתיים לפני השינה קיצרה את זמן ההירדמות בכ-10 דקות בממוצע.",
    evidence: "moderate", source: "Haghayegh et al., Sleep Med Rev 2019 (מטא-אנליזה)" },
  { id: "screens", when: "evening", title: "פחות מסך ואור חזק בשעה האחרונה",
    text: "אור בהיר ומסכים בערב מאחרים את השעון הביולוגי ואת ההירדמות. ההשפעה של מסך רגיל קטנה יחסית, אבל עמעום אורות עוזר.",
    evidence: "moderate", source: "Chang et al., PNAS 2015" },
  { id: "room", when: "evening", title: "חדר קריר, חשוך ושקט",
    text: "חדר קריר (בערך 18–20 מעלות), חשוך ושקט קשור לשינה רציפה יותר ולפחות התעוררויות, ואצלך התעוררויות הן מה שהכי מוריד ציון.",
    evidence: "moderate", source: "Okamoto-Mizuno & Mizuno, J Physiol Anthropol 2012 (סקירה)" },
  { id: "meal", when: "evening", title: "ארוחה כבדה 2–3 שעות לפני השינה",
    text: "ארוחה גדולה ממש לפני השינה עלולה לפגוע בהירדמות ובאיכות השינה. הראיות מעורבות, אבל רווח של 2–3 שעות בטוח.",
    evidence: "weak", source: "St-Onge et al., Adv Nutr 2016 (סקירה)" },
  { id: "light", when: "morning", title: "אור יום בשעה הראשונה אחרי הקימה",
    text: "10–30 דקות של אור יום בבוקר מעוררות, ומקדימות את השעון הביולוגי. זה עוזר להירדם מוקדם יותר בערב, שזה בדיוק מה שטיפוס ערב כמוך צריך.",
    evidence: "moderate", source: "Blume et al., Somnologie 2019 (סקירה)" },
  { id: "snooze", when: "morning", title: "סנוז: לא אסון, אבל לא עוזר",
    text: "מחקר מ-2023 לא מצא נזק בסנוז של חצי שעה אצל מי שרגיל לכך. עדיין, הדקות האלה הן שינה שבורה. עדיף לכוון את השעון לשעה שבה באמת קמים.",
    evidence: "weak", source: "Sundelin et al., J Sleep Res 2023" },
  { id: "move", when: "morning", title: "קצת תנועה בבוקר",
    text: "כמה דקות של תנועה (הליכה, מתיחות, קפיצה בחבל) מעלות דופק וטמפרטורת גוף ומקצרות את תחושת הערפל של הבוקר.",
    evidence: "weak", source: "Hilditch & McHill, Nat Sci Sleep 2019 (סקירה על sleep inertia)" },
  { id: "water", when: "morning", title: "כוס מים כשקמים",
    text: "גם התייבשות קלה פוגעת בריכוז ובמצב הרוח. כוס מים בבוקר היא דרך פשוטה להתחיל את היום.",
    evidence: "moderate", source: "Masento et al., Br J Nutr 2014 (סקירה)" },
  { id: "breakfast", when: "morning", title: "ארוחת בוקר עם חלבון",
    text: "ארוחת בוקר עם חלבון ופחמימות מורכבות (ביצים, יוגורט, שיבולת שועל) נותנת אנרגיה יציבה יותר מסוכר פשוט.",
    evidence: "weak", source: "ראיות מעורבות; אין המלצה חד-משמעית על ארוחת בוקר" },
  { id: "nap", when: "afternoon", title: "נמנום קצר, לא ארוך",
    text: "נמנום של 10–20 דקות משפר ערנות כמעט מיד. נמנום ארוך מזה משאיר ערפל ועלול לפגוע בשינה בלילה. עדיף לפני 15:00–16:00.",
    evidence: "strong", source: "Brooks & Lack, Sleep 2006" },
  { id: "evening-ex", when: "afternoon", title: "אימון ערב בסדר, לא ממש לפני השינה",
    text: "אימון ערב לא פוגע בשינה ברוב המקרים, אבל אימון עצים פחות משעה לפני השינה כן. אצלך, אימון שנגמר 3–6 שעות לפני השינה נתן את הציונים הכי טובים.",
    evidence: "moderate", source: "Stutz et al., Sports Med 2019 (מטא-אנליזה) + הנתונים שלך" },
  { id: "tennis-carbs", when: "before-match", title: "לפני משחק: פחמימות 2–3 שעות לפני",
    text: "ארוחה עם פחמימות (פסטה, אורז, לחם, בננה) 2–3 שעות לפני משחק ממלאת את מאגרי האנרגיה. מעט שומן וסיבים כדי שלא יכביד.",
    evidence: "strong", source: "Kerksick et al., J Int Soc Sports Nutr 2017" },
  { id: "tennis-water", when: "before-match", title: "לפני משחק: לשתות מראש",
    text: "בערך 5–7 מ\"ל לכל ק\"ג משקל, 4 שעות לפני (אצלך כ-400–550 מ\"ל), ולשתות בהפסקות. בחום של ישראל להוסיף מלחים.",
    evidence: "strong", source: "ACSM Position Stand, Med Sci Sports Exerc 2007" },
  { id: "tennis-recovery", when: "after-match", title: "אחרי משחק: חלבון ומים",
    text: "20–40 גרם חלבון בשעתיים שאחרי האימון עוזרים לשרירים להתאושש, יחד עם מים להשלמת הנוזלים.",
    evidence: "strong", source: "Jäger et al., J Int Soc Sports Nutr 2017" },
];

export const EVIDENCE_HE = { strong: "ראיה חזקה", moderate: "ראיה בינונית", weak: "ראיה חלשה" };

/** Which tips fit right now: by hour of day and the next/last event. */
export function tipsForNow(now, { nextEvent = null, lastWorkoutEnd = null, hidden = [] } = {}) {
  const h = now.getHours();
  const tags = new Set();
  if (h >= 5 && h < 11) tags.add("morning");
  if (h >= 11 && h < 18) tags.add("afternoon");
  if (h >= 18 || h < 2) tags.add("evening");
  if (nextEvent && nextEvent.kind === "tennis") {
    const until = (new Date(nextEvent.starts_at) - now) / 3600000;
    if (until > 0 && until <= 5) tags.add("before-match");
  }
  if (lastWorkoutEnd && (now - lastWorkoutEnd) / 3600000 < 3) tags.add("after-match");
  return TIPS.filter((t) => tags.has(t.when) && !hidden.includes(t.id));
}
