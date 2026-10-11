# הקמה: מהמחשב לאייפון

את החלקים שמסומנים **אתה** רק אתה יכול לעשות, כי הם בחשבונות שלך. את החלקים שמסומנים **אני** אני עושה מהמחשב אחרי שתגיד. בערך 45 דקות בסך הכל.

## 1. Supabase: בסיס הנתונים והשרתים (אתה, כ-10 דקות)
1. נכנסים ל-supabase.com עם החשבון הקיים, ולוחצים New project. שם: `sleep-watch`. אזור: Frankfurt. את סיסמת בסיס הנתונים שומרים אצלך.
2. SQL Editor ← New query: מדביקים את כל התוכן של `supabase/schema.sql` ולוחצים Run.
3. Authentication ← Users ← Add user ← Create new user: המייל harelzionk@gmail.com (אותו מייל שכתוב ב-schema), סיסמה לבחירתך, ולסמן Auto Confirm. עם הפרטים האלה מתחברים לאפליקציה.
4. Authentication ← Sign In / Providers: לכבות את Allow new users to sign up.
5. Project Settings ← API Keys: צריך שלושה ערכים: Project URL, ה-publishable/anon key (ציבורי), וה-secret/service_role key (סודי!).
6. בתיקייה `sleep watch` במחשב יוצרים קובץ `.env` עם שתי שורות:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SECRET_KEY=המפתח הסודי
   ```
   אני לא צריך לראות את הקובץ. הסקריפטים קוראים אותו בלי להדפיס.

## 2. GitHub (אתה, כ-10 דקות)
1. מאגר **פרטי** בשם `sleep-watch`, בשביל העבודה היומית.
2. במאגר: Settings ← Secrets and variables ← Actions: להוסיף `SUPABASE_URL` ו-`SUPABASE_SECRET_KEY` (אותם ערכים כמו ב-.env).
3. מאגר **ציבורי** בשם `sleep-app`, בשביל האפליקציה בלבד, בלי נתונים ובלי סודות.
4. מפתח שמאפשר לשרת המהיר להפעיל את העבודה היומית: github.com ← Settings ← Developer settings ← Fine-grained tokens ← Generate. Repository access: רק `sleep-watch`. Permissions: Actions ← Read and write. את המפתח שומרים לשלב 3.

## 3. השרתים המהירים וההתראות (ביחד, כ-10 דקות)
1. **אתה:** בטרמינל בתיקייה, `npx supabase login`. נפתח דפדפן ואתה מאשר. אחר כך `npx supabase link --project-ref <הקוד מה-URL>`.
2. **אני:** יוצר מפתחות להתראות (`tools/make_vapid.py`) ומפתח לתזמון, ומגדיר אותם כ-secrets. אני גם מעלה את 4 השרתים (sync, notify, ics, coros-write).
3. **אתה:** מגדיר את מפתח ה-GitHub משלב 2.4, כדי שלא יעבור דרכי:
   `npx supabase secrets set GH_TOKEN=<המפתח> GH_REPO=<שם המשתמש>/sleep-watch`
4. **אני:** מכין את `supabase/cron.sql` עם הקוד שלך. **אתה:** מדביק אותו ב-SQL Editor ולוחץ Run. מעכשיו הסנכרון רץ כל 10 דקות וההתראות כל 5 דקות.

## 4. העלאת הנתונים והקוד (אני, אחרי אישור שלך)
1. `tools/seed_cloud.py` מעלה את ההתחברות ל-COROS ואת 193 האימונים, כולל קבצי הדופק וה-GPS.
2. `jobs/daily.py --backfill` מעלה את כל לילות השינה ומחשב את הכל בפעם הראשונה.
3. מעלה את הקוד ל-`sleep-watch` (בלי `data/`, `.env` ו-`.coros_oauth.json`).
4. ממלא את `app/config.js` (כתובת, מפתח ציבורי, מפתח ציבורי להתראות) ומעלה את התיקייה `app/` ל-`sleep-app`.
5. **אתה:** ב-`sleep-app`: Settings ← Pages ← Deploy from branch ← main ← Save.

## 5. באייפון (אתה, כ-15 דקות)
1. בספארי: `https://<שם המשתמש>.github.io/sleep-app/` ← שיתוף ← **הוסף למסך הבית**.
2. פותחים מהאייקון (לא מספארי) ומתחברים.
3. הגדרות ← **הפעל התראות** ← אשר. ואז "שלח התראת בדיקה".
4. הגדרות ← **צור קוד** סודי, בשביל השעונים, היומן והווידג'ט.
5. **שעונים מעוררים:** לפי `SHORTCUTS.md`.
6. **יומן באייפון:** הגדרות האייפון ← יומן ← חשבונות ← הוסף חשבון ← אחר ← הוסף לוח שנה מנוי ← מדביקים את "כתובת יומן לאייפון" מהגדרות האפליקציה.
7. **ווידג'ט:** מתקינים את Scriptable מה-App Store (חינמי). בונים סקריפט חדש, מדביקים את `widget/sleep-widget.js` וממלאים 4 ערכים. מוסיפים ווידג'ט Scriptable למסך הבית ובוחרים את הסקריפט.

## אם COROS מבקשת להתחבר מחדש
מריצים במחשב `tools/coros_probe.py` (מתחברים בדפדפן), ואז `tools/seed_cloud.py --login-only`.
