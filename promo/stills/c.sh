#!/bin/bash
# usage: c.sh '<json>'  [port]
curl -s -m 600 -X POST --data-binary "$1" http://127.0.0.1:${2:-9300}/
