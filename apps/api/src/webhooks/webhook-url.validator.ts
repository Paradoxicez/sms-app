import { BadRequestException } from '@nestjs/common';
import { URL } from 'url';
import { lookup } from 'dns/promises';

/**
 * Validates a webhook URL for SSRF protection.
 * - Must be HTTPS
 * - Cannot point to localhost or private IPs
 * - DNS resolution checked against private IP ranges
 */
export async function validateWebhookUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new BadRequestException('Invalid URL format');
  }

  // Must be HTTPS
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL must use HTTPS');
  }

  // Block localhost and loopback
  const hostname = parsed.hostname;
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];
  if (blocked.includes(hostname)) {
    throw new BadRequestException('Webhook URL cannot point to localhost');
  }

  // DNS resolution to check for private IPs
  try {
    const result = await lookup(hostname);
    const ip = result.address;
    if (isPrivateIp(ip)) {
      throw new BadRequestException(
        'Webhook URL cannot resolve to a private IP address',
      );
    }
  } catch (err: any) {
    if (err instanceof BadRequestException) throw err;
    // DNS resolution failed -- allow (might be unreachable now but valid later)
  }
}

function isPrivateIp(ip: string): boolean {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    ip === '127.0.0.1' ||
    ip === '0.0.0.0'
  );
}
