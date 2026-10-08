<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/banner-dark.png">
  <img alt="Study Duo. The corner clock reads 25:00 beside the words Study time. A study timer that lives in your browser." src="docs/media/banner-light.png" width="100%">
</picture>

A free study timer that lives in your browser.

It shows a small digital clock in the corner of every page, keeps distracting websites closed while you study, rings a soft bell when it's time for a break, and over a few weeks learns which hours and which music help you focus best. No account. Works without internet. Everything stays on your computer.

<a href="docs/media/demo.mp4"><img alt="A 45-second tour: tabs pile up during a study session; Study Duo starts a block on Problem set 5, puts a clock in the corner of the page, keeps reddit.com closed, rings in a break and asks for a focus rating, then shows a heat map of best hours from one simulated student." src="docs/media/demo.gif" width="100%"></a>

45 seconds, no sound. [Watch it as a video (MP4, 1080p)](docs/media/demo.mp4). The insights at the end come from one simulated student, not a real person's data.

## Get Study Duo (about 2 minutes)

**The easy way:** open **[coflazo.github.io/study-duo](https://coflazo.github.io/study-duo)**. It shows the right line for your computer with a copy button. Then do step 3 below.

**Or do it from here:**

**1. Open the Terminal app.** It's already on your computer.

- Mac: press `⌘ Command` + `Space`, type **Terminal**, press Enter.
- Windows: press the `Windows` key, type **PowerShell**, press Enter.
- Linux: press `Ctrl` + `Alt` + `T`.

**2. Copy your line, paste it into the Terminal, press Enter.** Click the copy icon at the right edge of the box to copy it.

On a Mac or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/Coflazo/study-duo/main/install.sh | sh
```

On Windows:

```powershell
powershell -c "irm https://raw.githubusercontent.com/Coflazo/study-duo/main/install.ps1 | iex"
```

It downloads Study Duo, checks that the download isn't damaged, puts it in a folder on your computer, and opens your browser's extensions page.

**3. Three clicks in your browser.** Browsers ask you to approve extensions that don't come from their store, so:

1. Switch on **Developer mode** (top right corner).
2. Click **Load unpacked**.
3. Paste (`⌘ Command` + `V` on a Mac, `Ctrl` + `V` on Windows) and press Enter. The folder address is already copied for you.

That's it. Click the puzzle piece next to the address bar and pin Study Duo so its timer is always in sight.

Works in Chrome, Edge, Brave, Arc, Opera and Vivaldi. Firefox is coming later.

**Getting a newer version:** paste the same line again, then click the round arrow on the Study Duo card in your extensions page. Your history stays.

**Removing it:** click **Remove** on the Study Duo card in your extensions page, then delete the **Study Duo** folder in your home folder (or run the same line with `--uninstall` on a Mac or Linux, `-Uninstall` on Windows).

**Songs from desktop apps (optional):** Study Duo sees songs on music websites by itself. To count songs from desktop players too (Music, VLC, foobar2000 and others), add the small desktop helper by running the install line with `--helper`:

```sh
curl -fsSL https://raw.githubusercontent.com/Coflazo/study-duo/main/install.sh | sh -s -- --helper
```

On Windows:

```powershell
powershell -c "& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Coflazo/study-duo/main/install.ps1))) -Helper"
```

Then turn on **Desktop apps** in Study Duo's Connections. The helper is a short script you can read first ([helper/](helper/)); it only reports the song title, artist, album and app, and only to Study Duo. `--uninstall` removes it too.

## What it does

- **Timer:** 25 minutes of study, 5 minutes of break, a longer break every fourth round. Change any of it.
- **Corner clock:** a small old-school digital clock on every page. It fades out of your way and comes back when your mouse gets close. Hide it any time.
- **Time on the icon:** the minutes left show on the toolbar icon.
- **Bell and big words:** a soft bell and a short line like "Break's over" in the middle of the screen when a block starts or ends.
- **Website lock:** during study time, chosen sites stay closed. Or allow only the sites you need, plus your music.
- **To-do list:** pick what you're working on before you start. Paste your course calendar link (Canvas, Moodle or any .ics) and your deadlines show up with their due dates.
- **Music:** it notices what's playing on YouTube Music, Spotify, Apple Music or SoundCloud in your browser, and it can play songs you've downloaded, even offline. Connect ListenBrainz or Last.fm and songs from your phone count too.
- **Calendar:** every study block and break is saved to a timeline you can export to any calendar app.
- **Move to another computer:** take your settings, site lists and to-dos along as one small file, or as QR codes the other computer's camera reads. No account, no server.
- **Your best hours:** after a few weeks it shows which hours of which days you focus best, and which music helps you most.

## How your best hours are worked out

Everything happens on your computer. After each study block you rate your focus from 1 to 5 with one tap, or skip it. Study Duo learns which hours, days and music go with your better blocks.

- **It waits for enough data.** Nothing shows until 25 rated blocks, and each hour only lights up once there are blocks near it. Until then you see how far along it is.
- **It only claims what it can back.** A best time or a music effect appears only when the data clearly supports it. Otherwise it says "unclear" or "no clear best time".
- **Weekdays learn from each other, and so do weekends.** A day with few blocks borrows from the days like it, so one odd Tuesday doesn't redraw your map.
- **Your quiet signals can stand in for a rating.** Once they predict your ratings well (after 15 rated blocks), time on study sites and how often you wander off fill in the blocks you didn't rate, and Study Duo asks less.
- **It suggests things to try.** A sound and a block length, picked to keep learning what works for you.
- **Spotify's web player doesn't count.** Spotify's rules forbid feeding what it plays into a model like this one, so those songs show in Music and the timeline but stay out of your insights.

<details>
<summary>The details, for the curious</summary>

- The model is a Bayesian linear regression with grouped Gaussian priors, fitted in the browser with a Cholesky factorisation and no extra code libraries. Each group's prior strength and the noise level are set by evidence maximisation (MacKay's fixed point).
- Time is modelled as an hour-of-day profile, plus a weekday or weekend difference, plus a per-day difference in three-hour steps. The hour effects are coded as steps from one hour to the next, so the prior is a random walk along the day.
- Music effects nest: genre, then artist, then track, each a share of the block's minutes, compared with silence.
- A music effect is claimed when its 80% interval excludes zero and it is at least a quarter of a rating point. A best window must beat your usual hours at a one-sided 97.5% bound, because it is the best of about 14 candidates.
- Suggestions come from Thompson sampling: one draw from the model's uncertainty, so options it is unsure about still get tried.
- The model is checked on simulated students with known answers (it must find their best hours and the effect of songs with lyrics, call a song with no effect unclear, and claim nothing for students whose ratings are pure noise) and, on your data, by predicting each block from the ones before it.

</details>

## Is it safe?

Study Duo has no servers and no account. Your history stays in your browser on your computer, and you can delete all of it with one button. Unless you switch on a connection, it sends nothing anywhere; a connection asks one service for your own data and nothing more. The code is public, so anyone can check it.

<details>
<summary>What Study Duo stores, and what the optional connections send</summary>

Stored on your computer only: your settings, to-do list, study and break sessions, focus ratings, the songs that played, and how much time you spent on each website (just the site name, like youtube.com, never the pages you read).

Optional connections, each off until you turn it on in Connections:

| Connection | What is sent, and to whom |
|---|---|
| Course deadlines | A request for the calendar link you paste (for example from Canvas), to the site that hosts it, every 6 hours |
| ListenBrainz or Last.fm | A request for your own recent songs, to that service, every 30 minutes (Last.fm also gets your API key) |
| Google Calendar (coming later) | Start and end times of your sessions, into a separate "Study Duo" calendar in your own Google account |

With all of them off, Study Duo makes no internet requests at all: one small part of the code makes every request, and it refuses any address that isn't a connection you switched on. Full details: [PRIVACY.md](PRIVACY.md).

</details>

<details>
<summary>Why it asks for each permission</summary>

| Permission | Why |
|---|---|
| Read and change data on all websites | To draw the clock and the big words on the page you're on, close blocked sites during a study block, note the site name of the page in front, read what's playing on music sites, and, only if you turn it on, count keys, clicks and scrolls. It never reads page text or what you type. |
| Storage | To keep your settings and history on your computer |
| Alarms, idle | To end blocks on time and pause when you walk away |
| Notifications | To tell you a block ended when the browser is in the background |
| Offscreen (Chrome) | To play the bell and your music when the Study Duo window is closed |

Study Duo is switched off in private (Incognito) windows, so nothing from them is recorded.

</details>

<details>
<summary>How "your best hours" works</summary>

After each study block you can rate your focus from 1 to 5 with one click. Study Duo puts those ratings next to the time of day, the day of the week, the music that played, and how much time went to distracting sites. A small piece of statistics on your own computer then works out what goes with your best focus.

Monday to Friday are treated as one group and Saturday and Sunday as another, so a day with only a few sessions can borrow from similar days. It only shows a pattern when it has enough of your sessions to back it up, and it tells you how sure it is. Expect the first results after about three weeks.

</details>

<details>
<summary>The research behind the default settings</summary>

- Fixed breaks leave students less tired than breaks they time themselves: [Biwer et al., 2023](https://pubmed.ncbi.nlm.nih.gov/36859717/).
- Spending a break on your phone makes the next study block worse: [Kang & Kurtzberg, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC7044622).
- Songs with lyrics get in the way of reading more than instrumental music: [Vasilev, Kirkby & Angele, 2018](https://doi.org/10.1177/1745691617747398).
- A ten-second pause before opening a distracting site makes people open it less: [Grüning et al., 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9974409).
- Writing down your progress helps you reach your goals: [Harkin et al., 2016](https://eprints.whiterose.ac.uk/91437/).

</details>

<details>
<summary>Prefer to install by hand, or want to read the install script first?</summary>

Read [install.sh](install.sh) (Mac, Linux) or [install.ps1](install.ps1) (Windows) before running them. To skip the Terminal completely: download `study-duo-chromium.zip` from the [latest release](https://github.com/Coflazo/study-duo/releases/latest), unzip it, then do step 3 above and choose the unzipped folder.

To check the download yourself, compare its checksum with the `SHA256SUMS` file next to it:

```sh
shasum -a 256 study-duo-chromium.zip          # Mac, Linux
Get-FileHash study-duo-chromium.zip           # Windows PowerShell
```

GitHub Actions built every zip from this repository's source and signed a record of that. With the [GitHub CLI](https://cli.github.com) you can check it: `gh attestation verify study-duo-chromium.zip --repo Coflazo/study-duo`. The installers do this for you when `gh` is installed and signed in.

</details>

<details>
<summary>For developers</summary>

You need Node.js 22 or newer.

```sh
git clone https://github.com/Coflazo/study-duo && cd study-duo && npm ci && npm run dev
```

`npm test` runs the unit tests, `npm run test:e2e` runs the browser test, `npm run build` writes the extension to `build/chrome-mv3`. The design spec is in [docs/superpowers/specs](docs/superpowers/specs/2026-10-07-study-duo-design.md).

</details>

## Credits and license

Fonts, sounds and borrowed code are credited in [CREDITS.md](CREDITS.md) once they're added. Found a security problem? See [SECURITY.md](SECURITY.md). Study Duo is free and open source under the [MIT license](LICENSE).
