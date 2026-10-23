# Release checklist

Steps for publishing Ludus as the public repository `Solomon-69/Ludus`. Nothing here has been
pushed yet.

## 1. Start the public repository from a fresh history

The private history of this folder contains personal details from earlier work, including an
Apple ID used for signing. Rewriting old commits is easy to get wrong, so the public repository
should start from a single clean commit instead:

```sh
# from a clean checkout of the current main branch
git checkout --orphan public-main
git add -A
git commit -m "Ludus 1.5"
# check before pushing: no emails, Apple IDs, Team IDs or personal paths
git grep -nIiE '@(gmail|icloud|me|outlook)\.com|apple ?id|/Users/' -- ':!RELEASE-CHECKLIST.md' || echo "clean"
git remote add public https://github.com/Solomon-69/Ludus.git
git push public public-main:main
```

Keep the old history only in the private copy.

## 2. Before the first public push

- [ ] `git grep` check above prints `clean`
- [ ] `.signing` is not tracked (it is in `.gitignore`)
- [ ] README badges and links point at `Solomon-69/Ludus`
- [ ] `docs/index.html` download links point at `Solomon-69/Ludus`
- [ ] Screenshots in `docs/img/` are current

## 3. Repository settings on GitHub

- [ ] Description: "33 little games in your menu bar. Take a little break."
- [ ] Topics: `macos`, `menu-bar`, `menubar-app`, `games`, `swift`, `windows`, `offline`
- [ ] Social preview image: `docs/img/panel-light.png` (or a 1280x640 crop of it)
- [ ] Pages: deploy from branch `main`, folder `/docs`
- [ ] Private vulnerability reporting: on (Settings > Code security)
- [ ] Issues on, Discussions optional

## 4. Optional: signed and notarised Mac builds

Add these repository secrets (Settings > Secrets and variables > Actions). The release workflow
uses them when all are present and skips signing when they are not:

`MACOS_CERT_P12`, `MACOS_CERT_PASSWORD`, `MACOS_SIGN_IDENTITY`,
`NOTARY_APPLE_ID`, `NOTARY_TEAM_ID`, `NOTARY_PASSWORD`.

Details are at the top of `.github/workflows/release.yml`. Never put these values in a file.

## 5. Cutting a release

- [ ] Bump `CFBundleShortVersionString` and `CFBundleVersion` in `Info.plist`
- [ ] Add a section to `CHANGELOG.md`
- [ ] Tag and push: `git tag v1.5 && git push public v1.5`
- [ ] Check the release has `Ludus.dmg`, `Ludus-mac.zip`, `Ludus-windows.zip` and `SHA256SUMS.txt`
- [ ] Download the dmg on a second Mac and open it once to confirm the first-run steps
