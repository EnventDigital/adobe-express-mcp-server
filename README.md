# Adobe Express MCP Server

This is a Model Context Protocol (MCP) server for Adobe Express integration with LLMs like Claude. It provides tools to interact with Adobe Express features directly from LLM interfaces.

## Features

The server provides the following tools:

1. **Generate Graphic** - Generate an image or graphic using Adobe Express templates
2. **Edit Image** - Edit an existing image using Adobe Express tools
3. **List Templates** - List available Adobe Express templates

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd adobe-express-mcp-server

# Install dependencies
npm install
```

## Development

```bash
# Build the project
npm run build

# Start the server in development mode
npm run dev

# Start the server
npm start
```

## Usage with Claude for Desktop

To use this MCP server with Claude for Desktop:

1. Build the project using `npm run build`
2. Open/create Claude for Desktop configuration file:
   - Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

   You can create/edit this file with VS Code:
   ```bash
   # For Mac
   code ~/Library/Application\ Support/Claude/claude_desktop_config.json
   
   # For Windows
   code %APPDATA%\Claude\claude_desktop_config.json
   ```

3. Add the server configuration:

```json
{
  "mcpServers": {
    "adobe-express": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/adobe-express-mcp-server/dist/index.js"
      ]
    }
  }
}
```

4. Replace `/ABSOLUTE/PATH/TO/` with the actual path to your project.
   For example:
   ```
   "/Users/username/Documents/adobe-express-mcp-server/dist/index.js"
   ```
   
5. Save the file and restart Claude for Desktop

6. When you open Claude, you should see a hammer icon, indicating that MCP tools are available:
   
   ![MCP Tools Icon](https://mintlify.s3.us-west-1.amazonaws.com/mcp/images/claude-desktop-mcp-hammer-icon.svg)

7. You can now use prompts like "Create a social media graphic for a product launch" and Claude will suggest using the Adobe Express tools

## Example Prompts

Here are some example prompts to try with Claude and this MCP server:

- "Create a social media post about our new product launch"
- "Edit my profile image to remove the background"
- "Show me available presentation templates"

## License

MIT
