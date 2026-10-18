/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Telas já vistas (ou pré-carregadas) abrem na hora por 30 s
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
