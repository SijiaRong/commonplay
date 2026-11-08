#!/bin/bash
# adv_until.sh target which step
for i in $(seq 1 40); do
 r=$($(dirname "$0")/js.sh "SS('$2')" | python3 -c "import json,sys;print(json.load(sys.stdin)['r'])")
 python3 -c "import sys;sys.exit(0 if float('$r')>=$1 else 1)" && { echo "reached $r"; exit 0; }
 $(dirname "$0")/js.sh "ADV(${3:-0.5});1" 0.6 >/dev/null
done; echo "gave up $r"
