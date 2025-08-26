// --- SETLIST.FM MCP SERVER ---
import fetch from "node-fetch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SETLISTFM_API_BASE = "https://api.setlist.fm/rest/1.0";
const SETLISTFM_API_KEY = process.env.SETLISTFM_API_KEY || "ymAsryItcQF4ma4d57bZ9jf2Zf3m-XYaTkPf";
const USER_AGENT = "setlistfm-mcp/1.0";

// Helper for setlist.fm API requests
async function setlistfmRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
  let url = `${SETLISTFM_API_BASE}${endpoint}`;
  if (params) {
    const search = new URLSearchParams(params).toString();
    url += `?${search}`;
  }
  const headers = {
    "x-api-key": SETLISTFM_API_KEY,
    "Accept": "application/json",
    "User-Agent": USER_AGENT,
  };
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making setlist.fm request:", error);
    return null;
  }
}

// MCP Server
const server = new McpServer({
  name: "setlistfm",
  version: "1.0.0",
});

// Tool: Search for artist by name
server.tool(
  "search-artist",
  "Search for artists by name",
  {
    name: z.string().describe("Artist name to search for"),
  },
  async ({ name }: { name: string }) => {
    const data = await setlistfmRequest<any>("/search/artists", { artistName: name });
    if (!data || !data.artist) {
      return {
        content: [
          { type: "text", text: `No artists found for '${name}'.` },
        ],
      };
    }
    const artists = Array.isArray(data.artist) ? data.artist : [data.artist];
    const results = artists.map((a: any) => `${a.name} (mbid: ${a.mbid || "N/A"})`).join("\n");
    return {
      content: [
        { type: "text", text: `Artists found:\n${results}` },
      ],
    };
  }
);

// Tool: Get recent setlists for artist
server.tool(
  "get-recent-setlists",
  "Get recent setlists for an artist",
  {
    mbid: z.string().describe("MusicBrainz ID (mbid) of the artist"),
    limit: z.number().min(1).max(10).optional().describe("Max number of setlists to return (default 5)"),
  },
  async ({ mbid, limit }: { mbid: string; limit?: number }) => {
    const data = await setlistfmRequest<any>(`/artist/${mbid}/setlists`);
    if (!data || !data.setlist) {
      return {
        content: [
          { type: "text", text: `No setlists found for artist mbid '${mbid}'.` },
        ],
      };
    }
    const setlists = Array.isArray(data.setlist) ? data.setlist : [data.setlist];
    const max = limit || 5;
    const recent = setlists.slice(0, max);
    const formatted = recent.map((s: any) => {
      const eventDate = s.eventDate || "";
      const venue = s.venue?.name || "";
      const city = s.venue?.city?.name || "";
      const country = s.venue?.city?.country?.name || "";
      const songs = (s.sets?.set || []).flatMap((set: any) => (set.song || []).map((song: any) => song.name)).join(", ");
      return `Date: ${eventDate}\nVenue: ${venue}, ${city}, ${country}\nSongs: ${songs}`;
    }).join("\n---\n");
    return {
      content: [
        { type: "text", text: `Recent setlists for artist mbid ${mbid}:\n${formatted}` },
      ],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Setlist.fm MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
