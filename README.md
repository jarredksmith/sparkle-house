# Sparkle House

A home-screen web app for chores. Snap a messy room, get a scored checklist, and earn sparkles as you clean. Coach Mode watches through the camera and checks off chores when you step back.

## What's in here

| File | What it does |
| --- | --- |
| `index.html` | The whole app (UI, scoring, Coach Mode) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Make it installable and work offline |
| `worker/worker.js` | The AI helper. Runs on Cloudflare and holds your API key |
| `worker/wrangler.toml` | Optional config if you deploy the helper from the command line |

## 1. Put the app on GitHub Pages

1. Create a new repository, for example `sparkle-house`.
2. Upload everything in this folder to it (the `worker` folder is harmless to include, it holds no secrets).
3. In the repo, go to **Settings > Pages**, set **Source** to "Deploy from a branch", pick `main` and `/ (root)`, and save.
4. After a minute your app is live at `https://YOUR-USERNAME.github.io/sparkle-house/`.

## 2. Add it to your iPhone

Open that address in **Safari**, tap **Share**, then **Add to Home Screen**. It opens full screen like a regular app.

Swipe sideways (either direction) to go back: from a room or Rewards to the house, or to close any pop-up, including Settings. Settings are grouped into sections (Fluff, Coach Mode, Household, Reminders, AI helper, Privacy) and save when you close them.

The app starts in **demo mode**: the chore list is a sample, and Coach Mode checks off random chores. That's enough to try the whole flow before setting up the AI.

## 3. Set up the AI helper (Cloudflare Worker, free tier)

The API key can't live inside the app, or anyone could pull it out of the page. The helper holds it instead.

1. Get a Claude API key from the Claude Console.
2. Sign up at cloudflare.com (free), then go to **Workers & Pages > Create > Create Worker**. Name it `sparkle-helper` and deploy the starter.
3. Click **Edit code**, replace everything with the contents of `worker/worker.js`, and **Deploy**.
4. In the worker's **Settings > Variables and Secrets**, add:
   - `ANTHROPIC_API_KEY` as a **Secret**: your API key
   - `APP_TOKEN` as a **Secret**: a household passcode you make up
   - `ALLOWED_ORIGINS` as a **Text** variable: `https://YOUR-USERNAME.github.io`
5. Copy the worker's address (something like `https://sparkle-helper.YOUR-NAME.workers.dev`).
6. In the app, tap the gear, paste the address and passcode, tap **Test connection**, then **Save settings**.

Room scans use Claude Sonnet for accuracy. Coach Mode checks use Claude Haiku because they run often. You can change either with the `MODEL_ANALYZE` and `MODEL_VERIFY` variables. To make fewer Coach Mode checks, raise "Wait at least N seconds between checks" in Settings.

## 4. Give Fluff a natural voice (optional, ElevenLabs)

1. Make an account at elevenlabs.io and create an API key in your profile's API Keys page.
2. In the Worker's **Settings > Variables and Secrets**, add `ELEVENLABS_API_KEY` as a **Secret**.
3. In the app, open Settings, turn on "Fluff talks out loud", and pick a voice under **AI voices**. Play sample uses ElevenLabs' free preview clip, so it doesn't spend credits.

Want a voice that's truly Fluff's? Use ElevenLabs' voice design tool, save the voice to your account, and it appears in the app's list (designed voices are picked by default).

- The helper uses the fast, low-cost `eleven_flash_v2_5` model. Set an `ELEVENLABS_MODEL` variable (for example `eleven_v4_turbo`) for a more expressive one.
- Every line Fluff says is saved on the phone, so repeated lines only cost credits once.
- If credits run out or the voice service is unreachable, Fluff falls back to the phone's voice.
- Like all app audio, Fluff is muted when the iPhone's ring/silent switch is set to silent.

## How Coach Mode decides when to check

The phone compares tiny 48×36 snapshots of the camera feed five times a second, entirely on the device. When it sees movement, then stillness for about 2.5 seconds, and enough time has passed since the last check, it sends one photo to the helper along with the before photo and the open chores. Claude replies with which chores are clearly done. Anything blocked or out of view stays open, and you can always tap a chore to mark it done yourself.

## Ask Fluff and focus areas

- **Ask Fluff:** tap a chore, then **Where is it?**, or tap **Ask** in Coach Mode. Type or use the mic. Fluff looks at the current camera view (or the room photo), answers out loud, and highlights the spot. If it can't find the item, you can remove the chore right there. Uses Claude Sonnet by default; set `MODEL_ASK` to change it.
- **Focus areas:** before a photo scan, choose **Draw focus area**, or in Coach Mode tap the dotted-shape button. Tap points around the part of the room that counts. Everything outside is grayed out before any image goes to the AI, and movement there doesn't trigger checks. Coach Mode areas are saved per room and per camera; photo areas are saved per room and offered on the next scan.

## Reminders (push notifications)

Fluff can send a daily nudge, a streak saver, a Sunday recap and surprise "Flash bonus" double-sparkle windows. The helper sends them on a schedule, so it needs storage and a timer:

