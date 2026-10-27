# Release and Rollback

Vizly public app releases are gated by the repository CI workflow and by a local
Core package integration check when `@vizly/core` is tested from a local tarball.

## Release gates

- Run `npm run check` before a release candidate is tagged.
- For local Core integration, install the approved `.tgz` from `vizly-core`,
  then rerun `npm run check` in this repository.
- In a disposable integration checkout, use
  `node scripts/install-locked-core-artifact.mjs <approved-core.tgz>`.
  This runs `npm ci` against a temporary Core-only manifest/lock overlay,
  rejects dependency or peer graph changes, and verifies installed versions,
  URLs and integrity values. Source manifests are restored byte-for-byte;
  the installed Core remains available for the following validation gates.
  A later ordinary `npm ci` restores the source-declared Core package.
  Do not use `npm install --package-lock=false` for locked integration checks:
  it can resolve newer unrelated packages even when the source lock stays unchanged.
- Verify the application starts and loads a representative diagram without
  console errors.
- Keep the release artifact provenance clear: record the app commit, the
  `@vizly/core` package version, and whether Core came from npm or a local
  tarball.

## Health and smoke checks

- Build output must be produced by `npm run build`.
- A smoke check should open a representative diagram route and confirm nodes,
  edges, and controls render.
- Browser smoke evidence should avoid user content and credentials.

## Rollback

- Prefer reverting the public app commit when the regression is isolated to this
  repository.
- If the regression follows a Core package change, restore the last accepted
  `@vizly/core` version or tarball and rerun `npm run check`.
- If a deployment is already live, roll back to the last known healthy artifact
  from the hosting provider, then verify the smoke route again.

## Collaboration release procedure

The frontend (`vizly`) and backend (`vizly-collaboration`) are separate Vercel
projects in `hongtaos-projects-76c46461`. Keep a release record for each project:
deployment ID, target environment, exact artifact hashes, configuration names,
source fingerprint, test reports, migration versions and previous production
deployment. A Git SHA alone is insufficient when deploying a dirty local
worktree or a prebuilt artifact containing a locally packed Core.
Artifact preparation receipts describe that build step; keep deployment and
acceptance receipts separately so rebuilding cannot overwrite live status.

For compiled frontend previews, wait for `scripts/prepare-vercel-static.mjs`
to finish, then use `scripts/deploy-prepared-vercel-static.mjs` with the stage
directory, expected project ID, team ID, team scope and installed Vercel CLI
module path, target environment, release manifest path and an explicit `--deploy` flag. Without `--deploy` the command only verifies (dry-run). The launcher requires the completed artifact receipt, verifies
the exact target and every asset hash, and explicitly pins the project/team
environment variables. An unfinished or mismatched stage must fail before
the CLI runs; do not let a raw deploy command automatically create a project.
Verify the returned deployment belongs to the expected project and is READY
before assigning a preview alias.

For production static staging, pass `production` and the intended production
WSS URL to the preparation script after the four existing arguments. The
completed receipt records that environment and the exact quoted endpoint in
compiled JavaScript. Pass `production` after the CLI module argument to the
deployment launcher, followed by the release manifest and `--deploy`. It rechecks the environment, endpoint and asset hashes,
then uses `--prebuilt --prod --skip-domain`; production domains are assigned
only after the staged deployment is accepted. Preview is still the default,
and legacy receipts can only deploy to preview. An environment mismatch or
missing compiled endpoint must fail before the Vercel CLI starts.

Both projects currently use Vercel protection mode `all_except_custom_domains`.
The custom aliases `preview.vizly.fun` and `collab-preview.vizly.fun` are reachable
without Vercel administrator authentication; immutable deployment URLs remain
protected. Record and verify the actual project protection settings for every
release. Application identity, role and origin checks still protect business
operations. A successful `/health` check proves process readiness only.
Accept the distinct-account scenarios in [COLLABORATION.md](COLLABORATION.md)
against these deployed services, including concurrent edits and deletion,
viewer denial, connected-session revocation, remote cursors, reconnection after
function expiry, persistence and recovery. Verify that a browser retaining an
old generation cannot restore discarded edits after recovery.

