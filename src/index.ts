import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GitHubDocService, MCPResultItem } from './github_doc_service.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Define ServerInfo type
interface ServerInfo {
  name: string;
  version: string;
  description?: string;
}

// Load environment variables
dotenv.config();

// --- Knowledge Base Configuration ---
let LOCAL_KNOWLEDGE_BASE: MCPResultItem[] = [];
const KB_FILE_PATH = path.join(__dirname, '..', 'knowledge_base.json');

type KnowledgeSourceMode = 'github' | 'local';
let currentKnowledgeMode: KnowledgeSourceMode = (process.env.KNOWLEDGE_SOURCE_MODE?.toLowerCase() === 'local' ? 'local' : 'github');
const availableKnowledgeModes: KnowledgeSourceMode[] = ['github', 'local'];

// --- GitHub Service Initialization ---
const githubService = new GitHubDocService();

/**
 * Loads the local knowledge base from disk if available
 */
function loadLocalKnowledgeBase(): void {
  if (!availableKnowledgeModes.includes('local')) return;
  try {
    if (fs.existsSync(KB_FILE_PATH)) {
      const jsonData = fs.readFileSync(KB_FILE_PATH, 'utf-8');
      LOCAL_KNOWLEDGE_BASE = JSON.parse(jsonData) as MCPResultItem[];
      console.error(`Successfully loaded ${LOCAL_KNOWLEDGE_BASE.length} items into LOCAL_KNOWLEDGE_BASE from ${KB_FILE_PATH}`);
    } else {
      console.error(`Local knowledge base file not found at ${KB_FILE_PATH}. LOCAL_KNOWLEDGE_BASE will be empty.`);
      LOCAL_KNOWLEDGE_BASE = [];
    }
  } catch (error) {
    console.error(`Error loading local knowledge base from ${KB_FILE_PATH}:`, error);
    LOCAL_KNOWLEDGE_BASE = [];
  }
}

// --- Zod Schemas for Tool Inputs ---
const QueryContextSchema = z.object({
  current_file: z.string().optional(),
  project_type: z.string().optional(),
  current_selection_in_editor: z.string().optional(),
}).optional();

const QueryDocumentationInputSchema = z.object({
  query_text: z.string().min(1, "Query text cannot be empty"),
  context: QueryContextSchema,
  target_source: z.enum(['express_sdk', 'spectrum_web_components', 'all']).optional(),
  response_type_preferences: z.array(z.string()).optional(),
});

const SetKnowledgeSourceInputSchema = z.object({
  mode: z.enum(['github', 'local']),
});

// --- TypeScript Interfaces ---
interface QueryDocumentationOutput {
  query_received: string;
  results: MCPResultItem[];
  confidence_score?: number;
  mode_used?: 'github' | 'local';
}

interface AssistantCapabilitiesOutput {
  agent_name: string;
  description: string;
  supported_query_keywords?: string[];
  documentation_source: string;
  current_knowledge_mode: 'github' | 'local';
  available_knowledge_modes: ('github' | 'local')[];
}

// Create server instance
const serverInfo = {
  name: "adobe-express-developer-assistant",
  version: "1.0.0",
  description: "Developer assistant for Adobe Express Add-on and Spectrum Web Components development"
};

const server = new McpServer(serverInfo);

// Load knowledge base and initialize
loadLocalKnowledgeBase();
console.error(`MCP Server initialized. Name: ${serverInfo.name}, Version: ${serverInfo.version}`);
console.error(`Initial knowledge source mode: ${currentKnowledgeMode}`);
if (currentKnowledgeMode === 'github' && !process.env.MCP_GITHUB_PAT) {
  console.error("WARNING: GitHub mode selected, but MCP_GITHUB_PAT environment variable is not set. GitHub API calls may fail or be heavily rate-limited.");
}

