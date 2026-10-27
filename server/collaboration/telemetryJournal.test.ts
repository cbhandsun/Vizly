// @vitest-environment node
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { createOperationTelemetry } from '../../src/observability/operationTelemetry.js';
import { createTelemetryJournal, queryTelemetryJournal } from './telemetryJournal.js';

const runWindowsAcl = (path: string, script: string) => promisify(execFile)('powershell.exe', [
 '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script,
], { env: { ...process.env, VIZLY_TEST_PRIVATE_FILE: path }, timeout: 10_000, windowsHide: true });

async function privateDirectory() {
 const directory=await mkdtemp(join(tmpdir(),'vizly-telemetry-'));
 try {
  if(process.platform==='win32') {
   // Model the journal's documented caller-provided private directory. The
   // system TEMP directory may intentionally inherit unrelated read grants.
   await runWindowsAcl(directory,`$ErrorActionPreference='Stop'
$current=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($current)
$acl.SetAccessRuleProtection($true,$false)
foreach($id in @($current.Value,'S-1-5-18','S-1-5-32-544')){
 $sid=[Security.Principal.SecurityIdentifier]::new($id)
 $rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $env:VIZLY_TEST_PRIVATE_FILE -AclObject $acl`);
  }
  return directory;
 } catch(error) {await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});throw error;}
}

async function expectPrivateFile(path: string) {
 // Windows fs.mode does not implement owner/group/other distinctions:
 // https://nodejs.org/docs/latest-v22.x/api/fs.html#fschmodpath-mode-callback
 if (process.platform !== 'win32') {
  expect((await stat(path)).mode & 0o077).toBe(0);
  return;
 }
 // Check the real Windows ACL. SYSTEM and Administrators are privileged peers
 // of Unix root; no other principal may receive an allow rule for file data.
 const script = `$ErrorActionPreference='Stop'
$acl=Get-Acl -LiteralPath $env:VIZLY_TEST_PRIVATE_FILE
$current=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed=@($current,'S-1-5-18','S-1-5-32-544')
$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
$readers=@($rules|Where-Object{
 $_.AccessControlType -eq 'Allow' -and
 ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::ReadData) -ne 0 -and
 $_.IdentityReference.Value -notin $allowed
})
$owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
[Console]::Out.Write([string]($rules.Count -gt 0 -and $readers.Count -eq 0 -and $owner -in $allowed))`;
 const { stdout } = await runWindowsAcl(path,script);
 expect(stdout.trim()).toBe('True');
}

it('persists projected events, supports release/request lookup after reopening and deduplicates retries',async()=>{
 const directory=await privateDirectory();
 const journal=createTelemetryJournal(directory);
 const t=createOperationTelemetry({releaseId:'a'.repeat(40),transport:journal.accept});
 try {
  t.begin('reconnect')('failure','network');await t.flush();
  const rows=await queryTelemetryJournal(directory,{releaseId:'a'.repeat(40)});
  expect(rows).toHaveLength(1);const id=rows[0].events[0].requestId;
  await journal.accept({...rows[0],token:'CANARY'} as typeof rows[0],new AbortController().signal);
  expect(await queryTelemetryJournal(directory,{releaseId:'a'.repeat(40),requestId:id})).toHaveLength(1);
  expect(await queryTelemetryJournal(directory,{releaseId:'b'.repeat(40)})).toHaveLength(0);
  expect(await readFile(join(directory,'telemetry-0.jsonl'),'utf8')).not.toContain('CANARY');
  await expectPrivateFile(join(directory,'telemetry-0.jsonl'));
  // Prove that the platform-specific check also rejects an actual broad read
  // grant. This file contains only a synthetic fixture, never journal contents.
  const negative=join(directory,'privacy-negative.txt');
  await writeFile(negative,'Synthetic ACL fixture',{mode:0o600});
  if(process.platform==='win32') {
   const script=`$ErrorActionPreference='Stop'
$path=$env:VIZLY_TEST_PRIVATE_FILE
$acl=Get-Acl -LiteralPath $path
$sid=New-Object Security.Principal.SecurityIdentifier 'S-1-1-0'
$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'ReadData','Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $path -AclObject $acl`;
   await runWindowsAcl(negative,script);
  } else {await chmod(negative,0o644);}
  await expect(expectPrivateFile(negative)).rejects.toThrow();
 } finally {t.dispose();await journal.drain();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
},20_000); // Includes bounded native Windows ACL subprocesses, not a performance scenario.
it('rotates bounded files and tolerates an interrupted final line',async()=>{
 const directory=await privateDirectory();
 const journal=createTelemetryJournal(directory);
 const t=createOperationTelemetry({releaseId:'c'.repeat(40),transport:journal.accept});
 try {
  for(let index=0;index<4;index++)await writeFile(join(directory,`telemetry-${index}.jsonl`),'x'.repeat(1_048_576));
  t.begin('save')('success');await t.flush();
  expect((await readdir(directory)).sort()).toEqual([0,1,2,3].map(n=>`telemetry-${n}.jsonl`));
  for(const file of await readdir(directory))expect((await stat(join(directory,file))).size).toBeLessThanOrEqual(1_048_576);
  expect(await queryTelemetryJournal(directory,{releaseId:'c'.repeat(40)})).toHaveLength(1);
 } finally {t.dispose();await journal.drain();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
