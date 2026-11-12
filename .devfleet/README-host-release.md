# Core host and performance release evidence

The release verifier requires `core-browser-host` and four Core performance gates:
navigation, business editing, saved documents and the 200-node large graph.
These receipts originate in Core's `devfleet-host-performance.yaml` workflow.

After exporting the completed workflow with Core's `collect_host_evidence.py`,
run:

```sh
node scripts/import-core-host-release-evidence.mjs \
  /absolute/identity.json /absolute/core-host.json /absolute/new-output-directory
```

The identity must name the exact clean App and Core commits, trees,
lockfiles and selected SDK SHA256. The importer checks the pinned App source in
Core's receipt as well as Core's own source, SDK inventory, browser stability,
all preparation steps, all five command outcomes and repeated performance
budgets. Both the host executor and its aggregate must have succeeded.

The final release verifier reads the original exported receipt again; refreshing
wrapper hashes cannot make changed source, SDK or over-budget results acceptable.
Synthetic fixtures, manual runs and older App commits cannot satisfy these gates.
Importing evidence neither pushes source nor deploys the site.
