import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Next.js 16's proxy layer caps the request body at 10MB by default.
    // Our /api/upload route accepts PDFs up to 50MB (MAX_BYTES in route.ts
    // + UploadDropzone.tsx), so without this raise the proxy truncates
    // large uploads and the multipart body fails to parse.
    proxyClientMaxBodySize: '50mb',
  },
}

export default nextConfig
