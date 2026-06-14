/** @type {import('next').NextConfig} */
// Check if the build target is explicitly set to GitHub Pages
const isGithubPages = process.env.IS_GITHUB_PAGES === 'true'

const nextConfig = {
  output: 'export',
  basePath: isGithubPages ? '/to-home-archive' : '',
  assetPrefix: isGithubPages ? '/to-home-archive' : '',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: isGithubPages ? '/to-home-archive' : '',
  },
}

export default nextConfig
