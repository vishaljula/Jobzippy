/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Disable ESLint during builds (we run it separately)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