Before staging production:

1. Accept the current complete local gates and browser gates. Confirm test
   discovery matches the expected file inventory and that inputs did not change
   during the run. A focused retry does not replace a failed complete run.
2. Verify the applied atomic-store and private-topic migrations, their grants,
   RLS and RPC signatures on the selected Supabase project. Preserve the
   backend-only role boundary and a tested recovery backup.
3. Confirm Production and Preview configuration separately. Store
   `SUPABASE_SERVER_KEY` only as a backend Secret. Use exact HTTPS frontend
   origins and keep the production WSS URL out of the preview configuration.
4. Verify the immutable compiled Core package and clean-install delivery path.
   A `file:` path outside the application checkout is not available to a remote
   CI runner. A compiled tarball under the application's tracked `vendor/`
   directory is portable when its license permits distribution and its lockfile
   integrity matches the accepted artifact. Verify `npm ci` in a clean checkout.
   Do not publish an SDK or upload private Core source to bypass this gate.
5. Record the deployment currently serving each production domain. An older
   deployment marked READY is a rollback candidate, not proof it remains
   compatible with the current schema and frontend protocol.

Stage the backend with Production configuration without assigning production
domains (`vercel deploy --prod --skip-domain`). Validate that exact staged
deployment, including actual secret-key RPC and private Realtime access. Then
prepare the frontend with its intended production WSS endpoint and stage its
compiled artifact through the verified production static launcher described
above (`vercel deploy --prebuilt --prod --skip-domain`).
Use the project-specific authenticated access path for protected checks; never
embed a protection credential in frontend assets or in a URL.

Promote only the accepted staged **production** deployments. Promoting a
preview can rebuild it with different environment variables and does not
release the tested artifact. Assign the backend endpoint first and verify
origin admission, then release the frontend. Finally verify normal user access
without Vercel administrator authentication and repeat a bounded cloud
save/reload/collaboration smoke check. Record error rates, failed admissions,
lease/CAS failures, reconnect behavior and recovery outcomes using bounded
event metadata; exclude credentials, user content and WebSocket payloads.

## Collaboration rollback procedure

Record exact previous deployments before any domain assignment. There is no
accepted previous application collaboration backend yet: the capability probe
is not an application rollback target.

- For a frontend regression, restore the accepted previous frontend deployment
  and verify diagram load, local save/reopen and cloud save. Confirm its
  collaboration protocol remains compatible with the active backend.
- For a backend regression, restore an accepted compatible backend deployment
  and recheck admission, persistence and reconnect. If no compatible backend
  exists, release an accepted frontend configuration with collaboration
  unavailable and explicit disconnected status; do not route users to the
  capability probe or report unsynchronized edits as saved.
- Keep additive collaboration schema and stored room/recovery records during
  an application rollback. Do not drop tables, reopen client grants or restore
  the unleased RPC as a rollback shortcut. A data restoration is a separate
  operation requiring a verified backup and a generation change that fences
  old browsers and leases.
- `vercel rollback` disables automatic production domain assignment. Record
  that state; resume normal release assignment through `vercel promote` only
  after verifying the replacement deployment.

Health and rollback commands alone do not constitute a recovery drill. Keep
release acceptance incomplete until the exact restored deployment and the
retained data are verified through the browser and backend.



## T08 发布凭证检查（工程实现，真实发布与回滚仍待验收）

部署入口现在强制调用 `scripts/lib/releaseEvidence.mjs`。凭证缺失不会退回旧的仅文件校验模式。验证命令本身不访问网络、不上传、不启动 Vercel CLI：

```sh
node scripts/verify-release-evidence.mjs ARTIFACT RELEASE_MANIFEST PROJECT_ID TEAM_ID preview candidate
node scripts/verify-release-evidence.mjs ARTIFACT RELEASE_MANIFEST PROJECT_ID TEAM_ID production promotion
node scripts/deploy-prepared-vercel-static.mjs ARTIFACT PROJECT_ID TEAM_ID SCOPE VERCEL_CLI_MODULE production RELEASE_MANIFEST --dry-run
```

