export function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtRho(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${fmt(value * 100, 3)}% (${fmt(value, 5)})`;
}
