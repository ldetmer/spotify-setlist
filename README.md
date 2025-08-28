# MCP server running for querying setlist FM and adding songs from setlists to your spotify account

# Setup
1) ensure you have a spotify developer account 

Create an account on developer.spotify.com. Navigate to the dashboard. Create an app with redirect_uri as http://127.0.0.1:8080/callback

2) ensure you have a setlist.fm developer account

3) create an .env file with the following variables

```
SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET=YOUR_SPOTIFY_SECRET_ID
SPOTIFY_REDIRECT_URI=YOUR_SPOTIFY_REDIRECT_URI
SETLISTFM_API_KEY=YOUR_SETLISTFM_API_KEY
```

4) add this MCP server snippet to your CLI.  Example for gemini CLI (~/.gemini/settings.json)

```
{
  "theme": "ANSI",
  "selectedAuthType": "oauth-personal",
  "mcpServers": 
    "setlist": {
      "command": "node",
      "args": [
        "{code location}/spotify-setlist/build/index.js"
      ]
    }
  }
}
```

# Usage

From your AI CLI try running a command like:

can you lookup the most recent setlist by <artist> and create a new playlist in my spotify account with all the songs from the setlist





