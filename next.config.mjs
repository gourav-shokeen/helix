import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url);

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
	swcMinify: true,
	images: {
		unoptimized: false,
	},
	experimental: {
		optimizePackageImports: [
			'@tiptap/react',
			'@tiptap/starter-kit',
			'@tiptap/extension-collaboration',
			'@tiptap/extension-collaboration-cursor',
			'mermaid',
			'@supabase/supabase-js',
			'lucide-react',
		],
		turbo: {},
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
	webpack: (config) => {
		config.resolve = config.resolve || {}
		config.resolve.alias = {
			...(config.resolve.alias || {}),
			yjs: require.resolve('yjs'),
		}
		// Fix webpack cache serialization warning (33kiB object)
		config.cache = {
		  type: 'filesystem',
		  buildDependencies: {
		    config: [__filename],
		  },
		  compression: false,
		  maxMemoryGenerations: 1,
		}

		config.optimization = {
		  ...config.optimization,
		  moduleIds: 'deterministic',
		  chunkIds: 'deterministic',
		}
		return config
	},
};

export default withBundleAnalyzer(nextConfig);
