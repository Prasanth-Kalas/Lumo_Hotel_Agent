/** @type {import('next').NextConfig} */
const nextConfig = {
  // The SDK ships TS sources over git; Next has to compile it.
  transpilePackages: ["@lumo/agent-sdk"],
  async headers() {
    // The shell fetches these from another origin (the orchestrator's host)
    // for discovery. Allow CORS on manifest + openapi so curl and the shell
    // can both pull them without fuss.
    return [
      {
        source: "/.well-known/agent.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        ],
      },
      {
        source: "/openapi.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        ],
      },
    ];
  },
};

export default nextConfig;
