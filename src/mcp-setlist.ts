import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { setlistfmRequest } from "./utils-setlistfm.js";

export function registerSetlistfmTools(server: McpServer) {
  // Tool: Search for artist by name
  server.tool(
    "search-artist",
    "Search for artists by name",
    {
      name: z.string().describe("Artist name to search for"),
    },
    async ({ name }) => {
  const data = await setlistfmRequest<any>("/search/artists", { artistName: name });
      if (!data || !data.artist) {
        return { content: [{ type: "text", text: `No artists found for '${name}'.` }] };
      }
      const artists = Array.isArray(data.artist) ? data.artist : [data.artist];
      const results = artists.map((a: any) => `${a.name} (mbid: ${a.mbid || "N/A"})`).join("\n");
      return { content: [{ type: "text", text: `Artists found:\n${results}` }] };
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
    async ({ mbid, limit }) => {
  const data = await setlistfmRequest<any>(`/artist/${mbid}/setlists`);
      if (!data || !data.setlist) {
        return { content: [{ type: "text", text: `No setlists found for artist mbid '${mbid}'.` }] };
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
      return { content: [{ type: "text", text: `Recent setlists for artist mbid ${mbid}:\n${formatted}` }] };
    }
  );
}
