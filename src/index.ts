// --- SETLIST.FM & SPOTIFY MCP SERVER ---
import fetch from "node-fetch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Spotify API constants
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "9c2f1921cfda4f11af5043c03c7e3737";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "9ffb2f66eead437b9962c125933695a7";
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:8888/callback";

let spotifyAccessToken: string | null = null;
let spotifyRefreshToken: string | null = null;
let spotifyCodeVerifier: string | null = null;

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

// Helper for Spotify API requests
async function spotifyRequest<T>(endpoint: string, method: string = "GET", body?: any): Promise<T | null> {
  const url = `${SPOTIFY_API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${spotifyAccessToken}`,
    "Content-Type": "application/json",
  };
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making Spotify request:", error);
    return null;
  }
}

// Helper to generate random string for PKCE
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Helper to generate PKCE code challenge (S256)
function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateCodeChallenge(codeVerifier: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64UrlEncode(hash);
}

// ...existing code...

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

// MCP Tool: Create Spotify playlist
server.tool(
  "spotify-create-playlist",
  "Create a new Spotify playlist for the authenticated user",
  {
    name: z.string().describe("Playlist name"),
    description: z.string().optional().describe("Playlist description"),
    public: z.boolean().optional().describe("Is playlist public?"),
  },
  async ({ name, description, public: isPublic }: { name: string; description?: string; public?: boolean }) => {
  if (!spotifyAccessToken) {
      return {
        content: [
          { type: "text", text: "Spotify access token not set." },
        ],
      };
    }
    // Get user profile
    const user = await spotifyRequest<any>("/me");
    if (!user || !user.id) {
      return {
        content: [
          { type: "text", text: "Failed to get Spotify user profile." },
        ],
      };
    }
    // Create playlist
    const playlist = await spotifyRequest<any>(`/users/${user.id}/playlists`, "POST", {
      name,
      description: description || "",
      public: isPublic ?? true,
    });
    if (!playlist || !playlist.id) {
      return {
        content: [
          { type: "text", text: "Failed to create playlist." },
        ],
      };
    }
    return {
      content: [
        { type: "text", text: `Playlist created: ${playlist.name} (${playlist.id})` },
      ],
    };
  }
);

// MCP Tool: Add songs to Spotify playlist
server.tool(
  "spotify-add-songs",
  "Add songs to a Spotify playlist",
  {
    playlistId: z.string().describe("Spotify playlist ID"),
    uris: z.array(z.string()).describe("Array of Spotify track URIs (e.g. spotify:track:xxxx)"),
  },
  async ({ playlistId, uris }: { playlistId: string; uris: string[] }) => {
  if (!spotifyAccessToken) {
      return {
        content: [
          { type: "text", text: "Spotify access token not set." },
        ],
      };
    }
    const result = await spotifyRequest<any>(`/playlists/${playlistId}/tracks`, "POST", { uris });
    if (!result || !result.snapshot_id) {
      return {
        content: [
          { type: "text", text: "Failed to add songs to playlist." },
        ],
      };
    }
    return {
      content: [
        { type: "text", text: `Added ${uris.length} songs to playlist ${playlistId}` },
      ],
    };
  }
);

// MCP Tool: Get Spotify authorization URL
// MCP Tool: Get Spotify authorization URL
server.tool(
  "spotify-get-auth-url",
  "Get Spotify authorization URL for OAuth",
  {},
  async () => {
    spotifyCodeVerifier = generateRandomString(64);
    const codeChallenge = generateCodeChallenge(spotifyCodeVerifier);
    const state = generateRandomString(16);
    const scope = [
      "playlist-modify-public",
      "playlist-modify-private",
      "user-read-private",
      "user-read-email",
    ].join(" ");
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${encodeURIComponent(
      SPOTIFY_CLIENT_ID
    )}&redirect_uri=${encodeURIComponent(
      SPOTIFY_REDIRECT_URI
    )}&scope=${encodeURIComponent(scope)}&state=${state}&code_challenge_method=S256&code_challenge=${codeChallenge}`;
    return {
      content: [
        { type: "text", text: `Open this URL to authorize Spotify: ${authUrl}` },
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
