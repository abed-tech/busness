/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://checkout.cinetpay.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export default {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@ceremonia/core", "@ceremonia/server"],
  serverExternalPackages: ["pg"],
  experimental: { serverActions: { allowedOrigins: [new URL(process.env.ORGANIZER_ORIGIN || "http://localhost:3000").host], bodySizeLimit: "7mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // caméra autorisée pour le scanner des contrôleurs et serveurs (sur ce domaine uniquement)
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      { source: "/(i|k|s)/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
