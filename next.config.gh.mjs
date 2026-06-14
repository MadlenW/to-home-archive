/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/to-home-archive', // <-- This handles BOTH the page routing and the asset paths cleanly
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: '/to-home-archive',
  },
}

export default nextConfig
