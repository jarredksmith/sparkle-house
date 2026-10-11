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

## Privacy

- Photos go to your helper and on to Claude for that one request. Neither the app nor the helper saves them.
- Lists, points, and players are stored only in the phone's local storage.
- The before photo stays in memory while the app is open, so "Scan again" is needed to see task areas after relaunching.

## Updating the app

After changing `index.html`, open `sw.js` and bump `VERSION` (for example `sparkle-v2`) so phones fetch the new version instead of the cached one.

## Next up

- The 3D house: unlocked decor already tracks toward it.
- Shared household sync, so points follow each person across phones.
