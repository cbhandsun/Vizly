import { decode } from 'fast-png';

/** Scan the downloaded raster in Node so browser GPU readback cannot consume the UI test budget. */
export function pngContainsOpaqueColor(bytes: Buffer, color: readonly [number, number, number]): boolean {
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('PNG pixel audit requires a complete PNG header');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width > 12_000 || height > 12_000 || width * height > 36_000_000) {
    throw new Error('PNG pixel audit exceeds the export raster budget');
  }
  const image = decode(bytes, { checkCrc: true });
  // Browser canvas exports are 8-bit RGB/RGBA. Fail closed if an export changes format.
  if (image.depth !== 8 || image.palette || image.transparency
    || (image.channels !== 3 && image.channels !== 4)
    || image.data.length !== width * height * image.channels) {
    throw new Error('PNG pixel audit requires an 8-bit RGB or RGBA raster');
  }
  for (let index = 0; index < image.data.length; index += image.channels) {
    if (image.data[index] === color[0] && image.data[index + 1] === color[1]
      && image.data[index + 2] === color[2]
      && (image.channels === 3 || image.data[index + 3] === 255)) return true;
  }
  return false;
}