// Register documentation tools
server.tool(
  "getAssistantCapabilities",
  "Get the current capabilities, status, and configuration of the Adobe Express & Spectrum Assistant.",
  {}, // Empty object for params
  async (_args, _extra) => {
    const allTags = new Set<string>();
    if (currentKnowledgeMode === 'local' && LOCAL_KNOWLEDGE_BASE.length > 0) {
      LOCAL_KNOWLEDGE_BASE.forEach(item => {
        if (item.tags) item.tags.forEach(tag => allTags.add(tag));
      });
    } else {
      allTags.add("adobe express");
      allTags.add("sdk");
      allTags.add("addon");
      allTags.add("spectrum");
      allTags.add("web components");
      allTags.add("sp-button");
    }
    
    const capabilities: AssistantCapabilitiesOutput = {
      agent_name: serverInfo.name,
      description: serverInfo.description || "Adobe SDK Assistant",
      supported_query_keywords: Array.from(allTags).slice(0, 40),
      documentation_source: currentKnowledgeMode === 'github' ?
        "Live from GitHub (AdobeDocs & Adobe SWC)" :
        "Local knowledge_base.json (Express SDK & SWC)",
      current_knowledge_mode: currentKnowledgeMode,
      available_knowledge_modes: availableKnowledgeModes,
    };
    
    // Return in MCP-compatible format
    return {
      structuredContent: capabilities as unknown as Record<string, unknown>,
      content: [
        {
          type: "text",
          text: `${capabilities.agent_name}: ${capabilities.description}. Using ${capabilities.documentation_source} in '${capabilities.current_knowledge_mode}' mode.`
        }
      ]
    };
  }
);

server.tool(
  "setKnowledgeSource",
  "Set the knowledge source mode for the assistant (github or local).",
  SetKnowledgeSourceInputSchema.shape, // Extract the schema shape
  async (validatedPayload) => {
    currentKnowledgeMode = validatedPayload.mode;
    console.error(`Knowledge source mode changed to: ${currentKnowledgeMode}`);
    if (currentKnowledgeMode === 'local' && LOCAL_KNOWLEDGE_BASE.length === 0) loadLocalKnowledgeBase();
    if (currentKnowledgeMode === 'github' && !process.env.MCP_GITHUB_PAT) console.error("WARNING: Switched to GitHub mode, but MCP_GITHUB_PAT is not set.");
    
    return {
      structuredContent: {
        status: 'success',
        message: `Knowledge source mode successfully set to '${currentKnowledgeMode}'.`,
        new_mode: currentKnowledgeMode
      },
      content: [
        {
          type: "text",
          text: `Knowledge source mode successfully set to '${currentKnowledgeMode}'.`
        }
      ]
    };
  }
);

