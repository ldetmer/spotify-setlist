// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

// Helper to require env vars
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}


// --- MCP SERVER SETUP ---
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSpotifyTools } from "./mcp-spotify.js";
import { registerSetlistfmTools } from "./mcp-setlist.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Start the Spotify auth server as a child process
const authServer = spawn("node", [path.resolve(__dirname, "spotify-auth-server.js")], {
  stdio: "inherit"
});

// Helper to read the access token from file
function getSpotifyAccessToken(): string | null {
  try {
    const tokenPath = path.resolve(process.cwd(), ".spotify-token.json");
    if (!fs.existsSync(tokenPath)) return null;
    const data = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    return data.access_token || null;
  } catch {
    return null;
  }
}

const server = new McpServer({
  name: "setlistfm",
  version: "1.0.0",
});

registerSetlistfmTools(server);
registerSpotifyTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Setlist.fm MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

