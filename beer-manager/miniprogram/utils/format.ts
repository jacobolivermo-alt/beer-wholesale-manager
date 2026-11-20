export const moneyText = (value: number): string => value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const dateText = (iso: string): string => { const d = new Date(iso); const pad = (v: number) => String(v).padStart(2, '0'); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dayKey = (iso: string): string => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
