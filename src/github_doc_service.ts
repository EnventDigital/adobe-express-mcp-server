import { Octokit } from '@octokit/rest';
import matter from 'gray-matter';
import { marked, Token } from 'marked';
import path from 'path';
import { z } from 'zod';

// --- Zod Schemas for GitHub API Responses ---
const GitHubAPISearchItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  url: z.string().url(),
  html_url: z.string().url(),
  score: z.number().optional(),
});

const GitHubAPISearchResponseSchema = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(GitHubAPISearchItemSchema),
});

const GitHubAPIRepoContentFileSchema = z.object({
  type: z.literal('file'),
  encoding: z.literal('base64'),
  size: z.number(),
  name: z.string(),
  path: z.string(),
  content: z.string(),
  sha: z.string(),
  url: z.string().url(),
  git_url: z.string().url().nullable(),
  html_url: z.string().url().nullable(),
  download_url: z.string().url().nullable(),
});

const GitHubGetContentFileResponseDataSchema = GitHubAPIRepoContentFileSchema;

// --- Configuration ---
const GITHUB_TOKEN = process.env.MCP_GITHUB_PAT || undefined;
const EXPRESS_DOCS_REPO_OWNER = 'AdobeDocs';
const EXPRESS_DOCS_REPO_NAME = 'express-add-ons-docs';
const EXPRESS_DOCS_REPO_BASE_PATH = 'src/pages';
const SWC_REPO_OWNER = 'adobe';
const SWC_REPO_NAME = 'spectrum-web-components';
const SWC_DOCS_PACKAGES_PATH = 'packages';
const SAMPLES_REPO_OWNER = 'adobe-ccwebext';
const SAMPLES_REPO_NAME = 'adobe-express-add-on-samples';
const SAMPLES_BASE_PATH = 'samples';

// Adobe Express add-on samples configuration
const EXPRESS_SAMPLES_REPO_OWNER = 'AdobeDocs';
const EXPRESS_SAMPLES_REPO_NAME = 'express-add-ons-samples';
const EXPRESS_SAMPLES_BASE_PATH = 'samples';

// Create Octokit instance for GitHub API interaction
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
  userAgent: 'AdobeMCPAssistant/v1.0.0',
});

// --- Interfaces ---
export interface MCPResultItem {
  type: string;
  title: string;
  content: string;
  raw_markdown_content?: string;
  source_hint: string;
  tags?: string[];
  language?: string;
  frontmatter?: Record<string, any>;
  parent_title?: string;
  dataSource: 'express_sdk' | 'spectrum_web_components' | 'code_sample' | 'unknown';
}

export interface GitHubFileSearchResult {
  name: string;
  path: string;
  sha: string;
  url: string;
  html_url: string;
  score?: number;
  repo: 'express_sdk' | 'spectrum_web_components';
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  html_url: string;
  content: string;
  frontmatter: Record<string, any>;
  markdown_body: string;
  dataSource: 'express_sdk' | 'spectrum_web_components';
}

export interface CodeSampleResult {
  code: string;
  language: string;
  filePath: string;
  html_url: string;
  feature: string;
  framework?: string;
}

// --- Helper Functions ---
function tokensToMarkdown(tokensArray: Token[]): string {
  return tokensArray.map(token => token.raw).join('');
}

