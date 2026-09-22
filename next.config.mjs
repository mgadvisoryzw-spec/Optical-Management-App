/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF / Excel generation libraries run on the server only
  serverExternalPackages: ["exceljs", "jspdf", "jspdf-autotable"],
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};
export default nextConfig;
