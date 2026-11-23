import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_PATH =
  /(^|\/)(login|signin|sign-in|auth|oauth|checkout|payment|payments|billing|password|verify|verification|wallet|bank|account)(\/|$)/i;

function ipv4ToNumber(ip) {
  return ip.split('.').reduce((n, oct) => (n << 8) + Number(oct), 0) >>> 0;
}

function inRange(ip, start, end) {
  const n = ipv4ToNumber(ip);
  return n >= ipv4ToNumber(start) && n <= ipv4ToNumber(end);
}

export function isPrivateIp(ip) {
  const kind = net.isIP(ip);

  if (kind === 4) {
    return (
      inRange(ip, '0.0.0.0', '0.255.255.255') ||
      inRange(ip, '10.0.0.0', '10.255.255.255') ||
      inRange(ip, '100.64.0.0', '100.127.255.255') ||
      inRange(ip, '127.0.0.0', '127.255.255.255') ||
      inRange(ip, '169.254.0.0', '169.254.255.255') ||
      inRange(ip, '172.16.0.0', '172.31.255.255') ||
      inRange(ip, '192.168.0.0', '192.168.255.255') ||
      inRange(ip, '198.18.0.0', '198.19.255.255') ||
      inRange(ip, '224.0.0.0', '255.255.255.255')
    );
  }

  if (kind === 6) {
    const x = ip.toLowerCase();
    return (
      x === '::1' ||
      x === '::' ||
      x.startsWith('fc') ||
      x.startsWith('fd') ||
      x.startsWith('fe8') ||
      x.startsWith('fe9') ||
      x.startsWith('fea') ||
      x.startsWith('feb')
    );
  }

  return false;
}

export function isObviouslyPrivateUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);

    if (!['http:', 'https:'].includes(u.protocol)) return true;

    const host = u.hostname.toLowerCase();

    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local')
    ) {
      return true;
    }

    if (net.isIP(host) && isPrivateIp(host)) return true;

    return false;
  } catch {
    return true;
  }
}

export async function assertPublicProductUrl(rawUrl) {
  let u;

  try {
    u = new URL(rawUrl);
  } catch {
    const e = new Error('URL inválida.');
    e.statusCode = 400;
    throw e;
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    const e = new Error('Apenas URLs HTTP/HTTPS são aceitas.');
    e.statusCode = 400;
    throw e;
  }

  if (BLOCKED_PATH.test(u.pathname)) {
    const e = new Error('Login, conta, checkout e pagamento não são clonados.');
    e.statusCode = 400;
    throw e;
  }

  if (isObviouslyPrivateUrl(rawUrl)) {
    const e = new Error('Endereços locais/privados não são permitidos.');
    e.statusCode = 400;
    throw e;
  }

  let records;

  try {
    records = await dns.lookup(u.hostname, {
      all: true,
      verbatim: true
    });
  } catch {
    const e = new Error('Não foi possível resolver o domínio.');
    e.statusCode = 400;
    throw e;
  }

  if (!records.length || records.some(record => isPrivateIp(record.address))) {
    const e = new Error('O domínio resolve para uma rede local/privada.');
    e.statusCode = 400;
    throw e;
  }

  return u;
}

export async function assertNoSensitivePage(page) {
  const sensitive = await page.evaluate(() => {
    const password = document.querySelector('input[type="password"]');

    const payment = document.querySelector(
      'input[autocomplete^="cc-"],input[name*="card" i],input[id*="card" i],input[name*="cvv" i],input[name*="cvc" i]'
    );

    return Boolean(password || payment);
  });

  if (sensitive) {
    const e = new Error('A página parece conter autenticação ou pagamento.');
    e.statusCode = 400;
    throw e;
  }
}
