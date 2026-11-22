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
  // Chrome only lets a site use part of the disk (much less in Incognito), so this is the site's allowance, not disk free.
  // Each browser stores only its own tracks: camera ~8 Mbps + 24-bit/48 kHz WAV ≈ 4.2 GB/h. Whoever presses Record
  // also makes the episode video (another ~3.6 GB/h). Uploaded chunks are deleted, so this only fills if uploads stall.
  const hours = free / 4.2, hoursIfRecorder = free / 7.8;
  checks.push({
    label: 'Space this browser can use for recording', value: `${free.toFixed(0)} GB`, ok: hasOpfs && hours >= 2,
    note: hasOpfs ? `About ${hours.toFixed(1)} h (${hoursIfRecorder.toFixed(1)} h if you press Record) · cleared as it uploads` : 'Browser storage unavailable',
  });
  const conn = (navigator as Navigator & { connection?: { downlink?: number; rtt?: number } }).connection;
  if (conn?.downlink) checks.push({ label: 'Download speed', value: `${conn.downlink} Mbps`, ok: conn.downlink >= 5 });
  if (conn?.rtt !== undefined) checks.push({ label: 'Connection delay', value: `${conn.rtt} ms`, ok: conn.rtt < 200 });
  // TODO(T1): upload speed needs a timed upload to the storage endpoint.
  return checks;
}
