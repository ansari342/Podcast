/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Cross-origin isolation is needed later for high-resolution timers and SharedArrayBuffer in the audio worklet.
    return [{ source: '/(.*)', headers: [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }
    ] }];
  }
};
export default nextConfig;
