/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS === 'true'

const nextConfig = {
  output:      'export',
  basePath:    isGithubActions ? '/to-home-archive' : '',
  assetPrefix: isGithubActions ? '/to-home-archive' : '',
  images: {
    unoptimized: true,
  },
}

export default nextConfig
