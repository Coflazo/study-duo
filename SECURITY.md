# Security

## Reporting a problem

Please report security problems privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. Don't open a public issue for them. You'll get an answer as soon as possible.

## How Study Duo is built to be safe

No software can promise to be perfectly secure. These are the choices Study Duo makes to keep the risk small:

- There is no Study Duo server, no analytics and no remote configuration. Your data is never uploaded by Study Duo.
- The extension runs only the code shipped in it. Manifest V3 forbids loading remote code, and the content security policy blocks all network access from extension pages unless you switch on a connection.
- It asks for the fewest permissions it needs. Connections (Google Calendar, Last.fm, ListenBrainz) request their permissions only when you turn them on, and give them back when you turn them off.
- The script it adds to web pages only draws the clock and the phase text inside a closed shadow root. It never inserts page-provided text as HTML.
- Sign-ins use OAuth with PKCE. No client secrets are shipped. Access tokens are kept in memory.
- Dependencies are few and pinned. CI runs CodeQL, gitleaks and dependency audits. GitHub Actions are pinned to exact commits.
- Releases are built by GitHub Actions from tagged commits and published with SHA-256 checksums and build attestations, so you can check that a download matches this source.

Your history lives in your browser profile on your computer. It is as safe as your computer account; Study Duo does not add its own encryption on top.

## Known advisories in development tools

`npm audit` reports `node-forge` advisories through `web-ext`, the Mozilla tool used during development to run Firefox (it uses `node-forge` only for Android debugging). It is a development dependency and is not part of the extension you install. No fixed `node-forge` version exists yet; this note will be removed when one does.
