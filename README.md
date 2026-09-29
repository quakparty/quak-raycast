# Quak for Sonos

Raycast extension for [Quak](https://quak.party): announcements, sounds and clips on your Sonos speakers.

## Commands

- **Say**: type a text and press Enter to say it with your workspace's defaults. `Play with Options…` (⌘↵, Ctrl+Enter on Windows) picks
  speakers, volume, voice, voice effect and ambience. With a text argument from root search it plays right away.
- **Play Sound**: search the sound library by name, description or tag and play a sound.
- **Play Clip**: play one of your workspace's clips.
- **Stop**: stop everything that plays on all speakers of your workspace.
- **History**: recent plays with type, content, speakers, status, time and client. Replay a play, stop it while it
  runs, save it as a clip or copy its text.

Everything you leave out comes from your workspace's defaults on quak.party. The options form remembers your last
choices. Errors from Quak (no credits, speaker offline etc.) show as a toast, plays during quiet hours are skipped.

## Setup

Create an API key with scope `play` on quak.party (Settings → API Keys) and paste it into the extension's
preferences.

## Development

```sh
npm install
npm run dev
```
