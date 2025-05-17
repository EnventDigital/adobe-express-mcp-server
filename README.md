# Adobe Express MCP Server

This is a Model Context Protocol (MCP) server designed for Adobe Express Add-on developers. It provides developer-focused tools to assist with building Adobe Express add-ons and integrating with Adobe Express SDK.

## Features

The server provides the following tools:

### Developer Tools
1. **Scaffold Add-on Project** - Create a new Adobe Express add-on project based on sample templates
2. **Get Code Examples** - Retrieve code examples for common Adobe Express add-on features (dynamically fetched from GitHub when in GitHub mode)
3. **Implement Feature** - Get implementation guidance for adding specific features to an Adobe Express add-on

### Documentation Tools
1. **Get Assistant Capabilities** - Get information about the assistant's capabilities
2. **Set Knowledge Source** - Switch between GitHub API and local documentation modes
3. **Query Documentation** - Search Adobe Express SDK and Spectrum Web Components documentation

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

# Parse documentation repositories for local mode
npm run parse-docs
```

## Documentation Sources

This MCP server can access documentation from two sources:

### 1. GitHub Mode (Default)

In GitHub mode, the server uses the GitHub API to search and fetch documentation from:
- [Adobe Express Add-ons Documentation](https://github.com/AdobeDocs/express-add-ons-docs)
- [Spectrum Web Components](https://github.com/adobe/spectrum-web-components)

To use GitHub mode, you need to create a GitHub Personal Access Token (PAT) and add it to your `.env` file:

```bash
MCP_GITHUB_PAT=your_github_token_here
```

### 2. Local Mode

In local mode, the server uses pre-parsed documentation stored in a local knowledge base file. To generate this file:

1. Clone the documentation repositories:
```bash
mkdir -p adobe-docs-repo
git clone https://github.com/AdobeDocs/express-add-ons-docs.git adobe-docs-repo/express-add-ons-docs
git clone https://github.com/adobe/spectrum-web-components.git adobe-docs-repo/spectrum-web-components
```

2. Build the project and run the parser:
```bash
npm run build
npm run parse-docs
```

3. This creates a `dist/knowledge_base.json` file with parsed documentation.

You can switch between modes using the "setKnowledgeSource" tool or by setting the `KNOWLEDGE_SOURCE_MODE` in your `.env` file.

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

7. You can now use prompts like "Help me scaffold a dialog add-on project" or "Show me code examples for the Dialog API" and Claude will use the developer tools

## Example Prompts

Here are some example prompts to try with Claude and this MCP server:

### Developer Tool Examples
- "Help me scaffold a new dialog add-on project"
- "Show me code examples for importing local images in an Adobe Express add-on"
- "How do I implement drag-and-drop functionality in my add-on?"
- "Give me a code example of using the Dialog API"
- "Help me implement OAuth authentication in my Express add-on"

### Documentation Tool Examples
- "What capabilities does this MCP server have?"
- "Search for documentation about Spectrum Web Components buttons"
- "How do I use the Adobe Express SDK in my add-on?"
- "Find documentation about spectrum-tooltip components"
- "Switch to local documentation mode"

## License

MIT
