// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { prepareVercelStaticArtifact } from './vercel-static-artifact.mjs';
import { verifyPreparedVercelDeployment } from './preparedVercelDeployment.mjs';

const roots = [];
const run = promisify(execFile);
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(authentication = 'vercel-oidc') {
  const root = await mkdtemp(join(tmpdir(), 'vizly-telemetry-relay-'));
  roots.push(root); await mkdir(join(root, 'build/assets'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'build/index.html'), '<div id="root"></div>');
  await writeFile(join(root, 'build/assets/app.js'), 'const publicOnly = true;');
  const options = { workspace: root, buildDirectory: 'build', outputDirectory: 'release',
    projectId: 'prj_test', teamId: 'team_test', environment: 'preview',
    telemetryIngestUrl: 'https://backend.example.com/telemetry', telemetryAuthentication: authentication,
    ...(authentication === 'vercel-oidc' ? { telemetryOrigin: 'https://frontend.example.com' } : {}) };
  return { root, options };
}
const verify = root => verifyPreparedVercelDeployment({ artifactDirectory: join(root, 'release'),
  projectId: 'prj_test', teamId: 'team_test', environment: 'preview' });

it('builds and verifies a standalone server relay while browser assets stay byte-identical', async () => {
  const { root, options } = await fixture();
  await prepareVercelStaticArtifact(options);
  const receipt = JSON.parse(await readFile(join(root, 'release/artifact-receipt.json'), 'utf8'));
  expect(receipt).toMatchObject({ version: 2, source: 'compiled-static-assets-and-telemetry-relay',
    telemetryRelay: { authentication: 'vercel-oidc', origin: 'https://frontend.example.com',
      ingestUrl: options.telemetryIngestUrl } });
  expect(receipt.telemetryRelay.files).toHaveLength(3);
  const config = JSON.parse(await readFile(join(root, 'release/.vercel/output/config.json'), 'utf8'));
  expect(config.routes[0]).toMatchObject({ methods: ['POST'], dest: '/__vizly_telemetry_relay' });
  expect(await readFile(join(root, 'release/.vercel/output/static/assets/app.js'), 'utf8')).toBe('const publicOnly = true;');
  await expect(verify(root)).resolves.toMatchObject({ files: 2, telemetryAuthentication: 'vercel-oidc' });
});

it('supports explicit protected Preview options through the actual CLI and refuses duplicate flags', async () => {
  const { root, options } = await fixture();
  const launcher = join(process.cwd(), 'scripts/prepare-vercel-static.mjs');
  const args = [launcher, 'build', 'release', options.projectId, options.teamId, 'preview',
    '--telemetry-url', options.telemetryIngestUrl, '--telemetry-auth', 'vercel-oidc',
    '--telemetry-origin', options.telemetryOrigin];
  await run(process.execPath, args, { cwd: root, timeout: 10000 });
  await expect(verify(root)).resolves.toMatchObject({ telemetryAuthentication: 'vercel-oidc' });
  await expect(run(process.execPath, [...args, '--telemetry-auth', 'vercel-oidc'], { cwd: root, timeout: 10000 })).rejects.toThrow('Usage:');
});

it('runs the closed compiled handler through real Node HTTP with the actual workload-token SDK', async () => {
  const { root, options } = await fixture(); await prepareVercelStaticArtifact(options);
  const handler = join(root, 'release/.vercel/output/functions/__vizly_telemetry_relay.func/index.js');
  const code = String.raw`
    const assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
    (async()=>{
      const token=[{alg:'HS256',typ:'JWT'},{exp:Math.floor(Date.now()/1000)+3600},'synthetic-signature']
        .map((part,index)=>index===2?Buffer.from(part).toString('base64url'):Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
      process.env.VERCEL_OIDC_TOKEN=token;
      const releaseId='a'.repeat(40),operations=['startup','save','connect','reconnect','permission','cas','lease','export','route'];
      const batch={schema:'vizly-telemetry-v1',releaseId,streamId:crypto.randomUUID(),sequence:1,dropped:0,
        metrics:Object.fromEntries(operations.map(operation=>[operation,{started:operation==='startup'?1:0,success:operation==='startup'?1:0,failure:0,cancelled:0}])),
        events:[{schema:'vizly-operation-v1',releaseId,requestId:crypto.randomUUID(),operation:'startup',outcome:'success',code:null,durationMs:1}]};
      let calls=0;
      globalThis.fetch=async(url,options)=>{
        assert.equal(url,'https://backend.example.com/telemetry');assert.equal(options.redirect,'error');
        assert.equal(options.headers['x-vercel-trusted-oidc-idp-token'],token);
        assert.equal(options.headers.Origin,'https://frontend.example.com');
        assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
        assert.deepEqual(JSON.parse(options.body),batch);calls++;return new Response(null,{status:202});
      };
      const handler=require(process.argv[1]).default;assert.equal(typeof handler,'function');
      const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      try{
        const result=await new Promise((resolve,reject)=>{
          const request=http.request('http://127.0.0.1:'+server.address().port+'/telemetry',
            {method:'POST',headers:{Origin:'https://frontend.example.com','Content-Type':'application/json',Authorization:'Bearer browser-control'}},
            response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));});
          request.on('error',reject);request.end(JSON.stringify(batch));
        });
        assert.deepEqual(result,{status:202,body:''});assert.equal(calls,1);
        console.log(JSON.stringify({status:'passed-compiled-relay-HTTP-with-synthetic-workload-token',node:process.version,upstreamRequests:calls,cloudCalls:0}));
      }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    })().catch(error=>{console.error(error.name);process.exitCode=1;});`;
  const allowed = ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'ComSpec', 'PATHEXT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR'];
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.includes(key)));
  const result = await run(process.execPath, ['-e', code, handler], { cwd: root, env, timeout: 10000 });
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'passed-compiled-relay-HTTP-with-synthetic-workload-token',
    upstreamRequests: 1, cloudCalls: 0 });
});

