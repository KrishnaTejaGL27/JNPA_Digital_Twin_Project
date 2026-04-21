/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'mapbox-gl': 'mapbox-gl',
    };
    // Suppress mapbox-gl webpack warning
    config.module = {
      ...config.module,
      exprContextCritical: false,
    };
    return config;
  },
};

module.exports = nextConfig;