function tokensToPlainText(tokensArray: Token[]): string {
  if (!tokensArray || tokensArray.length === 0) return '';
  const markdownFromTokens = tokensToMarkdown(tokensArray);
  
  const plainTextRenderer = new marked.Renderer();
  plainTextRenderer.heading = (text) => `${text}\n\n`;
  plainTextRenderer.paragraph = (text) => `${text}\n`;
  plainTextRenderer.list = (body) => `${body}\n`;
  plainTextRenderer.listitem = (text) => `- ${text}\n`;
  plainTextRenderer.code = (code, language) => `\n[Code Block (${language || 'unknown'})]:\n${code}\n\n`;
  plainTextRenderer.blockquote = (quote) => `> ${quote}\n`;
  plainTextRenderer.html = () => '';
  plainTextRenderer.link = (_href, _title, text) => text;
  plainTextRenderer.image = (_href, _title, text) => `[Image: ${text}]`;
  plainTextRenderer.strong = (text) => text;
  plainTextRenderer.em = (text) => text;
  plainTextRenderer.codespan = (text) => text;
  plainTextRenderer.br = () => '\n';
  plainTextRenderer.hr = () => '\n---\n';
  plainTextRenderer.table = (header, body) => `${header}\n${body}\n`;
  plainTextRenderer.tablerow = (content) => `${content}\n`;
  plainTextRenderer.tablecell = (content) => `${content} | `;
  
  // Call marked.parse with explicit async:false option to ensure string return type
  let plainText = marked.parse(markdownFromTokens, { 
    renderer: plainTextRenderer,
    async: false 
  }) as string;
  
  plainText = plainText.replace(/\n\s*\n/g, '\n\n').trim();
  return plainText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function extractTagsFromPath(filePathWithinBase: string, dataSource: 'express_sdk' | 'spectrum_web_components'): string[] {
  const parts = filePathWithinBase.split(path.sep).map(part => part.toLowerCase());
  const filename = path.basename(filePathWithinBase, path.extname(filePathWithinBase)).toLowerCase();
  let tags = parts.slice(0, -1).concat(filename === 'index' ? [] : [filename]);
  
  if (dataSource === 'spectrum_web_components') {
    // For spectrum web components, the structure is packages/component-name/README.md
    // We want to extract the component name as the primary tag
    if (filename === 'readme' && parts.length >= 2 && parts[0] === 'packages') {
      // For packages/tabs/README.md -> extract 'tabs'
      tags = [parts[1]]; // The component name is the second part
    } else {
      // For other files, filter out structural directories and extract meaningful parts
      tags = parts.filter(p => p !== 'packages' && p !== 'stories' && p !== 'src' && p !== 'docs' && p !== 'test');
      
      // Add the component name (first part after packages) if not already included
      if (parts.length >= 2 && parts[0] === 'packages' && !tags.includes(parts[1])) {
        tags.unshift(parts[1]); // Add component name as first tag
      }
      
      // Add filename if it's meaningful
      if (filename !== 'index' && filename !== 'readme' && !tags.includes(filename)) {
        tags.push(filename);
      }
    }
  }
  return tags.filter(tag => tag && !['src', 'pages', 'index', ''].includes(tag) && !tag.startsWith('_'));
}

export class GitHubDocService {
  // Feature to sample mapping for Adobe Express add-on samples
private featureToSamplePathMap: Record<string, { path: string; framework: string }> = {
    'dialog-api': { 
        path: 'dialog-add-on/src/components/App.jsx',
        framework: 'react'
    },
    'export-assets': { 
        path: 'export-assets-from-document/src/components/ExportContainer.jsx',
        framework: 'react'
    },
    'import-local-images': { 
        path: 'import-images-from-local/src/index.js',
        framework: 'vanilla'
    },
    'drag-and-drop': { 
        path: 'import-images-from-local/src/index.js',
        framework: 'vanilla'
    },
    'oauth-authentication': { 
        path: 'import-images-using-oauth/src/components/Assets.jsx',
        framework: 'react'
    },
    'client-storage': { 
        path: 'use-client-storage/src/index.ts',
        framework: 'vanilla'
    },
    'add-image-to-document': { 
        path: 'import-images-from-local/src/index.js',
        framework: 'vanilla'
    }
};

  constructor() {
    if (!GITHUB_TOKEN) {
      console.error("GitHubDocService: MCP_GITHUB_PAT environment variable not set. GitHub API requests will be unauthenticated and heavily rate-limited.");
    } else {
      console.error("GitHubDocService initialized with PAT.");
    }
  }

  async searchFiles(query: string, targetSource: 'express_sdk' | 'spectrum_web_components' | 'all' = 'all'): Promise<GitHubFileSearchResult[]> {
    const results: GitHubFileSearchResult[] = [];
    const searchPromises: Promise<{validatedData: z.infer<typeof GitHubAPISearchResponseSchema> | null, source: 'express_sdk' | 'spectrum_web_components'}>[] = [];

    console.error(`GitHubDocService: Searching for "${query}" in target: ${targetSource}`);

    if (targetSource === 'all' || targetSource === 'express_sdk') {
      const express_q = `${query} repo:${EXPRESS_DOCS_REPO_OWNER}/${EXPRESS_DOCS_REPO_NAME} path:${EXPRESS_DOCS_REPO_BASE_PATH} extension:md extension:mdx`;
      const expressPromise = octokit.search.code({ q: express_q, per_page: (targetSource === 'all' ? 2 : 5) })
        .then(response => {
          const validation = GitHubAPISearchResponseSchema.safeParse(response.data);
          if (!validation.success) {
            console.error("GitHubDocService: Invalid GitHub API search response (Express SDK):", validation.error.format());
            return { validatedData: null, source: 'express_sdk' as const };
          }
          return { validatedData: validation.data, source: 'express_sdk' as const };
        })
        .catch(e => { 
          console.error("Error in Express SDK search API call:", e.message); 
          return { validatedData: null, source: 'express_sdk' as const }; 
        });
      
      searchPromises.push(expressPromise);
    }
    
    if (targetSource === 'all' || targetSource === 'spectrum_web_components') {
      const swc_q = `${query} repo:${SWC_REPO_OWNER}/${SWC_REPO_NAME} path:${SWC_DOCS_PACKAGES_PATH} language:markdown`;
      const swcPromise = octokit.search.code({ q: swc_q, per_page: (targetSource === 'all' ? 2 : 5) })
        .then(response => {
          const validation = GitHubAPISearchResponseSchema.safeParse(response.data);
          if (!validation.success) {
            console.error("GitHubDocService: Invalid GitHub API search response (Spectrum WC):", validation.error.format());
            return { validatedData: null, source: 'spectrum_web_components' as const };
          }
          return { validatedData: validation.data, source: 'spectrum_web_components' as const };
        })
        .catch(e => { 
          console.error("Error in Spectrum WC search API call:", e.message); 
          return { validatedData: null, source: 'spectrum_web_components' as const }; 
        });
        
      searchPromises.push(swcPromise);
    }

    try {
      const responses = await Promise.all(searchPromises);
      for (const {validatedData, source} of responses) {
        if (validatedData && validatedData.items) {
          results.push(...validatedData.items.map(item => ({
            name: item.name,
            path: item.path,
            sha: item.sha,
            url: item.url,
            html_url: item.html_url,
            score: item.score,
            repo: source,
          })));
        }
      }
    } catch (error: any) {
      console.error(`GitHubDocService - General error during file search for query "${query}":`, error.message);
    }
    return results.sort((a,b) => (b.score || 0) - (a.score || 0));
  }

  async getFileContent(pathFromRepoRoot: string, dataSource: 'express_sdk' | 'spectrum_web_components'): Promise<GitHubFileContent | null> {
    const owner = dataSource === 'express_sdk' ? EXPRESS_DOCS_REPO_OWNER : SWC_REPO_OWNER;
    const repo = dataSource === 'express_sdk' ? EXPRESS_DOCS_REPO_NAME : SWC_REPO_NAME;
    try {
      console.error(`GitHubDocService - Fetching content for: ${owner}/${repo}/${pathFromRepoRoot}`);
      const response = await octokit.repos.getContent({ owner, repo, path: pathFromRepoRoot });

      const validation = GitHubGetContentFileResponseDataSchema.safeParse(response.data);
      if (!validation.success) {
        console.error(`GitHubDocService - Path ${pathFromRepoRoot} in ${owner}/${repo} did not return valid file content. Zod errors:`, validation.error.format());
        return null;
      }
      
      const validatedFileData = validation.data;

      const decodedContent = Buffer.from(validatedFileData.content, 'base64').toString('utf-8');
      const { data: frontmatter, content: markdown_body } = matter(decodedContent);
      
      return {
        name: validatedFileData.name,
        path: validatedFileData.path,
        sha: validatedFileData.sha,
        html_url: validatedFileData.html_url || '',
        content: decodedContent,
        frontmatter,
        markdown_body,
        dataSource: dataSource
      };
      
    } catch (error: any) {
      console.error(`GitHubDocService - Error fetching file content for "${pathFromRepoRoot}" from ${owner}/${repo}:`, error.message);
      if (error.status === 404) console.error(`File not found at repo path: ${pathFromRepoRoot}`);
      return null;
    }
  }

  parseFileContentToMCPItems(fileContent: GitHubFileContent): MCPResultItem[] {
    const results: MCPResultItem[] = [];
    if (!fileContent) return results;

    const { frontmatter, markdown_body, html_url, path: fullPathFromRepoRoot, dataSource } = fileContent;
    
    const repoBasePathForTags = dataSource === 'express_sdk' ? EXPRESS_DOCS_REPO_BASE_PATH : SWC_DOCS_PACKAGES_PATH;
    let pathWithinRelevantBase = fullPathFromRepoRoot;
    if (fullPathFromRepoRoot.startsWith(repoBasePathForTags)) {
      pathWithinRelevantBase = path.relative(repoBasePathForTags, fullPathFromRepoRoot).replace(/\\/g, '/');
    }

    const baseTitle = frontmatter.title || frontmatter.name || path.basename(fullPathFromRepoRoot, path.extname(fullPathFromRepoRoot));
    const baseTags = frontmatter.tags || extractTagsFromPath(pathWithinRelevantBase, dataSource);

    const tokens = marked.lexer(markdown_body);
    let firstH2Index = tokens.findIndex(token => token.type === 'heading' && token.depth === 2);
    
    const treatAsSinglePage = (dataSource === 'spectrum_web_components' && path.basename(fullPathFromRepoRoot).toLowerCase() === 'readme.md');

    if (firstH2Index === -1 || path.basename(fullPathFromRepoRoot).toLowerCase() === 'index.md' || treatAsSinglePage) {
      const mainContentText = tokensToPlainText(tokens);
      if (mainContentText.trim()) {
        results.push({
          type: frontmatter.type || (treatAsSinglePage ? 'spectrum_component_overview' : (path.basename(fullPathFromRepoRoot).toLowerCase() === 'index.md' ? 'category_overview' : 'documentation_page')),
          title: baseTitle,
          content: mainContentText,
          raw_markdown_content: markdown_body,
          source_hint: html_url,
          tags: Array.isArray(baseTags) ? baseTags : [String(baseTags)],
          frontmatter: frontmatter,
          parent_title: baseTitle,
          dataSource: fileContent.dataSource,
        });
      }
    } else { 
      const overviewTokens = tokens.slice(0, firstH2Index);
      const overviewContentText = tokensToPlainText(overviewTokens);
      if (overviewContentText.trim()) {
        results.push({
          type: frontmatter.type || 'page_overview',
          title: `${baseTitle} - Overview`,
          content: overviewContentText,
          raw_markdown_content: tokensToMarkdown(overviewTokens),
          source_hint: html_url,
          tags: Array.isArray(baseTags) ? [...baseTags, "overview"] : [String(baseTags), "overview"],
          frontmatter: frontmatter,
          parent_title: baseTitle,
          dataSource: fileContent.dataSource,
        });
      }

      let currentSectionTokens: Token[] = [];
      let currentSectionTitle = '';
      let sectionType = 'documentation_section';

      for (let i = firstH2Index; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'heading' && (token.depth === 2 || token.depth === 3)) {
          if (currentSectionTokens.length > 0 && currentSectionTitle) {
            const sectionContent = tokensToPlainText(currentSectionTokens);
            if (sectionContent.trim()) {
              results.push({
                type: sectionType, 
                title: `${baseTitle} - ${currentSectionTitle}`, 
                content: sectionContent,
                raw_markdown_content: tokensToMarkdown(currentSectionTokens), 
                source_hint: html_url,
                tags: Array.isArray(baseTags) ? [...baseTags, ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))] : [String(baseTags), ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))],
                frontmatter: frontmatter, 
                parent_title: baseTitle, 
                dataSource: fileContent.dataSource,
              });
            }
          }
          currentSectionTitle = token.text.replace(/`/g, '');
          currentSectionTokens = [token]; 
          sectionType = token.depth === 2 ? 'major_section' : 'minor_section';
          if (token.depth === 2) {
            if (/\b(methods?|functions?)\b/i.test(currentSectionTitle)) sectionType = 'class_methods_group';
            else if (/\b(properties?|attributes?|fields?|api)\b/i.test(currentSectionTitle)) sectionType = 'class_properties_group';
            else if (/\b(events?)\b/i.test(currentSectionTitle)) sectionType = 'class_events_group';
            else if (/\b(example?s|usage)\b/i.test(currentSectionTitle)) sectionType = 'examples_section';
          } else { 
            if (/\w+\s*\(.*\)/.test(currentSectionTitle)) sectionType = 'class_method_detail';
            else if (/^[a-zA-Z_][\w\.]*(\s*:.*)?$/.test(currentSectionTitle.split(/\s|:/)[0])) sectionType = 'class_property_detail';
          }
        } else { 
          currentSectionTokens.push(token);
        }
      }
      
      if (currentSectionTokens.length > 0 && currentSectionTitle) {
        const sectionContent = tokensToPlainText(currentSectionTokens);
        if (sectionContent.trim()) {
          results.push({
            type: sectionType, 
            title: `${baseTitle} - ${currentSectionTitle}`, 
            content: sectionContent,
            raw_markdown_content: tokensToMarkdown(currentSectionTokens), 
            source_hint: html_url,
            tags: Array.isArray(baseTags) ? [...baseTags, ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))] : [String(baseTags), ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))],
            frontmatter: frontmatter, 
            parent_title: baseTitle, 
            dataSource: fileContent.dataSource,
          });
        }
      }
      
      if (results.length === 0 && tokens.length > 0) { 
        const fallbackContent = tokensToPlainText(tokens);
        if (fallbackContent.trim()) {
          results.push({
            type: frontmatter.type || 'documentation_page', 
            title: baseTitle, 
            content: fallbackContent,
            raw_markdown_content: markdown_body, 
            source_hint: html_url,
            tags: Array.isArray(baseTags) ? baseTags : [String(baseTags)],
            frontmatter: frontmatter, 
            parent_title: baseTitle, 
            dataSource: fileContent.dataSource,
          });
        }
      }
    }
    
    return results.filter(item => item.content.trim() !== '');
  }

  /**
   * Get code sample for a specific feature from GitHub
   * @param feature Feature name to get code sample for
   * @param language Preferred language for the sample
   * @param framework Preferred framework for the sample
   * @returns Code sample result or null if not found
   */
  async getCodeSample(feature: string, language?: string, framework?: string): Promise<CodeSampleResult | null> {
    if (!GITHUB_TOKEN) {
      console.error("GitHubDocService: GitHub token not available for code sample fetch");
      return null;
    }

    // Check if we have a mapping for this feature
    const sampleInfo = this.featureToSamplePathMap[feature as keyof typeof this.featureToSamplePathMap];
    if (!sampleInfo) {
      console.error(`GitHubDocService: No sample mapping found for feature '${feature}'`);
      return null;
    }

    try {
      const filePath = `${SAMPLES_BASE_PATH}/${sampleInfo.path}`;
      console.error(`GitHubDocService: Fetching code sample for '${feature}' from path: ${filePath}`);
      
      const response = await octokit.repos.getContent({
        owner: SAMPLES_REPO_OWNER,
        repo: SAMPLES_REPO_NAME,
        path: filePath
      });

      const validation = GitHubAPIRepoContentFileSchema.safeParse(response.data);
      if (!validation.success) {
        console.error(`GitHubDocService - Sample file at ${filePath} did not return valid file content`);
        return null;
      }

      const validatedFileData = validation.data;
      const decodedContent = Buffer.from(validatedFileData.content, 'base64').toString('utf-8');
      
      // Extract the relevant code snippet from the file
      // This is a simple extraction example, could be more sophisticated
      const extractedCode = this.extractRelevantCodeForFeature(decodedContent, feature);
      
      return {
        code: extractedCode,
        language: language || 'javascript',
        filePath: filePath,
        html_url: validatedFileData.html_url || '',
        feature: feature,
        framework: sampleInfo.framework
      };
    } catch (error: any) {
      console.error(`GitHubDocService: Error fetching code sample for '${feature}':`, error.message);
      return null;
    }
  }

  /**
   * Extract the most relevant code snippet for a given feature
   * @param fullCode Full source code content
   * @param feature Feature to extract code for
   * @returns Extracted code snippet
   */
  private extractRelevantCodeForFeature(fullCode: string, feature: string): string {
    // This could be more sophisticated based on specific features
    // For now, we'll use some heuristics to extract relevant parts

    // Map features to regex patterns or keywords to look for
    const featureKeywordMap: Record<string, string[]> = {
      'dialog-api': ['showModalDialog', 'dialog', 'alert', 'confirm'],
      'export-assets': ['createRenditions', 'export', 'download'],
      'import-local-images': ['addImage', 'importImage', 'fileInput'],
      'drag-and-drop': ['enableDragToDocument', 'dragstart', 'dragend'],
      'oauth-authentication': ['oauth', 'authorize', 'accessToken'],
      'client-storage': ['clientStorage', 'setItem', 'getItem'],
      'add-image-to-document': ['addImage', 'document.addImage']
    };

    const keywords = featureKeywordMap[feature] || [];
    if (!keywords.length) return fullCode;

    // Look for functions or methods containing the keywords
    const codeLines = fullCode.split('\n');
    let relevantCode = '';
    let inRelevantBlock = false;
    let bracketCount = 0;

    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      
      // Check if this line contains a keyword and looks like a function start
      const startsRelevantBlock = !inRelevantBlock && 
        keywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase())) &&
        (line.includes('function') || line.includes('=>') || line.includes('const') || line.includes('async'));
      
      if (startsRelevantBlock) {
        // Include a few lines before for context
        const startLine = Math.max(0, i - 5);
        relevantCode = codeLines.slice(startLine, i).join('\n') + '\n';
        inRelevantBlock = true;
      }
      
      if (inRelevantBlock) {
        relevantCode += line + '\n';
        
        // Count braces to track block ending
        bracketCount += (line.match(/{/g) || []).length;
        bracketCount -= (line.match(/}/g) || []).length;
        
        // End of a code block
        if (bracketCount === 0 && line.includes('}')) {
          // Include a few lines after for context
          const endLine = Math.min(codeLines.length, i + 3);
          relevantCode += codeLines.slice(i + 1, endLine).join('\n');
          break;
        }
      }
    }
    
    // If we couldn't extract a specific block, return a reasonable portion of the code
    if (!relevantCode.trim()) {
      // Find imports section first
      let importSection = '';
      for (const line of codeLines) {
        if (line.startsWith('import')) {
          importSection += line + '\n';
        } else if (importSection && line.trim() === '') {
          importSection += '\n';
          break;
        }
      }
      
      // Try to find a component or function that seems central to the file
      const componentMatch = fullCode.match(/function\s+([A-Z][A-Za-z0-9]*)\s*\(/);
      if (componentMatch) {
        const componentName = componentMatch[1];
        let componentBlock = '';
        inRelevantBlock = false;
        bracketCount = 0;
        
        for (let i = 0; i < codeLines.length; i++) {
          const line = codeLines[i];
          if (!inRelevantBlock && line.includes(`function ${componentName}`)) {
            inRelevantBlock = true;
          }
          
          if (inRelevantBlock) {
            componentBlock += line + '\n';
            bracketCount += (line.match(/{/g) || []).length;
            bracketCount -= (line.match(/}/g) || []).length;
            
            if (bracketCount === 0 && line.includes('}')) {
              break;
            }
          }
        }
        
        // Return imports + main component
        return importSection + componentBlock;
      }
      
      // If no suitable component found, return the first 50 lines or so
      return codeLines.slice(0, Math.min(50, codeLines.length)).join('\n');
    }
    
    return relevantCode;
  }
}
