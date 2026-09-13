/** WalletGraph's collision-free, UTF-8 length-prefixed tuple IDs. */
export function tuple(...parts) {
  return parts.map(part => {
    if (typeof part !== 'string' || part.includes('\0') || !part.isWellFormed()) {
      throw new Error('ID parts must be well-formed strings without NUL');
    }
    return `${Buffer.byteLength(part, 'utf8')}:${part}`;
  }).join('');
}
export function sortKey(height, index, activityId) {
  const pad = value => {
    const s = BigInt(value).toString();
    if (!/^\d{1,40}$/.test(s)) throw new Error('Ordering component outside [0,10^40)');
    return s.padStart(40, '0');
  };
  return `${pad(height)}:${pad(index ?? '0')}:${Buffer.from(activityId, 'utf8').toString('hex')}`;
}
