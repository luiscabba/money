/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // The build the page was made from, so an app resumed after a deploy can tell its code is out of date.
  env: { NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12) },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'no-referrer' }] }
    ];
  }
};
