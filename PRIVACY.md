# Privacy

Study Duo has no server. What it records stays in your browser, on your computer, and unless you switch on a connection it sends nothing anywhere.

## What stays on your computer

Everything Study Duo records is stored in your browser, in the extension's own storage, and never sent anywhere by Study Duo:

- your settings, to-do list and site lists;
- each study block and break: start, end, the task you picked, whether it ran to the end, pauses, time added with +5, and your focus rating;
- while the timer runs, how long the page in front was a Study, Blocked, Not blocked or unfiled site, by site name only (for example `youtube.com`), never full addresses, titles or page text;
- time away from the browser (another app, idle or locked), counted as away, never as distraction;
- each time you try to open a blocked site during a block, and whether you opened it anyway (never the reason you typed);
- songs that played while the timer ran (a study block or a break, never otherwise): title, artist and album from music sites (YouTube Music, Spotify, Apple Music, SoundCloud, Tidal, Deezer, Amazon Music) as the site tells your browser, from your own files, and which focus sound played. Videos on YouTube itself are never read or kept (versions before 0.2.3 kept their titles; updating deletes them). Turn off Songs you play in Your data to keep none. Whether it is on or off, the popup and the side panel show the song a music site is playing in a tab, so you can pause or skip it from there; that is held only while the browser is open and never kept;
- if you pick a music folder: the folder you allowed (the browser keeps the permission; Chrome asks again after a restart), each song's file path, title, artist, album and genre, and a small copy of its cover picture with its main colour. The songs themselves are read only while they play and are never copied. Forget folder on the Music page, or Delete everything, removes all of it;
- only if you turn it on (off by default): how many keys, clicks and scrolls per minute during study blocks, never which key, and never in password fields.

Study Duo never uses your microphone or screenshots. It uses the camera only while you scan move codes in Your data, Move to another computer: the picture is read in memory to find the code, never kept or sent, and the camera turns off when the codes are read, when you press Cancel, and when you leave the screen or switch to another tab.

**Your data** in the dashboard lists each of these with its own switch, shows how much is stored, keeps history for a period you choose (a year unless you change it), exports everything as one file, and deletes everything.

Study Duo does not run in private (Incognito) windows, so nothing from them is recorded.

## Optional connections

These are off until you turn them on in Connections. Each one sends only what is listed, directly from your browser to that service, with no cookies and no referrer:

| Connection | What is sent | Where | How often |
|---|---|---|---|
| Course deadlines | A request for the calendar link you pasted | The site that hosts it (for example your school's Canvas) | Every 6 hours, and when you press Check now |
| ListenBrainz | A request for your own recent listens, by your username | api.listenbrainz.org | Every 30 minutes |
| Last.fm | A request for your own recent tracks, with your username and your API key. Last.fm does not say which app played a song, so these songs are shown but never used for insights, in case Spotify played them | ws.audioscrobbler.com | Every 30 minutes |
| Google Calendar | Each finished study block and break as an event in a "Study Duo" calendar that Study Duo makes in your Google account: start and end, your time zone, the task and its course, the block number of the day and your daily goal, your focus rating, whether it ended early (minutes done of minutes planned), for a break the task it followed, and, unless you switch it off, the Study sites you used (site names and minutes) and the songs you heard in the browser, from your files or through ListenBrainz (never Spotify's, and never Last.fm's, which does not say which app played them) | www.googleapis.com, with your Google sign-in; oauth2.googleapis.com only to hand the sign-in back on Disconnect | When each block or break ends, and every 30 minutes for anything missed |

What comes back stays on your computer: deadlines become to-dos with their due date, and songs are kept only when they played during a study block or break, like the songs in your tabs. With Songs you play off in Your data, no listening history is asked for at all. Disconnecting stops all requests to that service at once; the to-dos and songs already brought in stay until you delete them.

Like any web request, each one also shows that service your IP address, that you use a browser, and when your browser is open. The course link and the Last.fm key are kept in the extension's own database, which web pages cannot read.

One part of the code makes every request, and it refuses any address that does not belong to a connection you switched on. With all of them off, Study Duo makes no internet requests. Those services handle requests under their own privacy policies.

Google Calendar uses one permission, "Make secondary Google calendars, and see, create, change, and delete events on them": Study Duo can only reach the calendar it made, never your other calendars. You sign in with Google's own window; Study Duo never sees your password. The sign-in token stays in the browser's memory, is never written to disk by Study Duo, and is handed back to Google (revoked) when you press Disconnect. The Study Duo calendar and its events stay in your Google account until you delete them there; Disconnect stops new events at once. Google keeps what it receives under its own privacy policy.

## Streaming links (optional)

Spotify, SoundCloud, Apple Music and Tidal links work the way YouTube links do, below: nothing reaches a service until you paste a link and press Play, its own embedded player (open.spotify.com, w.soundcloud.com, embed.music.apple.com, embed.tidal.com) then loads in the side panel and sees what any embedded player sees, and it loads again only while that service is the source with the panel open. Sign in opens the service's own sign-in page in a small window: you sign in with the service, not with Study Duo, which never sees your password or any token. Study Duo keeps the links you played on this computer and never keeps what streaming players play as listens.

## YouTube links (optional)

Nothing reaches YouTube until you paste a link and press Play. Then, and whenever YouTube is the source while the side panel is open, the panel loads YouTube's own player from www.youtube-nocookie.com, which sees what any embedded YouTube video sees: your IP address, the video, and that it plays on Study Duo's site (Study Duo sends coflazo.github.io as the page it plays on, because YouTube refuses to play without one). YouTube sets its cookies only once the video plays. Study Duo keeps the links you played, with their titles, on this computer, never the parts of a shared link that say who shared it, and never keeps YouTube plays as listens. Forget a link in Streaming, or Delete everything, to remove them.

## The desktop helper (optional)

If you install it (the install line with `--helper`) and turn on Desktop apps in Connections, a small script on your computer tells Study Duo the title, artist, album and app name of the song your desktop music player is playing: Music or Spotify on a Mac, the players your Linux desktop knows, or the Windows media controls. Browsers are skipped there, since Study Duo reads music sites itself. On a Mac it asks Music and Spotify through Apple Events, so macOS asks you once whether your browser may control them; that permission lets the browser do more than read the song, and it stays after you remove the helper until you take it back in System Settings, Privacy and Security, Automation (or with `tccutil reset AppleEvents com.google.Chrome`). It reads nothing else, writes no files, makes no network connections and answers only Study Duo. Those songs follow the same rules as songs in your tabs: kept only during study blocks and breaks, and not at all while Songs you play is off. Spotify's app is shown but never used for insights. Turning Desktop apps off stops the script and gives back the permission it needed.

## Updates in Firefox

Firefox, not Study Duo, checks for a newer version about once a day: it asks coflazo.github.io/study-duo/updates.json, which GitHub Pages hosts. That request carries what any visit to a web page carries (your IP address, and that a browser asked for that file); it says nothing about your study blocks, sites or music. Chromium browsers do not check: you update them by running the install line again.

## Contact

Questions: open an issue at [github.com/Coflazo/study-duo/issues](https://github.com/Coflazo/study-duo/issues).
