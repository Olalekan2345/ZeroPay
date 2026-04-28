/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Wallet-connected dApp — skip static pre-rendering for all pages
  staticPageGenerationTimeout: 180,
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias["@react-native-async-storage/async-storage"] =
      false;
    return config;
  },
};
export default nextConfig;