server.tool(
  "queryDocumentation",
  "Query the Adobe Express SDK and Spectrum Web Components documentation.",
  QueryDocumentationInputSchema.shape, // Extract the schema shape
  async (validatedPayload) => {
    const query_text = validatedPayload.query_text;
    const target_source_hint = validatedPayload.target_source;
    let results: MCPResultItem[] = [];
    let confidence_score = 0.2;

    if (currentKnowledgeMode === 'github') {
      console.error(`Querying GitHub for: "${query_text}" (Target hint: ${target_source_hint || 'all'})`);
      try {
        let effectiveTargetSource: 'express_sdk' | 'spectrum_web_components' | 'all' = target_source_hint || 'all';
        if (!target_source_hint) {
          if (query_text.toLowerCase().includes('spectrum') || query_text.toLowerCase().startsWith('sp-')) 
            effectiveTargetSource = 'spectrum_web_components';
          else if (query_text.toLowerCase().includes('express') || query_text.toLowerCase().includes('addon')) 
            effectiveTargetSource = 'express_sdk';
        }

        const searchResults = await githubService.searchFiles(query_text, effectiveTargetSource);
        if (searchResults.length > 0) {
          for (const searchResult of searchResults.slice(0, effectiveTargetSource === 'all' ? 2 : 3)) {
            const fileContent = await githubService.getFileContent(searchResult.path, searchResult.repo);
            if (fileContent) {
              const parsedItems = githubService.parseFileContentToMCPItems(fileContent);
              results.push(...parsedItems);
            }
          }
          const queryTermsForFilter = query_text.toLowerCase().split(" ").filter((t: string) => t.length > 2);
          results = results.filter(r => queryTermsForFilter.some((term: string) => 
            r.title.toLowerCase().includes(term) || 
            (r.tags && r.tags.some(tag => tag.includes(term)))
          ));
          if (results.length > 0) confidence_score = 0.7; else confidence_score = 0.35;
        } else {
          results.push({ 
            type: "no_match_github", 
            title: "No Files Found on GitHub", 
            content: `GitHub search found no direct file matches for '${query_text}'.`, 
            source_hint: "GitHub API Search", 
            tags: ["error"], 
            dataSource: 'unknown' 
          });
        }
      } catch (e: any) {
        console.error("Error during GitHub query processing:", e);
        results.push({ 
          type: "error_github", 
          title: "GitHub Query Error", 
          content: `An error occurred: ${e.message}`, 
          source_hint: "GitHub Service", 
          tags: ["error"], 
          dataSource: 'unknown' 
        });
      }
    } else { // local mode
      console.error(`Querying local knowledge base for: "${query_text}" (Target hint: ${target_source_hint || 'all'})`);
      if (LOCAL_KNOWLEDGE_BASE.length === 0) {
        results.push({ 
          type: "error_info", 
          title: "Local Knowledge Base Empty", 
          content: "Local KB is empty.", 
          source_hint: "Server Config", 
          tags: ["error", "kb"], 
          dataSource: 'unknown' 
        });
      } else {
        const query_lower = query_text.toLowerCase();
        const query_terms = query_lower.split(/\s+/).filter((term: string) => term.length > 1);
        
        let effectiveTargetSourceLocal: 'express_sdk' | 'spectrum_web_components' | undefined = 
          target_source_hint && target_source_hint !== 'all' ? target_source_hint : undefined;
          
        if (!effectiveTargetSourceLocal) {
          if (query_text.toLowerCase().includes('spectrum') || query_text.toLowerCase().startsWith('sp-')) 
            effectiveTargetSourceLocal = 'spectrum_web_components';
          else if (query_text.toLowerCase().includes('express') || query_text.toLowerCase().includes('addon')) 
            effectiveTargetSourceLocal = 'express_sdk';
        }

        const scoredResults = LOCAL_KNOWLEDGE_BASE
          .filter(item => !effectiveTargetSourceLocal || item.dataSource === effectiveTargetSourceLocal)
          .map(item => {
            let score = 0;
            const title_lower = item.title.toLowerCase();
            const content_lower = typeof item.content === 'string' ? item.content.toLowerCase() : '';
            query_terms.forEach((term: string) => {
              if (title_lower.includes(term)) score += 3;
              if (item.tags && item.tags.some(tag => tag.toLowerCase().includes(term))) score += 2;
              if (content_lower.includes(term)) score += 1;
            });
            if (item.parent_title && item.parent_title.toLowerCase().includes(query_lower)) score += 1;
            if (item.dataSource === effectiveTargetSourceLocal) score += 1;
            return { item, score };
          })
          .filter(scoredItem => scoredItem.score > 0)
          .sort((a, b) => b.score - a.score);
          
        results = scoredResults.slice(0, 10).map(sr => sr.item);
        if (results.length > 0) confidence_score = 0.8; else confidence_score = 0.3;
      }
    }

    if (results.length === 0 && !results.some(r => r.type.startsWith('error') || r.type.startsWith('no_match'))) {
      results.push({ 
        type: "no_match", 
        title: "Query Not Matched", 
        content: `No information found for '${query_text}' in ${currentKnowledgeMode} mode.`, 
        source_hint: currentKnowledgeMode, 
        tags: ["no_match"], 
        dataSource: 'unknown' 
      });
    }
    
    const outputResult: QueryDocumentationOutput = {
      query_received: query_text, 
      results: results.slice(0, 10),
      confidence_score: confidence_score, 
      mode_used: currentKnowledgeMode
    };

    // Format output for display
    const resultText = results.map(r => {
      return `\n## ${r.title}\n${r.content.substring(0, 300)}${r.content.length > 300 ? '...' : ''}\n`; 
    }).join('\n');

    return {
      structuredContent: outputResult as unknown as Record<string, unknown>,
      content: [
        {
          type: "text",
          text: `Found ${results.length} results for "${query_text}" in ${currentKnowledgeMode} mode:\n${resultText}`
        }
      ]
    };
  }
);

// Define Zod schemas for developer tools
const ScaffoldAddOnInputSchema = z.object({
  projectType: z.enum([
    'dialog-add-on', 
    'export-assets', 
    'import-images-local',
    'import-images-oauth', 
    'use-client-storage',
    'licensed-addon'
  ]).describe("Type of add-on project to scaffold"),
  projectName: z.string().describe("Name of the add-on project"),
  description: z.string().optional().describe("Description of the add-on project"),
  destination: z.string().optional().describe("Destination folder for the project"),
});

