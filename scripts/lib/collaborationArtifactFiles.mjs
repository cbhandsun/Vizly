/** Vercel discovers Node API entries by .js; CommonJS is selected by the package. */
export function createCollaborationArtifactFiles(compiled) {
  if (!(compiled instanceof Uint8Array) || compiled.byteLength < 1 || compiled.byteLength > 16 * 1024 * 1024) {
    throw new Error('Invalid compiled collaboration artifact');
  }
  const entry = 'api/index.js';
  return [
    { file: entry, data: Buffer.from(compiled) },
    { file: 'package.json', data: JSON.stringify({ name: 'vizly-collaboration', private: true,
      type: 'commonjs', engines: { node: '24.x' } }, null, 2) + '\n' },
    { file: 'vercel.json', data: JSON.stringify({ $schema: 'https://openapi.vercel.sh/vercel.json', fluid: true,
      functions: { [entry]: { maxDuration: 300 } },
      rewrites: [{ source: '/(.*)', destination: '/api/index' }] }, null, 2) + '\n' },
  ];
}
