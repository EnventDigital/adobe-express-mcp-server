#!/usr/bin/env node

/**
 * Script to install the Adobe Express MCP Server in a VS Code workspace
 * 
 * This script creates a .vscode/mcp.json file in the user's current workspace
 * to enable the Adobe Express MCP Server for that specific project.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get the absolute path to the package directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');

// Get the current working directory (user's workspace)
const userWorkspaceDir = process.cwd();
const vscodeDir = path.join(userWorkspaceDir, '.vscode');

// Create .vscode directory if it doesn't exist
if (!fs.existsSync(vscodeDir)) {
  fs.mkdirSync(vscodeDir, { recursive: true });
  console.log(`Created ${vscodeDir} directory`);
}

// Create mcp.json content
const mcpConfig = {
  "inputs": [
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
  ],
  "servers": {
    "adobeExpressDev": {
      "type": "stdio",
      "command": "node",
      "args": [path.join(projectDir, 'dist', 'index.js')],
      "env": {
        "MCP_GITHUB_PAT": "${input:github-pat}",
        "KNOWLEDGE_SOURCE_MODE": "${input:knowledge-source-mode}"
      }
    }
  }
};

const mcpJsonPath = path.join(vscodeDir, 'mcp.json');

// Write mcp.json file
fs.writeFileSync(
  mcpJsonPath, 
  JSON.stringify(mcpConfig, null, 2),
  'utf8'
);

console.log('\n');
console.log('='.repeat(80));
console.log('Adobe Express MCP Server - VS Code Workspace Installation');
console.log('='.repeat(80));
console.log(`\nSuccessfully installed MCP configuration to: ${mcpJsonPath}`);
console.log('\nNext steps:');
console.log('1. Open the Command Palette in VS Code (Ctrl/Cmd+Shift+P)');
console.log('2. Run the command "MCP: List Servers"');
console.log('3. Start the "adobeExpressDev" server from the list');
console.log('4. When prompted, enter your GitHub Personal Access Token');
console.log('\nThe server will then be ready to use with VS Code\'s GitHub Copilot.');
console.log('='.repeat(80));
console.log('\n');
