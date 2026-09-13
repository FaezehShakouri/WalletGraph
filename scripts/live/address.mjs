import { keccak256 } from 'ethereum-cryptography/keccak.js';
export function canonicalAddress(value) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('Expected a 20-byte 0x-prefixed Ethereum/Base address');
  const body = value.slice(2);
  if (body !== body.toLowerCase() && body !== body.toUpperCase()) {
    const hash = Buffer.from(keccak256(Buffer.from(body.toLowerCase(),'ascii'))).toString('hex');
    for (let i = 0; i < body.length; i++) {
      if (/[a-fA-F]/.test(body[i])) {
        const expected = parseInt(hash[i],16) >= 8 ? body[i].toUpperCase() : body[i].toLowerCase();
        if (body[i] !== expected) throw new Error('Invalid EIP-55 address checksum');
      }
    }
  }
  return value.toLowerCase();
}