候选检查需要固定的 32 项工程门禁，以及 App/Core 各自 Gitea macOS、Windows、Linux、汇总的 8 项收据。成功的本地回归不能替代这些 CI 收据。晋级检查只接受 production 产物，还要求真实账号、多实例、生命周期、诊断及上一兼容产物保存／重开／协作回退收据。候选上传用于验收 staging，因此候选阶段不要求尚未部署的 staging 结果；通过候选检查不能视为可晋级。当前晋级检查仅输出验证结果，真实推广与回滚仍必须记录实际部署 ID、域名绑定及运行结果。

`vizly-release-v1` 凭证包含：

- `identity`：App/Core 各自的 `repository`、40 位 `commit` 与 `tree`、锁文件 `lockSha256`、`clean: true`；SDK 版本与 SHA256；完整前端 `.vercel/output`（含路由配置）和后端编译目录的 SHA256；配置摘要与迁移清单 SHA256；项目、团队和环境。
- `sdkArtifact`、`backendDirectory`：相对凭证目录的本地文件／目录。后端按完整目录清单计算哈希，新增文件也会使旧凭证失效；拒绝符号链接、路径越界、源码扩展名和超出容量限制的文件。
- `configuration`：经脱敏的配置摘要，不保存凭证、token、私钥或环境文件；`migrations` 为 `{version, sha256}` 清单。摘要和清单必须与受测构建、目标数据库核对。
- `gates`：`{id, path, sha256}`，指向 `vizly-release-gate-v1` 收据。收据记录相同的 `identitySha256`、`status: passed`、`exitCode: 0`，并引用带 SHA256 的原始报告 `evidence`。Gitea 收据另须记录 `provider`、仓库、commit、workflow 与 runId。
- 晋级时的 `previousCompatible`：实际上一部署的 `deploymentId`、其 `releaseIdentitySha256`、`databaseRollback: additive-compatible`。回退 smoke 收据还要绑定该对象的 `rollbackIdentitySha256`，不能更换回退目标后复用旧测试。

对象哈希使用模块导出的 `canonical`／`digest`，递归排序对象键，保留数组顺序。前后端目录哈希使用 `compiledTreeDigest`。这些是完整性与误操作门禁，不是签名认证系统：只能使用可信 CI 导出的原始报告，不能手工把本地、旧提交或 synthetic 报告改写成正式 CI 成功。测试辅助 `releaseEvidenceFixture.mjs` 仅生成明确标注 synthetic 的单测输入，不是交付凭证生成器。

当前已实现验证器和部署入口拦截；可信 CI 收据导出／汇集、实际候选部署、T09 真实服务验收及兼容回退演练仍未完成。现有脏工作树和历史本地全绿记录不能直接满足正式发布条件。所有原始失败记录应保留，重试收据单独保存。数据库回退不得删除表或放宽权限。


### Gitea 原始证据导入

`node scripts/import-native-release-evidence.mjs app|core IDENTITY_JSON GITEA_EXPORT_JSON NEW_OUTPUT_DIRECTORY` 只导入完整的原生 CI 结果，不运行门禁，不改变原始结果，不发布。输出目录必须不存在。两仓生成的文件名有各自前缀，可原样汇集到同一个发布凭证目录；`app-import.json`／`core-import.json` 中的 gate 引用供汇集器使用。

输入导出必须来自已认证的 Gitea API，格式为 `vizly-gitea-native-v1`：包括 provider、完整仓库名、经核实的 `devfleet-native.yaml` workflow、run 的 id/head_sha/status/conclusion，以及 macos/windows/linux/native-complete 四个 job 的 id/name/status/conclusion。前三个 job 另带执行器实际输出的 `native_result`。工作区工具 `quality-baseline/collect-gitea-native.py` 已通过 DevFoundry 的既有 SSH/API 连接导出实际元数据；只保存字段白名单，不保存完整日志、凭证或任意工作树路径。

