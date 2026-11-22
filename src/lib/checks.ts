/** Green room checks (T1). Each returns a label, value and pass/fail. */
export type Check = { label: string; value: string; ok: boolean; note?: string };

export async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const hasRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window;
  const hasWorklet = typeof window !== 'undefined' && 'AudioWorkletNode' in window;
  checks.push({ label: 'Browser', value: hasRecorder && hasWorklet ? 'Supported' : 'Missing features', ok: hasRecorder && hasWorklet, note: navigator.userAgent.match(/(Chrome|Edg|Firefox|Safari)\/[\d.]+/)?.[0] });
  const hasOpfs = !!navigator.storage?.getDirectory;
  let free = 0;
  try { const est = await navigator.storage.estimate(); free = ((est.quota ?? 0) - (est.usage ?? 0)) / 1e9; } catch { /* ignore */ }
  checks.push({ label: 'Free space for recording', value: `${free.toFixed(0)} GB`, ok: hasOpfs && free >= 20, note: hasOpfs ? `About ${Math.floor(free / 7)} h at 1080p` : 'Browser storage unavailable' });
  const conn = (navigator as Navigator & { connection?: { downlink?: number; rtt?: number } }).connection;
  if (conn?.downlink) checks.push({ label: 'Download speed', value: `${conn.downlink} Mbps`, ok: conn.downlink >= 5 });
  if (conn?.rtt !== undefined) checks.push({ label: 'Connection delay', value: `${conn.rtt} ms`, ok: conn.rtt < 200 });
  // TODO(T1): upload speed needs a timed upload to the storage endpoint.
  return checks;
}
