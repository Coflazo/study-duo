# Study Duo

A study timer for your browser. It puts a small digital clock in the corner of every page, keeps distracting sites shut while you focus, rings a soft bell between blocks, and learns which hours and which music help you concentrate. It runs offline, needs no account, and keeps everything on your computer.

> Status: in development. Nothing is released yet. The install lines below start working with the first release (v0.1.0). Follow progress in the [design spec](docs/superpowers/specs/2026-10-07-study-duo-design.md).

## Install

Paste one line into a terminal. Click the copy icon on the right of the box, paste, press Enter.

**macOS or Linux** (Terminal, iTerm, bash, zsh, fish):

```sh
curl -fsSL https://raw.githubusercontent.com/Coflazo/study-duo/main/install.sh | sh
```

**Windows** (PowerShell, Command Prompt or Windows Terminal):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/Coflazo/study-duo/main/install.ps1 | iex"
```

What the installer does:

1. downloads the latest release from this repo's GitHub Releases page,
2. checks its SHA-256 checksum and stops if it doesn't match,
3. unpacks it into a folder in your home directory (no admin rights needed),
4. copies that folder's path and opens your browser's extensions page.

Then three clicks: turn on **Developer mode**, click **Load unpacked**, paste the path. Browsers don't let any script install an extension on its own, so these clicks are needed once.

Works with Chrome, Edge, Brave, Arc, Opera and Vivaldi. Firefox support is planned.

You can read [install.sh](install.sh) and [install.ps1](install.ps1) before running them. Prefer doing it by hand? Download the zip from [Releases](https://github.com/Coflazo/study-duo/releases), check it against `SHA256SUMS`, unzip it, and load the folder the same way.

**Update:** run the same line again, then press the reload arrow on the Study Duo card in your extensions page. Your data stays.

**Uninstall:** remove Study Duo from your extensions page, then delete the folder the installer printed.

## What you get

- A Pomodoro timer (25/5 by default, all lengths editable) with a count-up mode, auto-start, idle pause and keyboard shortcuts.
- A 7-segment clock in the corner of every page. It fades almost out of sight until your cursor comes near, and you can close it per page or turn it off.
- The time left on the toolbar icon.
- A bell and a short phrase in the middle of the screen when a block starts or ends, fading out slowly.
- A site locker for focus blocks: block a list of sites, or allow only the sites you choose plus your music.
- A todo list. Pick a task before a block and it shows up in your session log.
- Music: it notices what plays in your music tabs (YouTube Music, Spotify Web, Apple Music, SoundCloud), and plays your own downloaded music and focus sounds with no internet.
- A timeline of every study and break session, and `.ics` export for any calendar. Google Calendar sync is optional.
- Insights after a few weeks: your best hours on each day of the week, which music goes with your best focus, and suggestions based on that.

## Privacy

Study Duo has no server. Everything it records (sessions, ratings, songs, which sites you spent time on, at the domain level only) stays in your browser's storage. You can export it or delete all of it from the settings page.

Some features talk to the internet, and only after you turn them on:

| Connection | What is sent, and to whom |
|---|---|
| Google Calendar sync | Session start and end times and titles, to your own Google Calendar, into a separate "Study Duo" calendar |
| Last.fm or ListenBrainz | A request for your own recent listens, to that service |
| Deadline feed | A request for the calendar feed URL you paste (for example your Canvas feed) |

With all of them off, Study Duo makes no network requests at all. The test suite checks this.

## Permissions

| Permission | Why |
|---|---|
| Read and change data on all websites | To draw the clock and the phase text on the page you're on. The page script does nothing else. |
| Storage, unlimited storage | To keep your settings and history on your computer |
| Alarms, idle | To end blocks on time and pause when you walk away |
| Notifications | For the end-of-block notice when no browser window is in front |
| Offscreen (Chrome) | To play the bell and your music when the popup is closed |

Connections ask for their own permissions only when you switch them on.

## How the insights work

After each focus block you can rate your focus from 1 to 5 with one click. Study Duo combines those ratings with what it already records: time of day, day of week, what music played, and how much time went to distracting sites. A small statistical model runs on your computer and estimates what goes with your best focus. Monday to Friday are treated as one group of days and Saturday and Sunday as another, so a day with few sessions borrows strength from similar days.

It shows a pattern only when there is enough data to back it, and it shows how sure it is. Expect the first insights after about three weeks of regular use.

## Research behind the defaults

- Fixed breaks beat self-chosen breaks for fatigue and focus: [Biwer et al., 2023](https://pubmed.ncbi.nlm.nih.gov/36859717/).
- Breaks spent on a phone hurt the next work block: [Kang & Kurtzberg, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC7044622).
- Music with lyrics hurts reading more than instrumental music: [Vasilev, Kirkby & Angele, 2018](https://doi.org/10.1177/1745691617747398).
- A ten-second pause before opening a distracting app cuts how often people open it: [Grüning et al., 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9974409).
- Writing down progress helps people reach goals: [Harkin et al., 2016](https://eprints.whiterose.ac.uk/91437/).

## Run from source

You need Node.js 22 or newer.

```sh
git clone https://github.com/Coflazo/study-duo && cd study-duo && npm ci && npm run dev
```

`npm run dev` opens a browser with the extension loaded and reloads it as you edit. `npm test` runs the tests, `npm run build` writes the extension to `.output/chrome-mv3`.

## Credits, security, license

Fonts, sounds and borrowed code are listed in [CREDITS.md](CREDITS.md) once they are added. To report a security problem, see [SECURITY.md](SECURITY.md). Study Duo is MIT licensed, see [LICENSE](LICENSE).
