# Privacy

Study Duo has no server. What it records stays in your browser, on your computer, and unless you switch on a connection it sends nothing anywhere.

## What stays on your computer

Everything Study Duo records is stored in your browser, in the extension's own storage, and never sent anywhere by Study Duo:

- your settings, to-do list and site lists;
- each study block and break: start, end, the task you picked, whether it ran to the end, pauses, time added with +5, and your focus rating;
- while the timer runs, how long the page in front was a Study, Blocked, Not blocked or unfiled site, by site name only (for example `youtube.com`), never full addresses, titles or page text;
- time away from the browser (another app, idle or locked), counted as away, never as distraction;
- each time you try to open a blocked site during a block, and whether you opened it anyway (never the reason you typed);
- songs that played while the timer ran (a study block or a break, never otherwise): title, artist and album from music sites (YouTube Music, YouTube, Spotify, Apple Music, SoundCloud, Tidal, Deezer, Amazon Music) as the site tells your browser, from your own files, and which focus sound played. On YouTube that is the video title and channel, so a lecture video playing during a block is kept too; turn off Songs you play in Your data to keep none;
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
| Last.fm | A request for your own recent tracks, with your username and your API key | ws.audioscrobbler.com | Every 30 minutes |

What comes back stays on your computer: deadlines become to-dos with their due date, and songs are kept only when they played during a study block or break, like the songs in your tabs. With Songs you play off in Your data, no listening history is asked for at all. Disconnecting stops all requests to that service at once; the to-dos and songs already brought in stay until you delete them.

Like any web request, each one also shows that service your IP address, that you use a browser, and when your browser is open. The course link and the Last.fm key are kept in the extension's own database, which web pages cannot read.

One part of the code makes every request, and it refuses any address that does not belong to a connection you switched on. With all of them off, Study Duo makes no internet requests. Those services handle requests under their own privacy policies.

Google Calendar sync is planned for a later version.

## Contact

Questions: open an issue on this repository.