const GetCodeExampleInputSchema = z.object({
  feature: z.enum([
    'dialog-api',
    'export-assets',
    'import-local-images',
    'drag-and-drop',
    'oauth-authentication',
    'client-storage',
    'add-image-to-document',
    'add-video-to-document',
    'add-audio-to-document',
    'get-current-page',
    'get-document-info',
    'create-renditions'
  ]).describe("Feature to get code example for"),
  language: z.enum(['javascript', 'typescript', 'jsx', 'tsx']).optional().describe("Preferred language for the example"),
  framework: z.enum(['none', 'react', 'vanilla']).optional().describe("Preferred framework for the example"),
});

const ImplementFeatureInputSchema = z.object({
  feature: z.enum([
    'dialog-component',
    'export-functionality',
    'import-local-images',
    'import-oauth-images',
    'drag-and-drop',
    'qr-code-generator', 
    'client-storage',
    'authentication'
  ]).describe("Feature to implement in the add-on"),
  projectPath: z.string().describe("Path to the add-on project"),
  language: z.enum(['javascript', 'typescript', 'jsx', 'tsx']).optional().describe("Language used in the project"),
  framework: z.enum(['none', 'react', 'vanilla']).optional().describe("Framework used in the project"),
});

// Register Adobe Express Add-on Developer Tools
server.tool(
  "scaffold-addon-project",
  "Scaffold a new Adobe Express add-on project based on sample templates",
  ScaffoldAddOnInputSchema.shape,
  async ({ projectType, projectName, description, destination }) => {
    const descText = description || `An Adobe Express add-on for ${projectType}`;
    
    return {
      content: [
        {
          type: "text",
          text: `# Adobe Express Add-on: ${projectName}\n\n` +
                `I'll help you create a new Adobe Express add-on project of type "${projectType}".\n\n` +
                `## Project Structure\n\n` +
                `Your project will be scaffolded with the following structure based on the ${projectType} sample:\n\n` +
                `\`\`\`\n` +
                `${projectName}/\n` +
                `├── package.json     # Project dependencies and scripts\n` +
                `├── src/             # Source code\n` +
                `│   ├── index.html   # Main HTML file\n` +
                `│   ├── index.jsx    # Entry point \n` +
                `│   ├── components/  # React components (if applicable)\n` +
                `├── manifest.json    # Add-on manifest\n` +
                `\`\`\`\n\n` +
                `## Installation Instructions\n\n` +
                `1. Run \`npm install\` to install dependencies\n` +
                `2. Run \`npm run build\` to build the project\n` +
                `3. Run \`npm run start\` to start the development server\n\n` +
                `## Key Components\n\n` +
                getProjectTypeDescription(projectType),
        },
      ],
      structuredContent: {
        projectType,
        projectName,
        description: descText
      } 
    };
  },
);

server.tool(
  "get-code-example",
  "Get code examples for common Adobe Express add-on features",
  GetCodeExampleInputSchema.shape,
  async ({ feature, language, framework }) => {
    const usedLanguage = language || 'javascript';
    const usedFramework = framework || (feature.includes('dialog') ? 'react' : 'vanilla');
    
    return {
      content: [
        {
          type: "text",
          text: `# Code Example: ${formatFeatureName(feature)}\n\n` +
                `Here's an example of how to implement ${formatFeatureName(feature)} in an Adobe Express add-on` + 
                `${usedFramework !== 'none' ? ` using ${usedFramework}` : ''}` +
                `:\n\n` +
                '```' + usedLanguage + '\n' +
                getCodeExample(feature, usedLanguage, usedFramework) +
                '\n```\n\n' +
                `## Usage Explanation\n\n${getFeatureExplanation(feature)}`,
        },
      ],
    };
  },
);

