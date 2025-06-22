
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Aplicar estos encabezados a todas las rutas de la aplicación
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            // Permite el acceso a la API serial. 
            // 'serial=*' permite a todos los orígenes, considera 'serial=self' para mayor seguridad si es aplicable.
            value: 'serial=*', 
          },
        ],
      },
    ];
  },
};

export default nextConfig;