it.each([
  { telemetryAuthentication: 'invalid' },
  { telemetryOrigin: undefined },
  { telemetryOrigin: 'https://frontend.example.com/' },
  { telemetryOrigin: 'http://127.0.0.1:3000' },
  { telemetryIngestUrl: undefined },
  { environment: 'production', productionWebSocketUrl: 'wss://backend.example.com' },
])('refuses incomplete, unsafe or production relay configuration %# before writing a stage', async overrides => {
  const { root, options } = await fixture();
  await expect(prepareVercelStaticArtifact({ ...options, ...overrides })).rejects.toThrow();
  await expect(readFile(join(root, 'release/artifact-receipt.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects a changed handler and a runtime configuration rebound to another entry', async () => {
  const { root, options } = await fixture(); await prepareVercelStaticArtifact(options);
  const handler = join(root, 'release/.vercel/output/functions/__vizly_telemetry_relay.func/index.js');
  const original = await readFile(handler); await writeFile(handler, 'module.exports = () => {};');
  await expect(verify(root)).rejects.toThrow('relay artifact changed');
  await writeFile(handler, original);
  const configuration = join(root, 'release/.vercel/output/functions/__vizly_telemetry_relay.func/.vc-config.json');
  await writeFile(configuration, '{"handler":"other.js","runtime":"nodejs24.x"}');
  await expect(verify(root)).rejects.toThrow('relay artifact changed');
});

it('refuses receipt endpoint drift and an external rewrite in place of the authenticated hop', async () => {
  const { root, options } = await fixture(); await prepareVercelStaticArtifact(options);
  const receiptPath = join(root, 'release/artifact-receipt.json');
  const original = await readFile(receiptPath, 'utf8'); const receipt = JSON.parse(original);
  receipt.telemetryRelay.ingestUrl = 'https://other.example.com/telemetry';
  await writeFile(receiptPath, JSON.stringify(receipt)); await expect(verify(root)).rejects.toThrow('relay receipt');
  await writeFile(receiptPath, original);
  const path = join(root, 'release/.vercel/output/config.json'); const config = JSON.parse(await readFile(path, 'utf8'));
  config.routes[0].dest = options.telemetryIngestUrl; await writeFile(path, JSON.stringify(config));
  await expect(verify(root)).rejects.toThrow('routing mismatch');
});

it.each(['none', 'vercel-oidc'])('rejects unlisted private files and functions for %s artifacts', async authentication => {
  const { root, options } = await fixture(authentication); await prepareVercelStaticArtifact(options);
  await writeFile(join(root, 'release/.env.private'), 'SYNTHETIC-PRIVATE');
  await expect(verify(root)).rejects.toThrow('Unexpected deployment upload');
  await rm(join(root, 'release/.env.private'));
  const hidden = join(root, 'release/.vercel/output/functions/unlisted.func'); await mkdir(hidden, { recursive: true });
  await writeFile(join(hidden, 'index.js'), 'module.exports = () => {};');
  await expect(verify(root)).rejects.toThrow('Unexpected deployment upload');
});

it('refuses a function directory junction before accepting the server artifact', async () => {
  const { root, options } = await fixture(); await prepareVercelStaticArtifact(options);
  const target = join(root, 'outside-function'); const path = join(root, 'release/.vercel/output/functions/__vizly_telemetry_relay.func');
  await mkdir(target); await rm(path, { recursive: true });
  await writeFile(join(target, 'index.js'), 'SYNTHETIC-PRIVATE');
  await writeFile(join(target, '.vc-config.json'), '{}');
  await symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(verify(root)).rejects.toThrow('escaped upload root');
});
