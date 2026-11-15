import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
export function bencode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (typeof value === 'string') return bencode(Buffer.from(value));
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  if (Array.isArray(value))
    return Buffer.concat([Buffer.from('l'), ...value.map(bencode), Buffer.from('e')]);
  return Buffer.concat([
    Buffer.from('d'),
    ...Object.keys(value)
      .sort()
      .flatMap((key) => [bencode(key), bencode(value[key])]),
    Buffer.from('e'),
  ]);
}
export function fixture(name = 'twui-regression') {
  const payload = Buffer.from('Transmission Web UI local regression fixture\n');
  const info = {
    length: payload.length,
    name,
    'piece length': 16384,
    pieces: createHash('sha1').update(payload).digest(),
    private: 1,
  };
  return {
    payload,
    hash: createHash('sha1').update(bencode(info)).digest('hex'),
    metainfo: bencode({ announce: 'http://127.0.0.1:19999/announce', info }).toString('base64'),
  };
}
