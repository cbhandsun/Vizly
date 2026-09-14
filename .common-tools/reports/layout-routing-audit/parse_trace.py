import json
from pathlib import Path
for line in Path('.common-tools/reports/layout-routing-audit/latest-precompiled-wms-trace-all-after-stub-skip.jsonl').read_text(encoding='utf-8').splitlines():
    if line.startswith('All phases for wms-process-flow-v1: '):
        phases=json.loads(line.split(': ',1)[1])
        break
else:
    print('no all phases')
    raise SystemExit(1)
parents={'final-safety-repair-order','final-endpoint-closure','final-commercial-safety-closure','final-safety-closure'}
interesting={'final-safety-repair-order','final-commercial-safety-closure','final-safety-closure','final-endpoint-closure'}
for ph in phases:
    if ph.get('parentPhase') in parents or ph.get('phase') in interesting:
        keys=['phase','parentPhase','durationMs','exclusiveDurationMs','candidateCount','changedEdgeCount','evaluationCount','cacheHitCount','scannedNodeCount','scannedEdgePairCount','workItemCount','resolution']
        print(json.dumps({k:ph.get(k) for k in keys if k in ph}, ensure_ascii=False))
