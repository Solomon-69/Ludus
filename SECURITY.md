# Security policy

## Supported versions

Only the latest release of Ludus gets fixes. Please update before reporting.

## Reporting a problem

Please do not open a public issue for security problems. Report them privately through
GitHub instead: open the repository's **Security** tab and choose **Report a vulnerability**
([direct link](https://github.com/Solomon-69/Ludus/security/advisories/new)).

Include what you found, the steps to reproduce it, and the Ludus version and system you used.
You should hear back within a week. Once a fix is released, you are welcome to be credited in
the release notes.

## What Ludus can and cannot do

Ludus is designed to need as little trust as possible:

- It makes no network connections unless you use the optional Play online feature (opt-in per room;
  see PRIVACY.md and web/ONLINE.md). There are no accounts, analytics, ads or update checks. Everything
  received from a room is treated as untrusted data: parsed as JSON, type and range checked, never run
  as code and never inserted into the page as HTML.
- The games run in a web view that only loads files bundled inside the app. Any other page
  or link is blocked.
- It asks for no special permissions: no accessibility access, no screen recording, no files
  outside its own preferences.
- On Mac, the only thing it changes outside itself is an optional login item when you turn on
  **Open at login**.

If you find Ludus doing anything outside this list, that is a bug worth reporting.

## Checking a download

Each release includes `SHA256SUMS.txt`. After downloading, you can check a file with:

```sh
shasum -a 256 -c SHA256SUMS.txt --ignore-missing
```
