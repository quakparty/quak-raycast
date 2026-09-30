# Quak for Sonos

Raycast extension for [Quak](https://quak.party): announcements, sounds and clips on your Sonos speakers.

## Commands

- **Play Text**: type a text and press Enter to say it with your workspace's defaults. `Play with Options…` (⌘↵, Ctrl+Enter on Windows) picks
  speakers, volume, voice, voice effect and ambience. With a text argument from root search it plays right away.
- **Play Selected Text**: plays the text you selected in any app with your workspace's defaults. Give it a hotkey to
  read out anything, anywhere.
- **Talk to Speakers** (macOS only): records from the microphone as soon as it opens and shows the elapsed time. Enter stops and
  plays the recording with your workspace's defaults, ⌘↵ stops and opens the options (speakers, volume, voice effect,
  ambience), Esc discards it. The recording stops by itself at the most Quak plays of a talk (3 minutes today, read from the API). The first time,
  macOS asks whether Raycast may use the microphone; if you declined, allow Raycast in System Settings → Privacy &
  Security → Microphone. On Windows the command only says that it needs macOS.
- **Play Sound**: search the sound library by name, description or tag and play a sound. `Create Quicklink` (⌘⇧L)
  saves a quicklink that plays this sound right away with your workspace's defaults; give it an alias or a hotkey.
- **Play Clip**: play one of your workspace's clips. `Create Quicklink` (⌘⇧L) works like in Play Sound.
- **Stop Playback**: stop everything that plays on all speakers of your workspace.
- **History**: recent plays with type, content, speakers, status, time and client. Replay a play, stop it while it
  runs, save it as a clip or copy its text.

Everything you leave out comes from your workspace's defaults on quak.party. The options form remembers your last
choices. Errors from Quak (speaker offline, out of credits etc.) show as a toast, plays during quiet hours are skipped.

## Setup

Create an API key with scope `play` at [quak.party/app/settings/keys](https://quak.party/app/settings/keys) and paste it into the extension's
preferences.

Tip: add **Play Text** as a fallback command (Raycast Settings → Launcher → Fallback Commands). Then any text you
type in Raycast's root search can go straight to your speakers.

## Development

```sh
npm install
bun run dev
```

Install with npm, never `bun install` (no `bun.lock`): the Raycast store builds with npm and needs `package-lock.json`.
`bun run dev` runs the same `ray develop` script, `npm run dev` works too.

Talk records with a small Swift helper in `swift/` (AVFoundation, built with
[extensions-swift-tools](https://github.com/raycast/extensions-swift-tools)). `ray build` and `ray develop` compile it
with Xcode (16.3 or later) and import its functions from `swift:../../swift` in `src/lib/recorder.ts`. Each call runs
as its own process, so the extension steers the recording through files in a temp folder (heartbeat, stop); without a
heartbeat the helper stops and deletes the audio by itself. Don't run a second build while the dev server compiles the
Swift package, both use `swift/.raycast-swift-build` and xcodebuild fails with a locked build database.
