// Day 19: which network addresses the server may connect to when it
// fetches a URL a user gave it (link previews). Only the public internet:
// never this machine, the hosting provider's private network, cloud
// metadata (169.254.169.254) or any other special-purpose range -- that
// would let anyone use the server to probe or call things behind it
// (server-side request forgery).
const net = require('net');

const blocked = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay (deprecated)
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved + broadcast
]) blocked.addSubnet(prefix, bits, 'ipv4');
for (const [prefix, bits] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments (incl. Teredo)
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local (private)
  ['fe80::', 10], // link-local
  ['ff00::', 8] // multicast
]) blocked.addSubnet(prefix, bits, 'ipv6');

// IPv6 forms that carry an IPv4 address inside (IPv4-mapped ::ffff:a.b.c.d,
// NAT64 64:ff9b::/96, 6to4 2002::/16): judged by that IPv4 address, so
// e.g. ::ffff:127.0.0.1 can't sneak past as "IPv6".
function embeddedIPv4(ip) {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  }
  const sixToFour = lower.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1], 16);
    const lo = parseInt(sixToFour[2], 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
  }
  return null;
}

// True only for an address on the public internet.
function isPublicAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family === 6) {
    const v4 = embeddedIPv4(ip);
    if (v4) return isPublicAddress(v4);
    if (ip.toLowerCase().startsWith('::ffff:')) return false; // malformed mapped form
    return !blocked.check(ip, 'ipv6');
  }
  return false;
}

module.exports = { isPublicAddress };
