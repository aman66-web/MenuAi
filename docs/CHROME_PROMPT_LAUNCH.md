# Claude in Chrome: switch on Community and check the live setup (paste everything below the line)

HOW TO USE: open Chrome, make sure you are logged in to GitHub, Supabase and Vercel (the same accounts as always), open Claude in Chrome and paste EVERYTHING below the line as one message.
Claude does Part 1 (the database), Part 2 (a read-only look at Vercel) and then reports. It does not merge or deploy anything: when it reports "done", tell Claude Code "the migration is applied" and Claude Code merges to `main` and checks numbite.com.
The Midjourney pictures are a separate paste: `docs/MIDJOURNEY_CHROME_PROMPT.md`.

--------------------------------------------------------------------------------------------------------------

You are helping the founder of Numbite (a UK calories and protein app). Work in this browser, in NEW tabs, one step at a time. I am already logged in to GitHub, Supabase and Vercel. Do ONLY what is written here.

GROUND RULES
- Never reveal, copy, type or screenshot a secret value (API keys, tokens, passwords, the "service_role" or "secret" key, environment-variable values). Looking at a variable's NAME is fine; never click "Reveal", "Show" or "Copy value".
- Do not change anything except what a step says. Do not delete anything. Do not run any SQL except the two files named in Part 1. Do not use any "db push", "reset", "pause", "delete" or "restore" button.
- If anything shows an error, a CAPTCHA, a login prompt, a payment prompt or a warning you did not expect, STOP at once, copy the exact words, and tell me. Do not try to get round it and do not "fix" SQL.
- The project is called `menumacros` in Supabase (organisation "Aman's Org", project ref `rbbalkfkpacazzhsqfzz`, region us-east-1). If the project you see has another name or ref, STOP and tell me.

PART 1: APPLY THE COMMUNITY DATABASE CHANGE IN SUPABASE
1. Open https://supabase.com/dashboard/project/rbbalkfkpacazzhsqfzz/editor (Table Editor). Look at the list of tables in the `public` schema. Write down whether any table whose name starts with `community_` or is called `friendships` already exists.
   - If ALL of these six exist already: `community_profiles`, `friendships`, `community_blocks`, `community_reports`, `community_lists`, `community_attempts`, then the change was applied before: skip to step 6.
   - If SOME but not all exist: STOP and tell me exactly which ones. Do not run anything.
   - If NONE exist: carry on.
2. In a new tab open this page (it is my private GitHub repository; I am logged in):
   https://github.com/aman66-web/MenuAi/blob/claude/menumacros-kit/supabase/migrations/20261016120000_community.sql
   The file is about 16 KB. Use the "Copy raw file" button at the top right of the file view (the two-squares icon). Do not retype it.
3. Open https://supabase.com/dashboard/project/rbbalkfkpacazzhsqfzz/sql/new (SQL Editor, new query). Click into the editor, select anything already in it and delete it, then paste (Ctrl+V or Cmd+V). Check the first line of what you pasted reads like a comment about the community tables and the last line is a semicolon or comment, so the whole file is there. Click Run.
   EXPECTED RESULT: "Success. No rows returned". If you see anything else, STOP and copy the message to me.
4. Open the Table Editor again and refresh. The six tables from step 1 must now be listed. For each one, open it and check the "RLS" / "Row Level Security" label says it is enabled (it should show a lock or "RLS enabled"). Also look for a view called `open_community_reports`.
5. Now the check script. Open this page:
   https://github.com/aman66-web/MenuAi/blob/claude/menumacros-kit/supabase/tests/community.sql
   Use "Copy raw file", open a NEW query in the SQL Editor (https://supabase.com/dashboard/project/rbbalkfkpacazzhsqfzz/sql/new), paste it, and click Run. This script only checks things and rolls itself back, so it leaves no data behind.
   EXPECTED RESULT: the output (look at the Results and also the "Messages"/notice panel) contains the words ALL COMMUNITY CHECKS PASSED. If it does not, or shows any error, STOP and copy the exact text to me.
6. Tell me, in one line each: whether the six tables exist, whether RLS is on for all six, and whether the check script printed ALL COMMUNITY CHECKS PASSED.

PART 2: LOOK AT VERCEL (READ ONLY, NAMES ONLY)
7. Open https://vercel.com and find the project called `menumacros` (team/scope: mine). Open Settings, then Environment Variables. Do NOT reveal any value. Report:
   a. Is there a variable named NEXT_PUBLIC_COMMUNITY_FRIENDS? (There should NOT be one. If there is, tell me its environment tags but not its value.)
   b. Which of these names exist, and for which environments (Production / Preview / Development): SUPABASE_URL, SUPABASE_SECRET_KEY, IP_HASH_SALT, CRON_SECRET, NEXT_PUBLIC_SUPPORT_EMAIL, RESEND_API_KEY, REPORT_ALERT_TO, REPORT_ALERT_FROM, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, NEXT_PUBLIC_APP_STORE_URL, NEXT_PUBLIC_SHOW_SAMPLE_DATA. Just list "present" or "missing" for each.
   c. Under Settings, Git: what is the "Production Branch"? (I expect `main`.)
   d. Under Domains: is `numbite.com` listed and shown as valid, with `www.numbite.com` redirecting to it?
   e. Under Deployments: what is the newest Production deployment (commit message first line, date, status)? And are the Preview deployments for the branch `claude/menumacros-kit` green (Ready) or red (Error)? If any is red, open it and copy the first error line to me. Do not redeploy or cancel anything.
8. Open https://numbite.com/app in a new tab. Tell me what you see: does it open on a welcome screen with a "Get started" button (the new version, English only), or on a screen that says "Choose your language" (the old version)?

REPORT
At the end give me a short table: step number, what you found, OK / STOP. Then list anything you could not do and why. Do not do anything beyond this list.
