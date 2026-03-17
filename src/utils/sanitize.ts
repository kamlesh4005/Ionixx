const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeString(input: string): string {
  return input.replace(CONTROL_CHAR_REGEX, '');
}

export function sanitizePortfolio(
  portfolio: Array<{ symbol: string; weight: number; price?: number }>,
): Array<{ symbol: string; weight: number; price?: number }> {
  return portfolio.map((item) => ({
    ...item,
    symbol: sanitizeString(item.symbol).trim().toUpperCase(),
  }));
}