导入器要求执行器输出 `vizly-native-v2`：当前固定 Node 22.23.4/npm 12.0.1、实际 OS、project、native-only 范围、`deployment: false`；执行前后的 source/tree/lock 哈希与选定源完全一致，工作树状态为空；预定每个检查均必须存在、无重复且退出码为 0。发布前验证器再次解析原始导出，不只检查包装收据的 `passed`。三系统与汇总必须来自同一完整成功运行；旧提交、排队、跳过、单系统成功、旧 Node 或缺少工作树证据均不满足条件。

现有历史执行器没有完整 v2 字段，不能事后补写它未采集的证据。执行器 v2 源码和工作流自检已补入两仓；runner 主机的工具链配置、采用当前提交的实际 CI 运行及工程／staging 报告汇集仍待验收。导出失败运行是调查证据，不是发布许可；原始 API 导出与收据哈希仍须来自受信任的运维工作目录，文件哈希不能代替来源认证。


### 原生执行器 v2

两仓 `.devfleet/native_ci.py` 延用 Gitea 现有工作流与独立 runner 标签。工作流先执行 `.devfleet/test_native_ci.py`，再运行原有 native gate 列表。执行器要求 Node 22.23.4/npm 12.0.1，旧版本在安装前即失败；不得把版本检查降回旧值来绕过升级。`VIZLY_CI_STATE` 和 `VIZLY_CI_LOCK` 必须在源码目录外；状态目录保存独立时间戳收据，保留此前尝试。整个执行不部署、不发布包。

安装失败不运行后续门禁；单项门禁失败仍收齐其余项目，但最终状态保持失败。检查前后都读取实际 Git commit/tree、锁文件哈希与工作树状态；脏输入或漂移不予通过。工作树只记录 clean/dirty，不记录任意路径；异常文本不写入结构化收据。主机凭证和云配置不继承给安装／测试进程，原有共享资源锁保持不变。

执行器测试包含真实临时 Git 仓库及 Node/Python CLI 链路，npm/业务检查体是合成输入，仅验证执行器行为。两仓源码的定向自检成功不能代替 Gitea 三系统实际执行。2026-10-26 已逐个核验并更新 Vizly 专用 runner 配置与 provisioning 模板到 Node 22.23.4，默认 npm/npx 为 12.0.1；Linux 两个服务空闲切换后保持 active，Mac/Windows 保持原停用状态，六个 runner 身份未改变。执行器自检在三系统各 9/9 通过；尚未运行当前提交的正式产品 CI。Windows npm 12 仍通过保留的旧 Node 目录供给，旧目录不可清理。

### Linux business checks

`.gitea/workflows/devfleet-business.yaml` complements the native workflow on the
existing `vizly-app-linux` runner. Its integration profile runs database paths,
RLS, S3, collaboration build and both collaboration load commands; a separate
security profile runs the complete dependency audit. The browser profile installs
the pinned Playwright Chromium, Firefox and WebKit engines, then runs main,
recovery, isolated S3 browser and compatibility suites. Every profile installs
from the lockfile and uses the existing shared resource lock, sanitized child
environment and pinned Node 22.23.4/npm 12.0.1. Docker must be available to the
Linux runner for database/storage checks. This workflow does not install host
services, deploy or publish. Browser service libraries must already be
provisioned on the Linux runner; no privileged `--with-deps` installation runs
in CI. Browser downloads use the outside-checkout runner state directory,
and the existing shared lock serializes all profiles and native jobs.
Full real-service/staging acceptance remains separate.

The executor refuses dirty input and records source/tree/lock hashes before and
after execution. JSON receipts live outside the checkout and expose only
allowlisted metadata, commands, timings and exit codes. `VIZLY_BUSINESS_RESULT`
is original execution evidence, not a ready-to-promote release manifest.

The added required gate IDs are `app-database-paths`,
`app-collaboration-auth-load`, `app-collaboration-mixed-load` and
`app-browser-compatibility`. All eleven business gate wrappers (six integration
commands, security and four browser suites) require a
`vizly-gitea-business-v1` API export. It must contain a successful completed run
for the selected App commit, exactly the `business-integration`,
`business-security`, `business-browser` and `business-complete` jobs, and all three original
executor results (`vizly-business-v1` for integration/security and
`vizly-business-v2` for browser). The verifier checks source/tree/lock
hashes, clean inputs, pinned runtime, commands and exits, then binds every
wrapper's repository, workflow, commit, run ID and job ID to that export.

