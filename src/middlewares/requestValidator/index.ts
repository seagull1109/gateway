import { Context } from 'hono';
import {
  CONTENT_TYPES,
  HEADER_KEYS,
  POWERED_BY,
  VALID_PROVIDERS,
} from '../../globals';
import { configSchema } from './schema/config';
import { Environment } from '../../utils/env';

// Regex patterns for validation (defined once for reusability)
const VALIDATION_PATTERNS = {
  CONTROL_CHARS: /[\x00-\x1F\x7F]/,
  SUSPICIOUS_CHARS: /[\s<>{}|\\^\`]/,
  DIGITS_1_3: /^\d{1,3}$/,
  DIGITS_1_10: /^\d{1,10}$/,
  DIGITS_ONLY: /^\d+$/,
  HEX_IP: /^0x[0-9a-f]{1,8}$/i,
  ALTERNATIVE_IP_PART: /^0[0-9a-fx]/i,
  IPV6_MAPPED_IPv4: /::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i,
  IPV6_EMBEDDED_IPv4: /::(\d{1,3}(?:\.\d{1,3}){3})$/i,
  HOMOGRAPH_ATTACK: /^[a-z0-9.-]+$/,
};

// Disallowed URL schemes
const DISALLOWED_SCHEMES = [
  'file://',
  'data:',
  'gopher://',
  'ftp://',
  'ftps://',
];

// Blocked hosts (cloud metadata endpoints and internal IPs)
const BLOCKED_HOSTS = [
  '0.0.0.0',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
  'metadata.azure.com',
  'instance-data',
];

// Blocked TLDs for SSRF protection
const BLOCKED_TLDS = [
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.test',
  '.invalid',
  '.onion',
  '.localhost',
];

// Parse allowed custom hosts from environment variable
const TRUSTED_CUSTOM_HOSTS = (c?: Context) => {
  const envVar = Environment(c)?.TRUSTED_CUSTOM_HOSTS;

  if (!envVar) {
    return new Set([
      'localhost',
      '127.0.0.1',
      '::1',
      'host.docker.internal',
    ]);
  }

  return new Set(
    envVar
      .split(',')
      .map((h: string) => h.trim().toLowerCase())
      .filter((h: string) => h.length > 0)
  );
};

// Pre-computed IPv4 range boundaries
const IPV4_RANGES = {
  PRIVATE: [
    {
      start: ipv4ToInt('10.0.0.0'),
      end: ipv4ToInt('10.255.255.255'),
    },
    {
      start: ipv4ToInt('172.16.0.0'),
      end: ipv4ToInt('172.31.255.255'),
    },
    {
      start: ipv4ToInt('192.168.0.0'),
      end: ipv4ToInt('192.168.255.255'),
    },
  ],

  RESERVED: [
    {
      start: ipv4ToInt('127.0.0.0'),
      end: ipv4ToInt('127.255.255.255'),
    },
    {
      start: ipv4ToInt('169.254.0.0'),
      end: ipv4ToInt('169.254.255.255'),
    },
    {
      start: ipv4ToInt('100.64.0.0'),
      end: ipv4ToInt('100.127.255.255'),
    },
    {
      start: ipv4ToInt('0.0.0.0'),
      end: ipv4ToInt('0.255.255.255'),
    },
    {
      start: ipv4ToInt('224.0.0.0'),
      end: ipv4ToInt('255.255.255.255'),
    },
  ],
};

export const requestValidator = (c: Context, next: any) => {
  const requestHeaders = Object.fromEntries(c.req.raw.headers);

  const contentType = requestHeaders['content-type'];

  // ─────────────────────────────────────────────────────────────
  // Content-Type validation
  // ─────────────────────────────────────────────────────────────
  if (
    !!contentType &&
    ![
      CONTENT_TYPES.APPLICATION_JSON,
      CONTENT_TYPES.MULTIPART_FORM_DATA,
    ].includes(contentType.split(';')[0]) &&
    !contentType
      .split(';')[0]
      ?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)
  ) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Invalid content type passed`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Model alias routes
  //
  // These routes are handled by agentChatHandler.
  // The client can simply send:
  //
  // {
  //   "model": "cheap"
  // }
  //
  // agentChatHandler will generate the actual Portkey config.
  // ─────────────────────────────────────────────────────────────
  const pathname = new URL(c.req.url).pathname;

  const isModelAliasRoute =
    pathname === '/v1/chat/completions' ||
    pathname === '/v1/agent/chat' ||
    pathname === '/v1/v1/chat/completions';

  const hasPortkeyConfig =
    !!requestHeaders[`x-${POWERED_BY}-config`] ||
    !!requestHeaders[`x-${POWERED_BY}-provider`];

  // ─────────────────────────────────────────────────────────────
  // Normal Portkey routes still require config/provider.
  //
  // IMPORTANT:
  // /v1/internal/chat/completions is NOT included above,
  // so it still requires x-portkey-config.
  // ─────────────────────────────────────────────────────────────
  if (!isModelAliasRoute && !hasPortkeyConfig) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Either x-${POWERED_BY}-config or x-${POWERED_BY}-provider header is required`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Provider validation
  // ─────────────────────────────────────────────────────────────
  if (
    requestHeaders[`x-${POWERED_BY}-provider`] &&
    !VALID_PROVIDERS.includes(
      requestHeaders[`x-${POWERED_BY}-provider`]
    )
  ) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Invalid provider passed`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Custom host validation
  // ─────────────────────────────────────────────────────────────
  const customHostHeader =
    requestHeaders[`x-${POWERED_BY}-custom-host`];

  if (
    customHostHeader &&
    !isValidCustomHost(customHostHeader, c)
  ) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: `Invalid custom host`,
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Config validation
  //
  // If a config is supplied, it is still fully validated.
  // ─────────────────────────────────────────────────────────────
  if (requestHeaders[`x-${POWERED_BY}-config`]) {
    try {
      const parsedConfig = JSON.parse(
        requestHeaders[`x-${POWERED_BY}-config`]
      );

      if (
        !requestHeaders[`x-${POWERED_BY}-provider`] &&
        !(parsedConfig.provider || parsedConfig.targets)
      ) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message:
              `Either x-${POWERED_BY}-provider needs to be passed. ` +
              `Or the x-${POWERED_BY}-config header should have ` +
              `a valid config with provider details in it.`,
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }

      const validatedConfig =
        configSchema.safeParse(parsedConfig);

      if (
        !validatedConfig.success &&
        validatedConfig.error?.issues?.length
      ) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: `Invalid config passed`,
            errors: validatedConfig.error.issues.map(
              (e: any) =>
                `path: ${e.path}, message: ${e.message}`
            ),
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }

      if (parsedConfig.options) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message:
              `This version of config is not supported in this route. ` +
              `Please migrate to the latest version`,
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }
    } catch (e) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message:
            `Invalid config passed. You need to pass a valid json`,
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Forward headers validation
  // ─────────────────────────────────────────────────────────────
  if (requestHeaders[HEADER_KEYS.FORWARD_HEADERS]) {
    const forwardHeaders: string[] =
      requestHeaders[HEADER_KEYS.FORWARD_HEADERS].split(',');

    if (
      forwardHeaders.some(
        (h: string) =>
          h.trim().toLowerCase() ===
          HEADER_KEYS.FORWARD_HEADERS
      )
    ) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message:
            `forward_headers must not contain the ` +
            `'${HEADER_KEYS.FORWARD_HEADERS}' header`,
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }
  }

  return next();
};

