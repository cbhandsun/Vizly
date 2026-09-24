import type { ValidatedS3StorageConfig } from './storageSecurity';

const SERVICE = 's3';
const TERMINATOR = 'aws4_request';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const XML_MIME = 'application/xml';

export interface S3FetchObjectSummary {
  key: string;
  lastModified?: Date;
  size?: number;
}

export interface S3FetchListObjectsResult {
  contents: S3FetchObjectSummary[];
}

export interface S3FetchGetObjectResult {
  bodyText: string;
  lastModified?: Date;
}

export type S3FetchLike = typeof fetch;

interface SignedS3Request {
  body?: BodyInit;
  headers: Headers;
  method: string;
  url: URL;
}

const textEncoder = new TextEncoder();

const toHex = (bytes: ArrayBuffer): string => (
  [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
);

const copyBytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const bytesForHash = (value: string | Uint8Array): ArrayBuffer => (
  typeof value === 'string' ? copyBytesToArrayBuffer(textEncoder.encode(value)) : copyBytesToArrayBuffer(value)
);

const sha256Hex = async (value: string | Uint8Array): Promise<string> => (
  toHex(await crypto.subtle.digest('SHA-256', bytesForHash(value)))
);

const importHmacKey = (key: Uint8Array): Promise<CryptoKey> => (
  crypto.subtle.importKey('raw', copyBytesToArrayBuffer(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
);

const hmacSha256WithCryptoKey = (key: CryptoKey, value: string): Promise<ArrayBuffer> => (
  crypto.subtle.sign('HMAC', key, textEncoder.encode(value))
);

const hmacSha256Bytes = async (key: Uint8Array, value: string): Promise<Uint8Array> => (
  new Uint8Array(await hmacSha256WithCryptoKey(await importHmacKey(key), value))
);

const formatAmzDate = (date: Date): { amzDate: string; shortDate: string } => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/gu, '');
  return {
    amzDate: iso,
    shortDate: iso.slice(0, 8),
  };
};

const encodePathSegment = (value: string): string => (
  encodeURIComponent(value).replace(/[!'()*]/gu, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
);

const normalizeS3KeyPath = (key: string): string => (
  key.split('/').map(encodePathSegment).join('/')
);

const appendPath = (basePath: string, nextPath: string): string => {
  const left = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const right = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
  return `${left}${right}` || '/';
};

const buildS3Url = (config: ValidatedS3StorageConfig, key = '', query?: URLSearchParams): URL => {
  const endpoint = new URL(config.endpoint);
  const forcePathStyle = config.s3ForcePathStyle ?? true;
  const encodedKey = normalizeS3KeyPath(key);
  if (forcePathStyle) {
    endpoint.pathname = appendPath(endpoint.pathname, `${encodePathSegment(config.bucket)}${encodedKey ? `/${encodedKey}` : ''}`);
  } else {
    endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
    endpoint.pathname = appendPath(endpoint.pathname, encodedKey);
  }
  endpoint.search = query?.toString() ?? '';
  return endpoint;
};

const canonicalQuery = (searchParams: URLSearchParams): string => (
  [...searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    ))
    .map(([key, value]) => `${encodePathSegment(key)}=${encodePathSegment(value)}`)
    .join('&')
);

const canonicalHeaderValue = (value: string): string => value.trim().replace(/\s+/gu, ' ');

const getCanonicalHeaders = (headers: Headers): { canonicalHeaders: string; signedHeaders: string } => {
  const entries = [...headers.entries()]
    .map(([key, value]) => [key.toLowerCase(), canonicalHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    canonicalHeaders: `${entries.map(([key, value]) => `${key}:${value}\n`).join('')}`,
    signedHeaders: entries.map(([key]) => key).join(';'),
  };
};

const getSigningKey = async (secretAccessKey: string, shortDate: string, region: string): Promise<Uint8Array> => {
  const dateKey = await hmacSha256Bytes(textEncoder.encode(`AWS4${secretAccessKey}`), shortDate);
  const regionKey = await hmacSha256Bytes(dateKey, region);
  const serviceKey = await hmacSha256Bytes(regionKey, SERVICE);
  return hmacSha256Bytes(serviceKey, TERMINATOR);
};

const bodyToBytes = (body: string | undefined): Uint8Array => textEncoder.encode(body ?? '');

const signS3Request = async ({
  body,
  config,
  contentType,
  key,
  method,
  now,
  query,
}: {
  body?: string;
  config: ValidatedS3StorageConfig;
  contentType?: string;
  key?: string;
  method: string;
  now: Date;
  query?: URLSearchParams;
}): Promise<SignedS3Request> => {
  const url = buildS3Url(config, key ?? '', query);
  const { amzDate, shortDate } = formatAmzDate(now);
  const bodyBytes = bodyToBytes(body);
  const payloadHash = bodyBytes.byteLength === 0 ? EMPTY_SHA256 : await sha256Hex(bodyBytes);
  const headers = new Headers({
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  });
  if (contentType) headers.set('content-type', contentType);

  const { canonicalHeaders, signedHeaders } = getCanonicalHeaders(headers);
  const canonicalRequest = [
    method,
    url.pathname || '/',
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${shortDate}/${config.region}/${SERVICE}/${TERMINATOR}`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = await getSigningKey(config.secretAccessKey, shortDate, config.region);
  const signature = toHex(await hmacSha256WithCryptoKey(await importHmacKey(signingKey), stringToSign));
  headers.set('authorization', [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', '));

  return {
    body: body === undefined ? undefined : body,
    headers,
    method,
    url,
  };
};

const responseText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return '';
  }
};

const assertS3ResponseOk = async (response: Response, operation: string): Promise<void> => {
  if (response.ok) return;
  const body = (await responseText(response)).slice(0, 512);
  throw new Error(`S3 ${operation} failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
};

const parseS3Date = (value: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

const parseS3Size = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : undefined;
};

const parseListObjectsXml = (xml: string): S3FetchListObjectsResult => {
  const documentNode = new DOMParser().parseFromString(xml, XML_MIME);
  if (documentNode.querySelector('parsererror')) {
    throw new Error('S3 list response XML is invalid');
  }
  const contents = [...documentNode.querySelectorAll('Contents')]
    .map((item): S3FetchObjectSummary | null => {
      const key = item.querySelector('Key')?.textContent ?? '';
      if (!key) return null;
      return {
        key,
        lastModified: parseS3Date(item.querySelector('LastModified')?.textContent ?? null),
        size: parseS3Size(item.querySelector('Size')?.textContent ?? null),
      };
    })
    .filter((item): item is S3FetchObjectSummary => item !== null);
  return { contents };
};

export class S3FetchClient {
  private readonly config: ValidatedS3StorageConfig;
  private readonly fetchImpl: S3FetchLike;
  private readonly now: () => Date;

  constructor(
    config: ValidatedS3StorageConfig,
    options: { fetchImpl?: S3FetchLike; now?: () => Date } = {},
  ) {
    this.config = config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private async request({
    body,
    contentType,
    key,
    method,
    operation,
    query,
    signal,
  }: {
    body?: string;
    contentType?: string;
    key?: string;
    method: string;
    operation: string;
    query?: URLSearchParams;
    signal?: AbortSignal;
  }): Promise<Response> {
    const signed = await signS3Request({
      body,
      config: this.config,
      contentType,
      key,
      method,
      now: this.now(),
      query,
    });
    const response = await this.fetchImpl(signed.url, {
      body: signed.body,
      headers: signed.headers,
      method: signed.method,
      signal,
    });
    await assertS3ResponseOk(response, operation);
    return response;
  }

  async listObjects(options: { maxKeys?: number; prefix?: string; signal?: AbortSignal } = {}): Promise<S3FetchListObjectsResult> {
    const query = new URLSearchParams({ 'list-type': '2' });
    if (options.prefix) query.set('prefix', options.prefix);
    if (options.maxKeys !== undefined) query.set('max-keys', String(options.maxKeys));
    const response = await this.request({
      method: 'GET',
      operation: 'list objects',
      query,
      signal: options.signal,
    });
    return parseListObjectsXml(await response.text());
  }

  async getObject(key: string, signal?: AbortSignal): Promise<S3FetchGetObjectResult> {
    const response = await this.request({
      key,
      method: 'GET',
      operation: 'get object',
      signal,
    });
    return {
      bodyText: await response.text(),
      lastModified: parseS3Date(response.headers.get('last-modified')),
    };
  }

  async putObject(key: string, body: string, contentType: string, signal?: AbortSignal): Promise<void> {
    await this.request({
      body,
      contentType,
      key,
      method: 'PUT',
      operation: 'put object',
      signal,
    });
  }

  async deleteObject(key: string, signal?: AbortSignal): Promise<void> {
    await this.request({
      key,
      method: 'DELETE',
      operation: 'delete object',
      signal,
    });
  }
}

export const createS3FetchClient = (
  config: ValidatedS3StorageConfig,
  options?: { fetchImpl?: S3FetchLike; now?: () => Date },
): S3FetchClient => new S3FetchClient(config, options);

export const __s3FetchClientTestUtils = {
  buildS3Url,
  canonicalQuery,
  formatAmzDate,
  signS3Request,
};
