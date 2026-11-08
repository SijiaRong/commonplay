#!/bin/bash
export STILLS_DIR="$(cd "$(dirname "$0")" && pwd)"
# shot.sh name 'js expression' [wait]
JS=$(python3 -c "import json,sys,os;print(json.dumps({'js':open('$(dirname "$0")/helpers.js').read()+';'+sys.argv[1],'wait2':float(sys.argv[3]) if len(sys.argv)>3 else 2.5,'shot':os.environ.get('STILLS_OUT',os.environ['STILLS_DIR']+'/out')+'/'+sys.argv[2]+'.png'}))" "$2" "$1" ${3:-2.5})
"$STILLS_DIR/c.sh" "$JS" ${PORT:-9300}
