/** Demo-payment helpers: real validation UX, zero real charges. */

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function formatCardNumber(s: string): string {
  return digitsOnly(s).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function luhnValid(s: string): boolean {
  const digits = digitsOnly(s);
  if (digits.length < 15) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function brandOf(s: string): string {
  const d = digitsOnly(s);
  if (d.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'Amex';
  if (d.startsWith('6')) return 'Discover';
  return 'Card';
}

export function maskCard(s: string): string {
  const d = digitsOnly(s);
  return `•••• ${d.slice(-4)}`;
}

export function formatExpiry(s: string): string {
  const d = digitsOnly(s).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export function validExpiry(s: string): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(s);
  if (!m) return false;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return false;
  const year = 2000 + Number(m[2]);
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

export function validCvc(s: string): boolean {
  return /^\d{3,4}$/.test(s);
}
