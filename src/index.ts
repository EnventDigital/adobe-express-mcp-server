import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server instance
const server = new McpServer({
  name: "adobe-express",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register Adobe Express tools
server.tool(
  "generate-graphic",
  "Generate an image or graphic using Adobe Express templates",
  {
    prompt: z.string().describe("Description of the graphic to be generated"),
    style: z.string().optional().describe("Visual style for the graphic (e.g., minimalist, vibrant, corporate)"),
    dimensions: z.string().optional().describe("Dimensions of the graphic (e.g., '1080x1080', 'instagram-post', 'facebook-cover')"),
  },
  async ({ prompt, style, dimensions }) => {
    // In a real implementation, this would call Adobe Express APIs
    const styleText = style ? `in ${style} style` : "";
    const dimensionsText = dimensions ? `with dimensions ${dimensions}` : "";
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully generated graphic based on: "${prompt}" ${styleText} ${dimensionsText}.\n\nImage would be returned here in a real implementation.`,
        },
      ],
    };
  },
);

server.tool(
  "edit-image",
  "Edit an existing image using Adobe Express tools",
  {
    imageUrl: z.string().describe("URL or ID of the image to be edited"),
    operation: z.string().describe("Operation to perform (e.g., 'remove-background', 'resize', 'add-text')"),
    parameters: z.record(z.any()).optional().describe("Additional parameters for the operation"),
  },
  async ({ imageUrl, operation, parameters }) => {
    // In a real implementation, this would call Adobe Express APIs
    const paramsText = parameters ? `with parameters: ${JSON.stringify(parameters)}` : "";
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully applied operation "${operation}" on image at ${imageUrl} ${paramsText}.\n\nEdited image would be returned here in a real implementation.`,
        },
      ],
    };
  },
);

server.tool(
  "list-templates",
  "List available Adobe Express templates",
  {
    category: z.string().optional().describe("Category of templates (e.g., 'social-media', 'presentation', 'print')"),
    query: z.string().optional().describe("Search query to filter templates"),
  },
  async ({ category, query }) => {
    // In a real implementation, this would call Adobe Express APIs to fetch templates
    const templates = [
      { id: "t1", name: "Instagram Story", category: "social-media" },
      { id: "t2", name: "Business Card", category: "print" },
      { id: "t3", name: "Presentation Slide", category: "presentation" },
      { id: "t4", name: "Facebook Post", category: "social-media" },
      { id: "t5", name: "Resume Template", category: "print" },
    ];
    
    // Filter by category and query if provided
    let filtered = templates;
    if (category) {
      filtered = filtered.filter(t => t.category === category);
    }
    if (query) {
      filtered = filtered.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));
    }
    
    const templateList = filtered.map(t => `- ${t.name} (${t.id})`).join('\n');
    
    return {
      content: [
        {
          type: "text",
          text: `Available Templates:\n\n${templateList}`,
        },
      ],
    };
  },
);

server.tool(
  "create-document",
  "Create a document or presentation using Adobe Express",
  {
    title: z.string().describe("Title of the document"),
    type: z.enum(["presentation", "flyer", "resume", "newsletter", "report"]).describe("Type of document to create"),
    content: z.string().describe("Content outline or description for the document"),
    style: z.string().optional().describe("Visual style for the document"),
  },
  async ({ title, type, content, style }) => {
    // In a real implementation, this would call Adobe Express APIs
    const styleText = style ? `using ${style} style` : "";
    
    return {
      content: [
        {
          type: "text",
          text: `Successfully created a new ${type} titled "${title}" ${styleText}.\n\nContent outline: ${content}\n\nDocument would be returned here in a real implementation.`,
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Adobe Express MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
