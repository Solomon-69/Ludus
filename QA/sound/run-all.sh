#!/bin/bash
# All sound tests, silent and headless: every game (in groups of 8), the interface sounds, and the room sounds.
# bash QA/sound/run-all.sh      (from the repo root; needs the same playwright-core + Chromium as QA/harness)
cd "$(dirname "$0")/../.." || exit 1
fail=0
IDS=$(node QA/harness/run.js QA/sound/list.js 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.join(" ")))')
set -- $IDS; chunk=""; n=0
group() {
  { cat QA/sound/init.js; echo "window.__onlyGames='$1'; window.__offCount=3;"; } > "${TMPDIR:-/tmp}/ludus-sound-init.js"
  out=$(node QA/harness/run.js QA/sound/drive.js --init "${TMPDIR:-/tmp}/ludus-sound-init.js" 2>&1)
  echo "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const x=r.result||{};for(const[k,v]of Object.entries(x.fired||{}))console.log((v?"PASS ":"FAIL ")+k+": "+(v||"no sound"));if((x.offLeaks||[]).length)console.log("FAIL sound off leaked: "+x.offLeaks);if(r.errors.length)console.log("FAIL errors: "+r.errors.join(" | ").slice(0,600));process.exit(x.silent&&!x.silent.length&&!(x.offLeaks||[]).length&&!r.errors.length?0:1)})' || fail=1
}
for id in "$@"; do chunk="$chunk,$id"; n=$((n+1)); if [ $((n % 8)) -eq 0 ]; then group "${chunk#,}"; chunk=""; fi; done
[ -n "$chunk" ] && group "${chunk#,}"
node QA/harness/run.js QA/sound/ui.js --init QA/sound/init.js | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const f=(r.result||{}).fails||["no result"];console.log(f.length||r.errors.length?"FAIL ui: "+f.concat(r.errors).join(" | "):"PASS ui: "+Object.keys(r.result.heard).length+" interface sounds");process.exit(f.length||r.errors.length?1:0)})' || fail=1
node QA/sound/online-sound.js || fail=1
[ $fail = 0 ] && echo "SOUND: ALL PASS" || echo "SOUND: FAILED"
exit $fail
