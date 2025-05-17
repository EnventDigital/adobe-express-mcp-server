#!/usr/bin/env node

/**
 * Script to install the Adobe Express MCP Server in VS Code globally
 * 
 * This generates and outputs a URL that can be used to install the server
 * in VS Code with one click, and also provides the command line version.
 */

import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get the absolute path to the package directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');
const serverPath = path.join(projectDir, 'dist', 'index.js');

// Determine if this is installed as a package or running locally
const isInstalledAsPackage = !projectDir.includes('MCP-server');

// Create the configuration object based on installation method
const mcpConfig = {
  name: "adobeExpressDev",
  type: "stdio",
  command: "node",
  args: [serverPath]
};

// Add environment variable input parameters
mcpConfig.inputs = [
  {
    "type": "promptString",
    "id": "github-pat",
    "description": "GitHub Personal Access Token for accessing Adobe Express samples repository",
    "password": true
  },
  {
    "type": "pickString",
    "id": "knowledge-source-mode",
    "description": "Knowledge source mode for documentation",
    "options": ["github", "local"],
    "default": "github"
  }
];

// Add environment variables
mcpConfig.env = {
  "MCP_GITHUB_PAT": "${input:github-pat}",
  "KNOWLEDGE_SOURCE_MODE": "${input:knowledge-source-mode}"
};

// URL encode the configuration
const encodedConfig = encodeURIComponent(JSON.stringify(mcpConfig));
const vsCodeUrl = `vscode://mcp/install?${encodedConfig}`;

// Command line version
const commandLine = `code --add-mcp "${JSON.stringify(mcpConfig).replace(/"/g, '\\"')}"`;

console.log('\n');
console.log('='.repeat(80));
console.log('Adobe Express MCP Server - VS Code Installation');
console.log('='.repeat(80));
console.log('\nOption 1: Click on the following URL to install in VS Code:');
console.log('\n' + vsCodeUrl);
console.log('\nOption 2: Run the following command in your terminal:');
console.log('\n' + commandLine);
console.log('\n');
console.log('Note: You will need to have VS Code version 1.99+ and GitHub Copilot installed.');
console.log('='.repeat(80));
console.log('\n');

// Try to open the URL automatically on macOS
try {
  console.log('Attempting to open the URL automatically...');
  execSync(`open "${vsCodeUrl}"`);
  console.log('URL opened in VS Code. Please check VS Code for confirmation.');
} catch (error) {
  console.log('Could not automatically open URL. Please copy and paste it into your browser.');
}