export function isValidCustomHost(
  customHost: string,
  c?: Context
) {
  try {
    const value = customHost.trim().toLowerCase();

    // Block empty or whitespace-only hosts
    if (!value) return false;

    // Block URLs with control characters or excessive whitespace
    if (
      VALIDATION_PATTERNS.CONTROL_CHARS.test(customHost)
    ) {
      return false;
    }

    // Project-specific and obvious disallowed schemes/hosts
    if (value.indexOf('api.portkey') > -1) return false;

    if (
      DISALLOWED_SCHEMES.some((scheme) =>
        value.startsWith(scheme)
      )
    ) {
      return false;
    }

    const url = new URL(customHost);
    const protocol = url.protocol;

    // Allow only HTTP(S)
    if (protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    // Disallow credentials and obfuscation
    if (url.username || url.password) return false;
    if (customHost.includes('@')) return false;

    const host = url.hostname;

    // Block empty hostname
    if (!host) return false;

    // Block URLs with encoded characters in hostname
    if (host.includes('%')) return false;

    // Block suspicious characters
    if (
      VALIDATION_PATTERNS.SUSPICIOUS_CHARS.test(host)
    ) {
      return false;
    }

    // Block non-ASCII characters in hostname
    if (
      !VALIDATION_PATTERNS.HOMOGRAPH_ATTACK.test(host)
    ) {
      return false;
    }

    // Block trailing dots
    if (host.endsWith('.')) return false;

    const hostParts = host.split('.');

    // Block excessive subdomain depth
    if (hostParts.length > 10) return false;

    const trustedHosts = TRUSTED_CUSTOM_HOSTS(c);

    const isTrustedHost =
      trustedHosts.has(host) ||
      (trustedHosts.has('localhost') &&
        host.endsWith('.localhost'));

    if (isTrustedHost) {
      if (url.port && !isValidPort(url.port)) {
        return false;
      }

      return true;
    }

    // Block obvious internal/unsafe hosts
    if (BLOCKED_HOSTS.includes(host as any)) {
      return false;
    }

    // Block AWS IMDSv2 endpoint variations
    if (
      host.startsWith('169.254.169.') ||
      host.startsWith('fd00:ec2::')
    ) {
      return false;
    }

    // Block internal/special-use TLDs
    if (
      BLOCKED_TLDS.some(
        (tld) =>
          host.endsWith(tld) &&
          host !== 'localhost'
      )
    ) {
      return false;
    }

    // Block private/reserved IPv4
    if (
      isIPv4(hostParts) &&
      (isPrivateIPv4(host) ||
        isReservedIPv4(host))
    ) {
      return false;
    }

    // Check alternative IP representations
    if (
      isAlternativeIPRepresentation(
        host,
        hostParts
      )
    ) {
      return false;
    }

    // Block private/reserved IPv6
    if (host.includes(':')) {
      if (isLocalOrPrivateIPv6(host)) {
        return false;
      }

      const ipv4Match =
        host.match(
          VALIDATION_PATTERNS.IPV6_MAPPED_IPv4
        ) ||
        host.match(
          VALIDATION_PATTERNS.IPV6_EMBEDDED_IPv4
        );

      if (ipv4Match) {
        const ip4 = ipv4Match[1];

        if (
          isPrivateIPv4(ip4) ||
          isReservedIPv4(ip4)
        ) {
          return false;
        }
      }
    }

    // Validate port
    if (url.port && !isValidPort(url.port)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Helper function to convert integer to IPv4 dotted decimal notation
function intToIPv4(num: number): string {
  const a = (num >>> 24) & 0xff;
  const b = (num >>> 16) & 0xff;
  const c = (num >>> 8) & 0xff;
  const d = num & 0xff;

  return `${a}.${b}.${c}.${d}`;
}

// Helper function to convert IPv4 dotted decimal to integer
function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip
    .split('.')
    .map((n) => Number(n));

  return (
    ((a << 24) >>> 0) +
    (b << 16) +
    (c << 8) +
    d
  );
}

// Helper function to validate port numbers
function isValidPort(port: string): boolean {
  const p = parseInt(port, 10);

  return p > 0 && p <= 65535;
}

function isIPv4(parts: string[]): boolean {
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    // Must be 1-3 digits
    if (
      !VALIDATION_PATTERNS.DIGITS_1_3.test(part)
    ) {
      return false;
    }

    const num = Number(part);

    // Must be in range 0-255
    if (num < 0 || num > 255) {
      return false;
    }

    // Reject leading zeros
    if (
      part.length > 1 &&
      part.startsWith('0')
    ) {
      return false;
    }

    return true;
  });
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);

  return IPV4_RANGES.PRIVATE.some(
    (range) =>
      ipInt >= range.start &&
      ipInt <= range.end
  );
}

function isReservedIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);

  return IPV4_RANGES.RESERVED.some(
    (range) =>
      ipInt >= range.start &&
      ipInt <= range.end
  );
}

function isLocalOrPrivateIPv6(
  host: string
): boolean {
  const h = host.toLowerCase();

  if (h === '::1' || h === '::') {
    return true;
  }

  if (
    h.startsWith('fc') ||
    h.startsWith('fd')
  ) {
    return true;
  }

  if (h.startsWith('fe80')) {
    return true;
  }

  if (h.startsWith('fec0')) {
    return true;
  }

  return false;
}

function isAlternativeIPRepresentation(
  host: string,
  parts: string[]
): boolean {
  // Check for decimal IP
  if (
    VALIDATION_PATTERNS.DIGITS_1_10.test(host)
  ) {
    const num = parseInt(host, 10);

    if (
      num >= 0 &&
      num <= 0xffffffff
    ) {
      const ip = intToIPv4(num);

      if (
        isPrivateIPv4(ip) ||
        isReservedIPv4(ip)
      ) {
        return true;
      }

      // Block all decimal IP representations
      return true;
    }
  }

  // Check for hex IP
  if (
    VALIDATION_PATTERNS.HEX_IP.test(host)
  ) {
    const num = parseInt(host, 16);

    if (
      num >= 0 &&
      num <= 0xffffffff
    ) {
      return true;
    }
  }

  // Check for octal or hex notation
  if (
    parts.length === 4 &&
    parts.some((p) =>
      VALIDATION_PATTERNS.ALTERNATIVE_IP_PART.test(p)
    )
  ) {
    return true;
  }

  // Check for shortened IP formats
  if (
    parts.length >= 2 &&
    parts.length < 4
  ) {
    if (
      parts.every(
        (p) =>
          VALIDATION_PATTERNS.DIGITS_ONLY.test(p) &&
          Number(p) <= 255
      )
    ) {
      return true;
    }
  }

  return false;
}