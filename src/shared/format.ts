export function formatAED(value: number, compact = true): string {
  if (compact) {
    if (value >= 1_000_000) {
      const m = value / 1_000_000;
      return `AED ${m >= 10 ? m.toFixed(1) : m.toFixed(2).replace(/0$/, "")}M`;
    }
    if (value >= 1_000) return `AED ${Math.round(value / 1_000)}K`;
  }
  return `AED ${value.toLocaleString("en-AE")}`;
}

export function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function daysBetween(fromIso: string, toIso?: string): number {
  const from = new Date(fromIso + "T00:00:00").getTime();
  const to = toIso ? new Date(toIso + "T00:00:00").getTime() : Date.now();
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}
