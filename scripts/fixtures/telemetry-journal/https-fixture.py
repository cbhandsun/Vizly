"""Real PostgreSQL/PostgREST with an owned TLS/key-translation fixture; no cloud access."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import uuid

root, node, migration = map(Path, sys.argv[1:])
assert root.name.startswith('vizly-telemetry-https-') and root.is_dir()
environment = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(root), 'DOCKER_HOST': 'unix:///var/run/docker.sock',
               'DOCKER_CONFIG': str(root / 'docker-config')}
(root / 'docker-config').mkdir(mode=0o700)
owned, network, before = [], None, None
stage = 'initialization'
report = {'schema': 'vizly-telemetry-storage-v1', 'status': 'failed', 'deployment': False,
          'scope': 'Isolated real TLS/PostgREST/SQL; fixture JWTs and opaque key translation; not cloud gateway or GoTrue acceptance'}


def docker(args, data=None, extra=None, timeout=60, check=True):
    result = subprocess.run(['docker', *args], input=data, text=True, capture_output=True,
                            env={**environment, **(extra or {})}, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError('Owned Docker operation failed')
    return result


def identities():
    return set(docker(['ps', '-aq', '--no-trunc']).stdout.split())


try:
    before = identities()
    images = {}
    for image in ['supabase/postgres:17.11.0.003', 'postgrest/postgrest:v14.18', 'node:22-bookworm-slim']:
        # No opportunistic pull/update: runner provisioning must supply the reviewed images.
        digest = docker(['image', 'inspect', '--format', '{{index .RepoDigests 0}}', image]).stdout.strip()
        assert '@sha256:' in digest
        images[image] = digest
    report['images'] = images
    suffix = uuid.uuid4().hex[:12]
    network = 'vizly-telemetry-' + suffix
    stage = 'network'
    # A shared runner can exhaust Docker's default /16 address pools without
    # exhausting addresses. Use a small internal-only benchmark subnet; Docker
    # checks overlap atomically, including other concurrently starting fixtures.
    for attempt in range(16):
        slot = secrets.randbelow(8192)
        subnet = '198.{}.{}.{}/28'.format(18 + slot // 4096, (slot // 16) % 256, (slot % 16) * 16)
        created = docker(['network', 'create', '--internal', '--subnet', subnet,
                          '--label', 'vizly.telemetry=' + suffix, network], check=False)
        if created.returncode == 0:
            report['networkSubnet'] = subnet
            break
        if 'overlap' not in created.stderr.lower():
            raise RuntimeError('Owned internal network allocation failed')
    else:
        raise RuntimeError('Owned internal subnet allocation exhausted')
    password, jwt_secret = secrets.token_hex(24), secrets.token_hex(32)
    database = 'vizly-telemetry-db-' + suffix
    owned.append(database)
    stage = 'postgres'
    docker(['run', '-d', '--name', database, '--label', 'vizly.telemetry=' + suffix, '--network', network,
            '--network-alias', 'database', '--memory', '1g', '--cpus', '1', '--pids-limit', '256',
            '--tmpfs', '/var/lib/postgresql/data:rw,size=1g', '-e', 'POSTGRES_PASSWORD', '-e', 'JWT_SECRET',
            images['supabase/postgres:17.11.0.003']], extra={'POSTGRES_PASSWORD': password, 'JWT_SECRET': jwt_secret})
    for attempt in range(120):
        if docker(['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], check=False).returncode == 0:
            break
        time.sleep(.5)
    else:
        raise RuntimeError('Owned Postgres readiness failed')

    def sql(statement):
        return docker(['exec', '-i', database, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At',
                       '-U', 'supabase_admin', '-d', 'postgres'], statement).stdout.strip()

    stage = 'migration'
    sql("ALTER USER authenticator WITH PASSWORD '" + password + "';")
    sql(migration.read_text())
    report['migrationSha256'] = hashlib.sha256(migration.read_bytes()).hexdigest()
    rest = 'vizly-telemetry-rest-' + suffix
    owned.append(rest)
    settings = {'PGRST_DB_URI': 'postgres://authenticator:' + password + '@database:5432/postgres',
                'PGRST_DB_SCHEMAS': 'public', 'PGRST_DB_ANON_ROLE': 'anon',
                'PGRST_JWT_SECRET': jwt_secret, 'PGRST_SERVER_PORT': '3000'}
    args = ['run', '-d', '--name', rest, '--label', 'vizly.telemetry=' + suffix, '--network', network,
            '--network-alias', 'rest', '--memory', '256m', '--cpus', '1', '--pids-limit', '128']
    for name in settings:
        args += ['-e', name]
    docker(args + [images['postgrest/postgrest:v14.18']], extra=settings)
    stage = 'tls'

    def openssl(args):
        subprocess.run(['openssl', *args], cwd=root, env=environment, capture_output=True, check=True, timeout=20)

    openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt',
             '-days', '1', '-subj', '/CN=Vizly isolated telemetry CA'])
    openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=localhost'])
    (root / 'server.ext').write_text('subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n')
    openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial',
             '-out', 'server.crt', '-days', '1', '-extfile', 'server.ext'])

    def token(role):
        def enc(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
        message = enc({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + enc({'role': role, 'exp': int(time.time()) + 3600})
        return (message + b'.' + base64.urlsafe_b64encode(hmac.new(jwt_secret.encode(), message, hashlib.sha256).digest()).rstrip(b'=')).decode()

    fixture = {'secretKey': 'sb_secret_' + secrets.token_hex(24), 'publishable': 'sb_publishable_' + secrets.token_hex(24),
               'service': token('service_role'), 'anon': token('anon'), 'authenticated': token('authenticated')}
    client = 'vizly-telemetry-client-' + suffix
    owned.append(client)
    docker(['create', '-i', '--name', client, '--label', 'vizly.telemetry=' + suffix, '--network', network,
            '--memory', '512m', '--cpus', '1', '--pids-limit', '128', '-e', 'NODE_EXTRA_CA_CERTS=/ca.crt',
            images['node:22-bookworm-slim'], '/native-node', '/client.mjs'])
    for source, target in [(node, 'native-node'), *[(root / name, name) for name in
                          ['client.mjs', 'query.mjs', 'ca.crt', 'server.crt', 'server.key']]]:
        docker(['cp', str(source), client + ':/' + target])
    stage = 'https-client'
    result = docker(['start', '-ai', client], json.dumps(fixture), timeout=120, check=False)
    # Client emits only fixed case names/booleans, never request bodies, credentials or raw exceptions.
    evidence = json.loads(result.stdout)
    report['client'] = evidence
    assert result.returncode == 0 and evidence['status'] == 'passed'
    stage = 'independent-sql'
    report['databaseVersion'] = sql('show server_version;')
    report['retainedRecords'] = int(sql('select count(*) from vizly_telemetry.journal;'))
    report['forbiddenCanaryAbsent'] = sql("select not exists(select 1 from vizly_telemetry.journal where batch::text like '%FORBIDDEN_TELEMETRY_CANARY%');") == 't'
    report['cancelledRecordsAbsent'] = sql("select count(*) from vizly_telemetry.journal where sequence in (90,91);") == '0'
    assert report['forbiddenCanaryAbsent'] and report['cancelledRecordsAbsent'] and report['retainedRecords'] == 3
    report['status'] = 'passed'
except Exception as error:
    report.update(status='failed', failureStage=stage, errorType=type(error).__name__)
finally:
    for name in reversed(owned):
        docker(['rm', '-f', name], check=False)
    if network:
        docker(['network', 'rm', network], check=False)
    report['originalContainersUnchanged'] = before is not None and identities() == before
    report['networkRemoved'] = not network or docker(['network', 'inspect', network], check=False).returncode != 0
    if not report['originalContainersUnchanged'] or not report['networkRemoved']:
        report['status'] = 'failed'
    print(json.dumps(report), flush=True)
sys.exit(0 if report['status'] == 'passed' else 1)
