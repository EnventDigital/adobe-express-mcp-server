# Community MCP Server for Adobe Express Add-on Developers

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

You can install the Adobe Express MCP Server in several ways:

### Method 1: Install from NPM

```bash
# Install globally
npm install -g community-express-dev-mcp

# Run the VS Code installation script
express-mcp-install
```

### Method 2: Install from GitHub

```bash
# Clone the repository
git clone https://github.com/EnventDigital/community-express-dev-mcp.git
cd community-express-dev-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run the VS Code installation script
npm run install-in-vscode
```

### Method 3: Install in a specific VS Code workspace

If you want to use the MCP server in a specific VS Code workspace:

```bash
# If installed globally from NPM:
cd /path/to/your/project
express-mcp-workspace

# If installed from GitHub:
cd /path/to/your/project
/path/to/community-express-dev-mcp/scripts/install-to-workspace.js
```

This will create a `.vscode/mcp.json` file in your project that configures the Adobe Express MCP server for that workspace.

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
        "/ABSOLUTE/PATH/TO/community-express-dev-mcp/dist/index.js"
      ]
    }
  }
}
```

4. Replace `/ABSOLUTE/PATH/TO/` with the actual path to your project.
   For example:
   ```
   "/Users/username/Documents/community-express-dev-mcp/dist/index.js"
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

## Using with VS Code

This MCP server is configured to work with VS Code's GitHub Copilot agent mode. Follow these steps to use it:

### Prerequisites

- Visual Studio Code (version 1.99 or newer)
- GitHub Copilot extension
- Node.js environment (v18 or newer recommended)

### Setup

#### Option 1: Using the Installation Scripts

The easiest way to set up the MCP server in VS Code is to use one of the installation methods described in the [Installation](#installation) section above. These scripts will:

1. Create the correct configuration for the MCP server
2. Generate a one-click URL to install in VS Code
3. Automatically prompt for the GitHub PAT when needed

#### Option 2: Manual Setup

If you prefer to set up manually:

1. Make sure you've built the project: `npm run build`
2. Configure the server by:
   - Using the global MCP configuration in VS Code settings
   - OR using the workspace-specific `.vscode/mcp.json` file (already included in this project)
3. In VS Code, ensure the `chat.mcp.enabled` setting is turned on:
   - Open settings (Ctrl+, or Cmd+,)
   - Search for `chat.mcp.enabled`
   - Make sure it's checked
4. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
5. Run `MCP: List Servers` to see the available servers
6. Start the `adobeExpressDev` server from the list
7. When prompted, enter your GitHub Personal Access Token for accessing code samples

### Usage with Copilot

1. Open the VS Code Chat view (Ctrl+Alt+I or Cmd+I)
2. Select "Agent mode" from the dropdown
3. Click on the "Tools" button to see available tools, including Adobe Express developer tools
4. Ask questions like:
   - "Create a new Adobe Express add-on that uses the dialog API"
   - "Show me code examples for importing images in an Express add-on"
   - "How do I implement OAuth authentication in my add-on?"

The MCP server enhances Copilot with specialized Adobe Express add-on development knowledge and code examples drawn directly from the official samples repository.

## NPM Package

The Adobe Express MCP Server is available as an npm package that you can install globally or as a dependency in your project:

```bash
# Install globally
npm install -g community-express-dev-mcp

# Or install as a dev dependency in your project
npm install --save-dev community-express-dev-mcp
```

After installation, you can use the following commands:

```bash
# Install globally in VS Code
express-mcp-install

# Install in current workspace
express-mcp-workspace

# Show help
express-mcp-help
```

## Troubleshooting

### Error: Tool has no outputSchema but returned structuredContent

If you encounter this error:
```
Error: MPC -32603: MCP error -32603: Tool queryDocumentation has no outputSchema but returned structuredContent
```

This indicates that the MCP tool is returning structured content but doesn't have an output schema defined correctly. This has been fixed in version 1.0.1+.

Solution:
1. Make sure you're using the latest version of the MCP server
2. Rebuild the server with `npm run build`
3. Restart the MCP server in your editor

If you're still experiencing issues:
1. Check that the output schema format follows the MCP schema format (not using Zod's `.shape` property)
2. Ensure the `structuredContent` object structure matches the defined output schema
3. Test the server locally with the included test script: `npm run test-server`

### Error: "cb is not a function" 

This error typically occurs when the callback format is incorrect in a tool function or when the tool's return value doesn't match the expected format.

Solution:
1. Make sure your tool output is in the correct format: `{ structuredContent: {...}, content: [...] }`
2. Avoid using TypeScript interfaces directly as return values; instead, create a plain object that matches the schema
3. Check that all required fields in the output schema are present in the structuredContent object

### Other Common Issues

- **GitHub API Rate Limiting**: If you're in GitHub mode and don't provide a GitHub Personal Access Token (PAT), you may hit rate limits.
- **Knowledge Base Not Loading**: If using local mode, ensure the `knowledge_base.json` file exists in the project root.
- **Command Not Found**: Ensure you've built the project with `npm run build` before trying to run the server.

## License

MIT
