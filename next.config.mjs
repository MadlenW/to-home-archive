/** @type {import('next').NextConfig} */
const nextConfig = {
  // Leave output, basePath, and assetPrefix completely out so Vercel builds normally
  images: { unoptimized: true },
}

export default nextConfig