server.tool(
  "implement-feature",
  "Get implementation guidance for adding a feature to an Adobe Express add-on",
  ImplementFeatureInputSchema.shape,
  async ({ feature, projectPath, language, framework }) => {
    const usedLanguage = language || 'javascript';
    const usedFramework = framework || (feature.includes('dialog') ? 'react' : 'vanilla');
    
    return {
      content: [
        {
          type: "text",
          text: `# Implementation Guide: ${formatFeatureName(feature)}\n\n` +
                `I'll help you implement ${formatFeatureName(feature)} in your Adobe Express add-on project.\n\n` +
                `## Implementation Steps\n\n${getImplementationSteps(feature, usedLanguage, usedFramework)}\n\n` +
                `## Required Dependencies\n\n${getRequiredDependencies(feature)}\n\n` +
                `## Key Components\n\n${getFeatureComponents(feature, usedLanguage, usedFramework)}`
        },
      ],
    };
  },
);

// Helper functions for the tools
function getProjectTypeDescription(projectType: string): string {
  switch (projectType) {
    case 'dialog-add-on':
      return "This project demonstrates how to use the Dialog API to create various dialog types in Adobe Express.\n" +
             "- Confirmation Dialogs\n" +
             "- Information Dialogs\n" +
             "- Input Dialogs\n" +
             "- Error Dialogs";
    
    case 'export-assets':
      return "This project demonstrates how to export assets from an Adobe Express document.\n" +
             "- Image export (PNG, JPG)\n" +
             "- Export with different quality settings\n" +
             "- Export current page or entire document\n" +
             "- Handle downloaded assets";
             
    case 'import-images-local':
      return "This project demonstrates how to import local images into an Adobe Express document.\n" +
             "- File selection UI\n" +
             "- Drag and drop support\n" +
             "- Image preview\n" +
             "- Add images to document";
             
    case 'import-images-oauth':
      return "This project demonstrates how to import images from external services using OAuth.\n" +
             "- OAuth authentication flow\n" +
             "- Connect to external services (e.g., Dropbox)\n" +
             "- Browse external resources\n" +
             "- Import external images to document";
             
    case 'use-client-storage':
      return "This project demonstrates how to use client storage to persist data.\n" +
             "- Store user preferences\n" +
             "- Save and retrieve data\n" +
             "- Handle storage limits\n" +
             "- Session persistence";
             
    case 'licensed-addon':
      return "This project demonstrates how to implement licensing in an Adobe Express add-on.\n" +
             "- License verification\n" +
             "- Feature gating\n" +
             "- Free/premium functionality\n" +
             "- License management";
             
    default:
      return "A basic Adobe Express add-on project with standard structure and configuration.";
  }
}

