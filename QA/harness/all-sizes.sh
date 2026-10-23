#!/bin/zsh
# usage: QA/harness/all-sizes.sh <test.js>   (runs one size at a time, light and dark)
D=$(cd $(dirname $0) && pwd)
for sz in compact large wide widelarge; do for d in "" "--dark"; do
  echo "== $1 $sz $d"; node $D/run.js $D/$1 --size $sz $d | python3 -c "import json,sys;d=json.load(sys.stdin);print('errors',d['errors'][:2]);print(json.dumps(d['result'])[:1500])"
done; done
