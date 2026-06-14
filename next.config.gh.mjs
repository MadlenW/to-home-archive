/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/to-home-archive',
  assetPrefix: '/to-home-archive/',
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: '/to-home-archive',
  },
}

export default nextConfig