function formatFeatureName(feature: string): string {
  // Convert kebab-case to Title Case with spaces
  return feature
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getCodeExample(feature: string, language: string, framework: string): string {
  switch (feature) {
    case 'dialog-api':
      return `// Example of using Adobe Express Dialog API
import AddOnSdk from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

// Wait for SDK to be ready
AddOnSdk.ready.then(async () => {
  // Dialog API payload
  const dialogPayload = {
    title: "Example Dialog",
    description: ["This is an example of using the Dialog API."],
    buttonLabels: {
      primary: "OK",
      secondary: "Cancel"
    },
    variant: "confirmation"
  };

  try {
    // Show modal dialog and wait for user response
    const result = await AddOnSdk.app.showModalDialog(dialogPayload);
    console.log("Dialog result:", result);
  } catch (error) {
    console.error("Error showing dialog:", error);
  }
});`;

    case 'export-assets':
      return `// Example of exporting assets from an Adobe Express document
import AddOnSdk from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

// Wait for SDK to be ready
AddOnSdk.ready.then(async () => {
  try {
    // Create renditions of the current page
    const renditions = await AddOnSdk.app.document.createRenditions({
      range: "currentPage", // or "entireDocument"
      format: "image/png",   // or "image/jpeg"
      backgroundColor: 0xFFFFFF,
      quality: 0.8
    });

    // Process the renditions
    for (const rendition of renditions) {
      // Create object URL for download
      const objectUrl = URL.createObjectURL(rendition.blob);
      
      // Create download link
      const downloadLink = document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.download = "exported-image.png";
      downloadLink.click();
      
      // Clean up
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    console.error("Export failed:", error);
  }
});`;

    case 'import-local-images':
      return `// Example of importing local images into Adobe Express
import AddOnSdk from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

// Wait for SDK to be ready
AddOnSdk.ready.then(async () => {
  // Create file input element
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  
  // Handle file selection
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        // Read file as blob
        const blob = await file.arrayBuffer().then(
          buffer => new Blob([buffer], { type: file.type })
        );
        
        // Add image to document
        await AddOnSdk.app.document.addImage(blob);
      } catch (error) {
        console.error("Failed to import image:", error);
      }
    }
  });
  
  // Trigger file selection dialog
  fileInput.click();
});`;

    case 'drag-and-drop':
      return `// Example of enabling drag and drop for an image element
import AddOnSdk from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

// Wait for SDK to be ready
AddOnSdk.ready.then(async () => {
  // Get image element
  const imageElement = document.getElementById("draggable-image");
  
  // Enable drag to document functionality
  AddOnSdk.app.enableDragToDocument(imageElement, {
    // Preview callback returns URL for drag preview
    previewCallback: (element) => {
      return new URL(element.src);
    },
    // Completion callback returns blob to be added to document
    completionCallback: async (element) => {
      // Fetch the image as a blob
      const blob = await fetch(element.src).then(r => r.blob());
      return [{ blob }];
    }
  });
  
  // Optional event handlers
  AddOnSdk.app.on("dragstart", (eventData) => {
    console.log("Drag started for:", eventData.element.id);
  });
  
  AddOnSdk.app.on("dragend", (eventData) => {
    if (!eventData.dropCancelled) {
      console.log("Drag completed for:", eventData.element.id);
    } else {
      console.log("Drag cancelled for:", eventData.element.id);
    }
  });
});`;

    case 'oauth-authentication':
      return `// Example of OAuth authentication in Adobe Express add-on
import AddOnSdk from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";

// OAuth configuration
const oauthConfig = {
  clientId: "YOUR_CLIENT_ID", // Replace with your OAuth client ID
  scopes: ["files.metadata.read", "files.content.read"],
  redirectUri: "https://new.express.adobe.com/static/oauth-redirect.html"
};

// Wait for SDK to be ready
AddOnSdk.ready.then(async () => {
  // Check if access token exists in client storage
  let accessToken = await AddOnSdk.app.clientStorage.getItem("access_token");
  
  if (!accessToken) {
    try {
      // Initiate OAuth flow if no token is found
      const authResult = await AddOnSdk.app.oauth.authorize(oauthConfig);
      accessToken = authResult.access_token;
      
      // Store token in client storage
      await AddOnSdk.app.clientStorage.setItem("access_token", accessToken);
    } catch (error) {
      console.error("OAuth authentication failed:", error);
    }
  }
  
  // Use the access token to make API calls
  if (accessToken) {
    try {
      // Example API call using the token
      const response = await fetch("https://api.example.com/resources", {
        headers: {
          "Authorization": \`Bearer \${accessToken}\`
        }
      });
      const data = await response.json();
      console.log("API response:", data);
    } catch (error) {
      console.error("API call failed:", error);
    }
  }
});`;

    default:
      return `// Example code for ${feature}\nimport AddOnSdk from "https://new.express.adobe.com/static/add-on-sdk/sdk.js";\n\n// Implementation coming soon`;
  }
}

function getFeatureExplanation(feature: string): string {
  switch (feature) {
    case 'dialog-api':
      return "The Adobe Express Dialog API allows you to create various types of dialogs:\n\n" +
             "1. **Confirmation Dialogs**: Ask the user to confirm an action with OK/Cancel options\n" +
             "2. **Information Dialogs**: Display information to the user\n" +
             "3. **Input Dialogs**: Collect input from the user\n" +
             "4. **Error Dialogs**: Display error messages\n\n" +
             "The dialog result includes information about which button the user clicked.";
    
    case 'export-assets':
      return "The Export Assets functionality allows users to export content from an Adobe Express document in various formats:\n\n" +
             "1. You can specify the export format (PNG, JPG)\n" +
             "2. You can choose to export just the current page or the entire document\n" +
             "3. Quality settings allow control over the output file size and quality\n" +
             "4. The exported assets are returned as Blob objects that can be saved or processed";
    
    case 'import-local-images':
      return "The Import Local Images functionality allows users to add images from their local file system to the document:\n\n" +
             "1. You can create a file input or drag-drop area\n" +
             "2. Selected files can be previewed before adding to the document\n" +
             "3. Images are converted to blobs before being added to the document\n" +
             "4. Multiple images can be imported in sequence";
             
    case 'drag-and-drop':
      return "The Drag and Drop functionality makes it easy for users to add content to their document by dragging elements from your add-on:\n\n" +
             "1. You can enable drag functionality on any DOM element\n" +
             "2. The previewCallback function returns a URL for the drag preview\n" +
             "3. The completionCallback function returns the data (blob) to be added to the document\n" +
             "4. You can listen to drag events (dragstart, dragend) to modify your UI accordingly";
             
    default: 
      return `This feature enhances your Adobe Express add-on by providing ${formatFeatureName(feature)} functionality.`;
  }
}

function getImplementationSteps(feature: string, language: string, framework: string): string {
  switch (feature) {
    case 'dialog-component':
      return "1. Install necessary dependencies for React and Spectrum Web Components\n" +
             "2. Create a DialogComponent.jsx file in your components folder\n" +
             "3. Implement the dialog component with various options and variants\n" +
             "4. Add a method to show the dialog via the Adobe Express SDK\n" +
             "5. Connect the component to your main application";
    
    case 'export-functionality':
      return "1. Create an ExportComponent.jsx file in your components folder\n" +
             "2. Add UI controls for format selection (PNG/JPG)\n" +
             "3. Add UI controls for range (current page/entire document)\n" +
             "4. Add UI controls for quality settings\n" +
             "5. Implement export function using Adobe Express Document API\n" +
             "6. Handle the export result with proper UI feedback";
    
    case 'import-local-images':
      return "1. Create an ImportComponent.jsx file in your components folder\n" +
             "2. Implement a file input control for selecting images\n" +
             "3. Add a preview area for selected images\n" +
             "4. Implement the image import functionality using the Document API\n" +
             "5. Add error handling and user feedback";
    
    default:
      return `Implementation steps for ${formatFeatureName(feature)} will be provided based on your specific project configuration.`;
  }
}

function getRequiredDependencies(feature: string): string {
  switch (feature) {
    case 'dialog-component':
      return "```json\n{\n  \"dependencies\": {\n    \"@spectrum-web-components/button\": \"^0.17.0\",\n    \"@spectrum-web-components/theme\": \"^0.14.0\",\n    \"@spectrum-web-components/field-label\": \"^0.9.0\",\n    \"@spectrum-web-components/textfield\": \"^0.12.0\",\n    \"react\": \"^17.0.2\",\n    \"react-dom\": \"^17.0.2\"\n  }\n}\n```";
    
    case 'export-functionality':
      return "```json\n{\n  \"dependencies\": {\n    \"@spectrum-web-components/button\": \"^0.17.0\",\n    \"@spectrum-web-components/theme\": \"^0.14.0\",\n    \"@spectrum-web-components/field-label\": \"^0.9.0\",\n    \"@spectrum-web-components/picker\": \"^0.12.0\",\n    \"@spectrum-web-components/menu\": \"^0.9.0\",\n    \"@spectrum-web-components/slider\": \"^0.11.0\"\n  }\n}\n```";
    
    case 'import-local-images':
      return "```json\n{\n  \"dependencies\": {\n    \"@spectrum-web-components/button\": \"^0.17.0\",\n    \"@spectrum-web-components/theme\": \"^0.14.0\",\n    \"@spectrum-web-components/field-label\": \"^0.9.0\"\n  }\n}\n```";
    
    default:
      return "Standard Adobe Express Add-on dependencies plus any specific packages required for this feature.";
  }
}

function getFeatureComponents(feature: string, language: string, framework: string): string {
  switch (feature) {
    case 'dialog-component':
      return "1. **DialogPayload** - Configuration object for the dialog\n" +
             "2. **DialogVariants** - Different types of dialogs (confirmation, information, input, error)\n" +
             "3. **ButtonLabels** - Custom labels for dialog buttons\n" +
             "4. **DialogResult** - Object returned when dialog is closed";
    
    case 'export-functionality':
      return "1. **Format Selector** - UI for selecting export format\n" +
             "2. **Range Selector** - UI for selecting what to export\n" +
             "3. **Quality Slider** - UI for adjusting quality settings\n" +
             "4. **Export Button** - Triggers the export process\n" +
             "5. **Preview Component** - Shows a preview of what will be exported";
    
    default:
      return `Key components for ${formatFeatureName(feature)} will be provided based on your specific requirements.`;
  }
}
