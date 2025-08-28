import fetch from "node-fetch";
import dotenv from "dotenv";
import { requireEnv } from "./utils-spotify.js";
dotenv.config();

const SETLISTFM_API_BASE = "https://api.setlist.fm/rest/1.0";
const SETLISTFM_API_KEY = requireEnv("SETLISTFM_API_KEY");
const USER_AGENT = "setlistfm-mcp/1.0";

export async function setlistfmRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
  let url = `${SETLISTFM_API_BASE}${endpoint}`;
  if (params) {
    const search = new URLSearchParams(params).toString();
    url += `?${search}`;
  }
  const headers: Record<string, string> = {
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
