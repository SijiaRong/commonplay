#!/bin/bash
export STILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
# js.sh 'expr' [wait2] [shot]
python3 - "$@" <<'PY' > /tmp/jsreq.json
import json,sys,os
d={'js':open(os.environ['STILLS_DIR']+'/helpers.js').read()+';'+sys.argv[1]}
if len(sys.argv)>2: d['wait2']=float(sys.argv[2])
if len(sys.argv)>3: d['shot']=os.environ.get('STILLS_OUT',os.environ['STILLS_DIR']+'/out')+'/'+sys.argv[3]+'.png'
print(json.dumps(d))
PY
curl -s -m 900 -X POST --data-binary @/tmp/jsreq.json http://127.0.0.1:${PORT:-9300}/ | cut -c1-1500
