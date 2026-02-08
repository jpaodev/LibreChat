/**
 * Checks whether a request to the given URL should use the configured proxy,
 * respecting the NO_PROXY / no_proxy environment variable.
 *
 * NO_PROXY is a comma-separated list of hostnames, domain suffixes (with or
 * without a leading dot), IP addresses, or CIDR ranges that should bypass the
 * proxy.  The special value `*` disables the proxy for all destinations.
 *
 * @param targetUrl - The URL (or hostname) of the request destination.
 * @returns `true` if the proxy should be used, `false` if the target matches
 *          a NO_PROXY entry and should be contacted directly.
 */
export function shouldProxy(targetUrl: string | undefined | null): boolean {
  if (!targetUrl) {
    return true;
  }

  const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
  if (!noProxy) {
    return true;
  }

  const entries = noProxy.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (entries.includes('*')) {
    return false;
  }

  let hostname: string;
  try {
    const hasScheme = /^https?:\/\//i.test(targetUrl);
    const urlToParse = hasScheme ? targetUrl : `http://${targetUrl}`;
    hostname = new URL(urlToParse).hostname.toLowerCase();
  } catch {
    hostname = targetUrl.toLowerCase();
  }

  for (const entry of entries) {
    if (matchesNoProxyEntry(hostname, entry)) {
      return false;
    }
  }

  return true;
}

function matchesNoProxyEntry(hostname: string, entry: string): boolean {
  // CIDR notation – skip complex IP matching, but handle simple IP match
  if (entry.includes('/')) {
    return matchesCIDR(hostname, entry);
  }

  // Exact match
  if (hostname === entry) {
    return true;
  }

  // Domain suffix match: ".example.com" matches "foo.example.com"
  // Also "example.com" should match "foo.example.com"
  const dotEntry = entry.startsWith('.') ? entry : `.${entry}`;
  if (hostname.endsWith(dotEntry)) {
    return true;
  }

  return false;
}

function ipToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) {
      return null;
    }
    result = (result << 8) + num;
  }
  return result >>> 0;
}

function matchesCIDR(hostname: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }

  const networkLong = ipToLong(network);
  const hostLong = ipToLong(hostname);

  if (networkLong === null || hostLong === null) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (networkLong & mask) === (hostLong & mask);
}
