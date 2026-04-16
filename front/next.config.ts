import type { NextConfig } from "next";
import CopyPlugin from "copy-webpack-plugin";

const nextConfig: NextConfig = {
    webpack(config) {
        config.module.exprContextCritical = false;

        config.experiments = {
            asyncWebAssembly: true,
            layers: true,
        };

        config.plugins.push(
            new CopyPlugin({
                patterns: [
                    { from: "public/web-ifc.wasm", to: "static/chunks/" },
                    { from: "public/test.ifc", to: "static/chunks/" }
                ],
            })
        );

        return config;
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    experimental: {},
};

export default nextConfig;