Export a selected actual run through DevFoundry's existing authenticated
connection, without saving credentials or full job logs:

```sh
python3 -B .devfleet/collect_business_evidence.py \
  --repository juhon/Vizly --run RUN_ID --output NEW_GITEA_EXPORT_JSON \
  --devfoundry-scripts /path/to/DevFoundry/scripts
node scripts/import-business-release-evidence.mjs \
  IDENTITY_JSON NEW_GITEA_EXPORT_JSON NEW_OUTPUT_DIRECTORY
```

`IDENTITY_JSON` contains the selected release identity, either directly or under
`identity`. The importer validates the complete run before creating output;
it refuses existing output directories. Its eleven gate files and
`app-business-import.json` contain hashes for the release manifest; retain the
original `app-gitea-business.json` beside them. Importing these gates does not
satisfy native, real-service, promotion or rollback gates. The browser profile
also requires a successful engine installation receipt. These are
operator-collected integrity records, not signed attestations.

The engine installation gate also runs `node scripts/check-ci-browser-runtime.mjs`.
Each engine must launch headlessly, fill and submit a local DOM form, and close
its context and browser successfully. Page requests are blocked. A missing
binary, startup/library failure, interaction failure or cleanup failure rejects
the gate; the probe still checks the remaining engines and exports only fixed
status fields and browser versions, never exception text. Engine download alone
cannot satisfy this gate.

Browser v2 receipts additionally require private JSON reporter output from each
suite. The executor validates every case against the original report: a positive
case count, one passing attempt per case, no expected failures, skipped/flaky/
unexpected cases or global errors, and matching summary counts. Receipts and API
exports retain only counts and the report SHA256. Raw reports may contain test
bodies or attachments and stay in newly created private directories outside the
checkout; they are not printed or included in the release API export. A legacy
browser v1 receipt cannot satisfy the current gate and requires a new run.
After lockfile installation, the runtime gate also runs the parser's negative
checks against actual Playwright CLI reports, including zero-exit skipped,
flaky and expected-failure cases, before installing and launching the engines.

### Core additional quality evidence

The six motion/evidence/security gates require a `vizly-gitea-quality-v1` API
export from Core's `devfleet-quality.yaml`. It must contain the selected clean
Core commit, successful `core-quality` and `quality-complete` jobs, and the
original `vizly-core-quality-v1` executor result. The verifier rechecks all six
exact argument lists, exits, timings, fixed tools and before/after source/tree/
lock hashes, then binds each wrapper to that run and job.

```sh
python3 -B /path/to/core/.devfleet/collect_quality_evidence.py \
  --repository juhon/vizly-core --run RUN_ID --output NEW_CORE_EXPORT_JSON \
  --devfoundry-scripts /path/to/DevFoundry/scripts
node scripts/import-core-quality-release-evidence.mjs \
  IDENTITY_JSON NEW_CORE_EXPORT_JSON NEW_OUTPUT_DIRECTORY
```

The collector retains allowlisted API/executor metadata and discards log bodies
and unknown fields. The importer validates the full run before creating output,
refuses existing output directories, and produces six gate wrappers plus a
`core-quality-import.json` hash inventory and original `core-gitea-quality.json`.
These operator-collected integrity records are not signed attestations. They do
not satisfy the native, SDK host, website, real-service or promotion gates.
Current interoperability tests use synthetic API responses; actual selected-
source Gitea execution and authenticated export/import acceptance remain pending.

Incomplete job inventories, ambiguous executor markers, failed profiles,
source drift and mismatched wrapper metadata are rejected. Current local
tests use synthetic API fixtures; actual committed-source execution and
authenticated export/import acceptance remain unverified until the selected
Gitea run is executed. The browser workflow is implemented but its actual Linux
execution, shared-host dependency readiness and API job names still require
verification on that run. Existing local browser results remain separate evidence.