1. In Cloudflare, go to **Storage & Databases > Workers KV** (or search "KV"), choose **Create instance**, and name it `sparkle-kv`.
2. Open the `sparkle-helper` Worker, go to **Bindings > Add binding > KV namespace**, set the variable name to `SPARKLE_KV`, pick `sparkle-kv`, and save.
3. In the Worker's **Settings > Trigger events** (Cron Triggers), add a schedule of `*/15 * * * *` (every 15 minutes).
4. On your iPhone, open Sparkle House **from the Home Screen**, go to Settings > Reminders, tap **Turn on reminders**, and allow notifications. Then tap **Send a test**.

- The helper creates its own push keys and stores them in KV. No extra secrets needed.
- To keep reminders relevant, the app stores a small summary in your KV: first name, streak, open chore count, the room needing attention, and weekly totals. No photos.
- Reminders respect quiet hours, skip the daily nudge if you've already cleaned that day, and never send two within 45 minutes.
- Opening a Flash bonus notification doubles the sparkles for every chore finished in the next 30 minutes.
- The app icon shows how many chores are left (iPhone lets you turn badges off under Settings > Notifications).

## Fluff personalities

In Settings, each person picks their own coach: **Sunny** (cheerleader), **Sarge** (drill sergeant), **Snooze** (sleepy and sarcastic) or **Captain** (pirate). The choice changes Fluff's look, everything Fluff says in Coach Mode and challenges, the tone of the AI's feedback and answers, and the wording of that phone's reminders.

## Household sync

Every phone connected to the same helper can share one household: rooms, chore lists, people, sparkles, the streak and the leaderboard.

1. In Cloudflare, go to **Storage & Databases > D1 SQLite Database**, choose **Create database**, and name it `sparkle-db`.
2. Open the `sparkle-helper` Worker, go to **Bindings > Add binding > D1 database**, set the variable name to `SPARKLE_DB`, pick `sparkle-db`, and save.
3. On the first phone: Settings > Household sync > **Set up household sync**. This starts the household with that phone's data.
4. On each other phone: the same button, then **Join the household** (use the household's data) or **Combine with this phone's data** (add this phone's people, rooms and history; people with the same name become one person).

- Phones check for changes every few seconds while the app is open, and send their own changes right away.
- Sparkle totals, the streak and decor unlocks are worked out from the shared history of sparkle events, so two people scoring at the same moment never overwrite each other. If two phones check off the same chore at once, it counts once.
- Photos, voice settings, reminders, the camera choice and Coach Mode focus areas stay on each phone.
- The helper stores the household in your own D1 database. Nothing is shared outside your Cloudflare account.

## iPhone app (TestFlight)

The `ios-app` folder wraps this same web app in a native iPhone app using Capacitor. The app bundles `index.html`, so there's still only one copy of the app to edit. Inside the app, Fluff talks even when the silent switch is on, the screen stays awake in Coach Mode, chores buzz when you finish them, and Ask Fluff uses Apple's speech recognition.

Reminders in the app don't need the helper or KV at all: the phone plans the next two weeks of reminders (daily nudge, streak saver, Sunday recap, flash bonuses) and iOS delivers them, with Fluff's chime and the open-chore count on the app icon. The plan is redone whenever a chore is done, the household syncs or a setting changes. One limit: if someone else finishes a chore on another phone, this phone finds out the next time the app is opened.

GitHub builds it on a Mac every time `index.html`, `icons/` or `ios-app/` changes (see `.github/workflows/ios.yml`). Until the keys below are added, a build only checks that the app compiles. Once they're added, every build is signed and sent to TestFlight.

1. In App Store Connect, create the app with bundle ID `com.jarredsmith.sparklehouse`.
2. In App Store Connect, go to **Users and Access > Integrations > App Store Connect API**, create a **Team Key** with **Admin** access (Admin lets Xcode manage the signing certificates for you), and download the `.p8` file. Apple only lets you download it once.
3. In this GitHub repo, go to **Settings > Secrets and variables > Actions** and add:
   - Secrets: `ASC_KEY_ID` (the key's ID), `ASC_ISSUER_ID` (shown above the keys list), `ASC_KEY_P8` (open the .p8 file in a text editor and paste all of it)
   - The Apple Team ID is already set in `ios.yml`. To use a different team, add a repo variable `APPLE_TEAM_ID`.
4. In GitHub, open **Actions > iPhone app > Run workflow**. When it finishes, the build appears in TestFlight after Apple processes it.
5. In App Store Connect, open the app's **TestFlight** tab and add family members as testers. They install the TestFlight app, then Sparkle House.

The helper's `ALLOWED_ORIGINS` must include `capacitor://localhost` so the app can reach it.

## Privacy

- Photos go to your helper and on to Claude for that one request. Neither the app nor the helper saves them.
- Lists, points, and players are stored in the phone's local storage, and in your own D1 database if household sync is on.
- The before photo stays in memory while the app is open, so "Scan again" is needed to see task areas after relaunching.

## Updating the app

After changing `index.html`, open `sw.js` and bump `VERSION` (for example `sparkle-v2`) so phones fetch the new version instead of the cached one.

## Next up

- The 3D house: unlocked decor already tracks toward it.
- A Home Screen widget for the iPhone app.
