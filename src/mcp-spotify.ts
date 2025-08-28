import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spotifyRequest } from "./utils-spotify.js";
import { generateRandomString } from "./utils-spotify.js";
import { generateCodeChallenge } from "./utils-spotify.js";
import { requireEnv } from "./utils-spotify.js";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_CLIENT_ID = requireEnv("SPOTIFY_CLIENT_ID");
const SPOTIFY_CLIENT_SECRET = requireEnv("SPOTIFY_CLIENT_SECRET");
const SPOTIFY_REDIRECT_URI = requireEnv("SPOTIFY_REDIRECT_URI");

import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

let spotifyAccessToken: string | null = null;
let spotifyRefreshToken: string | null = null;


const app = express();
app.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("Missing code parameter");
    return;
  }
  const verifierPath = path.resolve(process.cwd(), ".spotify-code-verifier.txt");
  if (!fs.existsSync(verifierPath)) {
    res.status(400).send("No code verifier found. Start auth flow first.");
    return;
  }
  const spotifyCodeVerifier = fs.readFileSync(verifierPath, "utf8");
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: spotifyCodeVerifier!,
    client_secret: SPOTIFY_CLIENT_SECRET,
  });
  try {
    const resp = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!resp.ok) {
      const errorData = await resp.json();
      res.status(500).send(`Failed to get token: ${errorData}`);
      return;
    }
    const data = await resp.json() as { access_token: string; refresh_token?: string };
    spotifyAccessToken = data.access_token;
    spotifyRefreshToken = data.refresh_token || null;
    const tokenPath = path.resolve(process.cwd(), ".spotify-token.json");
    fs.writeFileSync(tokenPath, JSON.stringify({ 
      access_token: data.access_token,
      refresh_token: data.refresh_token 
    }));
    res.send("Spotify authentication successful! You can close this window.");
    console.log("Spotify access token stored in .spotify-token.json.");
  } catch (err) {
    res.status(500).send("Error exchanging code for token");
  }
});

app.listen(8080, () => {
  console.log("Express server listening on http://127.0.0.1:8080/callback");
});

export function registerSpotifyTools(server: McpServer) {
  
  // MCP Tool: Create Spotify playlist
  server.tool(
    "spotify-create-playlist",
    "Create a new Spotify playlist for the authenticated user",
    {
      name: z.string().describe("Playlist name"),
      description: z.string().optional().describe("Playlist description"),
      public: z.boolean().optional().describe("Is playlist public?"),
    },
    async ({ name, description, public: isPublic }) => {
      if (!spotifyAccessToken) {
        return { content: [{ type: "text", text: "Spotify access token not set." }] };
      }
      // Get user profile
  const user = await spotifyRequest<any>("/me", "GET", undefined, spotifyAccessToken);
      if (!user || !user.id) {
        return { content: [{ type: "text", text: "Failed to get Spotify user profile." }] };
      }
      // Create playlist
  const playlist = await spotifyRequest<any>(`/users/${user.id}/playlists`, "POST", {
        name,
        description: description || "",
        public: isPublic ?? true,
      }, spotifyAccessToken);
      if (!playlist || !playlist.id) {
        return { content: [{ type: "text", text: "Failed to create playlist." }] };
      }
      return { content: [{ type: "text", text: `Playlist created: ${playlist.name} (${playlist.id})` }] };
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
    async ({ playlistId, uris }) => {
      if (!spotifyAccessToken) {
        return { content: [{ type: "text", text: "Spotify access token not set." }] };
      }
      const result = await spotifyRequest<any>(`/playlists/${playlistId}/tracks`, "POST", { uris }, spotifyAccessToken);
      if (!result || !result.snapshot_id) {
        return { content: [{ type: "text", text: "Failed to add songs to playlist." }] };
      }
      return { content: [{ type: "text", text: `Added ${uris.length} songs to playlist ${playlistId}` }] };
    }
  );

  // MCP Tool: Search for songs on Spotify
  server.tool(
    "spotify-search-track",
    "Search for songs on Spotify by query string",
    {
      query: z.string().describe("Search query for track name, artist, etc."),
      limit: z.number().min(1).max(50).optional().describe("Max number of tracks to return (default 10)"),
    },
    async ({ query, limit }) => {
      if (!spotifyAccessToken) {
        return { content: [{ type: "text", text: "Spotify access token not set. Authorize first." }] };
      }
      const max = limit || 10;
  const result = await spotifyRequest<any>(`/search?type=track&q=${encodeURIComponent(query)}&limit=${max}`, "GET", undefined, spotifyAccessToken);
      if (!result || !result.tracks || !result.tracks.items) {
        return { content: [{ type: "text", text: "No tracks found." }] };
      }
      const tracks = result.tracks.items.map((track: any) =>
        `Track: ${track.name}\nArtist(s): ${track.artists.map((a: any) => a.name).join(", ")}\nAlbum: ${track.album.name}\nURI: ${track.uri}\nID: ${track.id}\n---`
      ).join("\n");
      return { content: [{ type: "text", text: tracks }] };
    }
  );

  // MCP Tool: Search for playlists on Spotify
  server.tool(
    "spotify-search-playlist",
    "Search for playlists on Spotify by query string",
    {
      query: z.string().describe("Search query for playlist name, etc."),
      limit: z.number().min(1).max(50).optional().describe("Max number of playlists to return (default 10)"),
    },
    async ({ query, limit }) => {
      if (!spotifyAccessToken) {
        return { content: [{ type: "text", text: "Spotify access token not set. Call." }] };
      }
      const max = limit || 10;
      const result = await spotifyRequest<any>(`/search?type=playlist&q=${encodeURIComponent(query)}&limit=${max}`, "GET", undefined, spotifyAccessToken);
      if (!result || !result.playlists || !result.playlists.items) {
        return { content: [{ type: "text", text: "No playlists found." }] };
      }
      const playlists = result.playlists.items
        .filter((pl: any) => pl && pl.name && pl.owner && pl.tracks)
        .map((pl: any) =>
          `Playlist: ${pl.name}\nOwner: ${pl.owner.display_name || pl.owner.id || "Unknown"}\nTracks: ${pl.tracks.total ?? "Unknown"}\nURI: ${pl.uri ?? "Unknown"}\nID: ${pl.id ?? "Unknown"}\n---`
        ).join("\n");
      if (!playlists) {
        return { content: [{ type: "text", text: "No valid playlists found." }] };
      }
      return { content: [{ type: "text", text: playlists }] };
    }
  );

  // MCP Tool: Get Spotify authorization URL
server.tool(
  "spotify-get-auth-url",
  "Get Spotify authorization URL for OAuth",
  {},
  async () => {
    const spotifyCodeVerifier = generateRandomString(64);
    const verifierPath = path.resolve(process.cwd(), ".spotify-code-verifier.txt");
    fs.writeFileSync(verifierPath, spotifyCodeVerifier);
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
}
