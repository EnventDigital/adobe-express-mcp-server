/**
 * Documentation Parser Script
 * 
 * This script parses documentation from Adobe Express and Spectrum Web Components
 * repositories and creates a knowledge base file for local usage by the MCP server.
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { marked, Token } from 'marked';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

interface MCPResultItem {
  type: string;
  title: string;
  content: string;
  raw_markdown_content?: string;
  source_hint: string;
  tags?: string[];
  language?: string;
  frontmatter?: Record<string, any>;
  parent_title?: string;
  dataSource: 'express_sdk' | 'spectrum_web_components' | 'unknown';
}

const PROJECT_ROOT = path.join(__dirname, '..');

const EXPRESS_DOCS_REPO_CLONE_PATH = path.join(PROJECT_ROOT, 'adobe-docs-repo', 'express-add-ons-docs');
const EXPRESS_DOCS_SRC_PAGES_PATH = path.join(EXPRESS_DOCS_REPO_CLONE_PATH, 'src', 'pages');
const EXPRESS_GITHUB_BASE_URL = 'https://github.com/AdobeDocs/express-add-ons-docs/tree/main/src/pages/';

const SWC_REPO_CLONE_PATH = path.join(PROJECT_ROOT, 'adobe-docs-repo', 'spectrum-web-components');
const SWC_PACKAGES_PATH = path.join(SWC_REPO_CLONE_PATH, 'packages');
const SWC_GITHUB_BASE_URL = 'https://github.com/adobe/spectrum-web-components/tree/main/';

// Output to 'dist/knowledge_base.json'
const FINAL_OUTPUT_KB_PATH = path.join(PROJECT_ROOT, 'dist', 'knowledge_base.json');

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

function extractTags(filePath: string, scanBasePath: string, dataSource: 'express_sdk' | 'spectrum_web_components'): string[] {
  const relativePath = path.relative(scanBasePath, filePath);
  let parts = relativePath.split(path.sep).map(part => part.toLowerCase());
  const filename = path.basename(filePath, path.extname(filePath)).toLowerCase();

  let tags: string[] = [];

  if (dataSource === 'spectrum_web_components') {
    const componentName = parts[0]; 
    let specificTags: string[] = [];
    if(componentName && componentName !== 'tools' && componentName !== 'shared') specificTags.push(componentName);

    if (filename !== 'readme' && filename !== 'index' && filename !== componentName) {
      specificTags.push(filename);
    }
    parts.slice(1, -1).forEach(p => {
      if (p !== 'docs' && p !== 'src' && p !== 'stories' && p !== componentName && !specificTags.includes(p)) {
        specificTags.push(p);
      }
    });
    tags = specificTags.filter(tag => tag !== undefined && tag !== null && tag !== '');
  } else { // express_sdk
    tags = parts.slice(0, -1).concat(filename === 'index' ? [] : [filename]);
  }
  
  return tags.filter(tag => tag && !['src', 'pages', 'index', '', 'packages', '.vitepress', 'dist', 'tools', 'shared'].includes(tag) && !tag.startsWith('_'));
}

async function parseMarkdownFile(
  filePath: string, 
  scanBasePathForTags: string, 
  repoCloneBasePathForLink: string, 
  githubBaseUrl: string, 
  dataSource: 'express_sdk' | 'spectrum_web_components'
): Promise<MCPResultItem[] | null> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter, content: markdownBody } = matter(fileContent);

    let relativePathForLink = '';
    if (dataSource === 'express_sdk') {
      relativePathForLink = path.relative(EXPRESS_DOCS_SRC_PAGES_PATH, filePath).replace(/\\/g, '/');
    } else { 
      relativePathForLink = path.relative(SWC_REPO_CLONE_PATH, filePath).replace(/\\/g, '/');
    }
    const sourceHint = githubBaseUrl + relativePathForLink;
    
    const baseTitle = frontmatter.title || frontmatter.name || (dataSource === 'spectrum_web_components' && path.basename(filePath).toLowerCase() === 'readme.md' ? path.basename(path.dirname(filePath)) : path.basename(filePath, path.extname(filePath)));
    const baseTags = frontmatter.tags || extractTags(filePath, scanBasePathForTags, dataSource);

    const resultItems: MCPResultItem[] = [];
    const tokens = marked.lexer(markdownBody);
    let firstH2Index = tokens.findIndex(token => token.type === 'heading' && token.depth === 2);
    
    const treatAsSinglePage = dataSource === 'spectrum_web_components' && path.basename(filePath).toLowerCase() === 'readme.md';

    if (firstH2Index === -1 || path.basename(filePath).toLowerCase() === 'index.md' || treatAsSinglePage) {
      const mainContentText = tokensToPlainText(tokens);
      if (mainContentText.trim()) {
        resultItems.push({
          type: frontmatter.type || (treatAsSinglePage ? 'spectrum_component_overview' : (path.basename(filePath).toLowerCase() === 'index.md' ? 'category_overview' : 'documentation_page')),
          title: baseTitle,
          content: mainContentText,
          raw_markdown_content: markdownBody,
          source_hint: sourceHint,
          tags: Array.isArray(baseTags) ? baseTags : [String(baseTags)],
          frontmatter: frontmatter,
          parent_title: baseTitle,
          dataSource: dataSource,
        });
      }
    } else { 
      const overviewTokens = tokens.slice(0, firstH2Index);
      const overviewContentText = tokensToPlainText(overviewTokens);
      if (overviewContentText.trim()) {
        resultItems.push({
          type: frontmatter.type || 'page_overview',
          title: `${baseTitle} - Overview`,
          content: overviewContentText,
          raw_markdown_content: tokensToMarkdown(overviewTokens),
          source_hint: sourceHint,
          tags: Array.isArray(baseTags) ? [...baseTags, "overview"] : [String(baseTags), "overview"],
          frontmatter: frontmatter,
          parent_title: baseTitle,
          dataSource: dataSource,
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
              resultItems.push({
                type: sectionType, 
                title: `${baseTitle} - ${currentSectionTitle}`, 
                content: sectionContent,
                raw_markdown_content: tokensToMarkdown(currentSectionTokens), 
                source_hint: sourceHint,
                tags: Array.isArray(baseTags) ? [...baseTags, ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))] : [String(baseTags), ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))],
                frontmatter: frontmatter, 
                parent_title: baseTitle, 
                dataSource: dataSource,
              });
            }
          }
          currentSectionTitle = token.text.replace(/`/g, '');
          currentSectionTokens = [token]; 
          sectionType = token.depth === 2 ? 'major_section' : 'minor_section';
          if (token.depth === 2) {
            if (/\\b(methods?|functions?)\\b/i.test(currentSectionTitle)) sectionType = 'class_methods_group';
            else if (/\\b(properties?|attributes?|fields?|api)\\b/i.test(currentSectionTitle)) sectionType = 'class_properties_group';
            else if (/\\b(events?)\\b/i.test(currentSectionTitle)) sectionType = 'class_events_group';
            else if (/\\b(example?s|usage)\\b/i.test(currentSectionTitle)) sectionType = 'examples_section';
          } else { 
            if (/\\w+\\s*\\(.*\\)/.test(currentSectionTitle)) sectionType = 'class_method_detail';
            else if (/^[a-zA-Z_][\\w\\.]*(\s*:.*)?$/.test(currentSectionTitle.split(/\\s|:/)[0])) sectionType = 'class_property_detail';
          }
        } else { 
          currentSectionTokens.push(token);
        }
      }
      
      if (currentSectionTokens.length > 0 && currentSectionTitle) {
        const sectionContent = tokensToPlainText(currentSectionTokens);
        if (sectionContent.trim()){
          resultItems.push({
            type: sectionType, 
            title: `${baseTitle} - ${currentSectionTitle}`, 
            content: sectionContent,
            raw_markdown_content: tokensToMarkdown(currentSectionTokens), 
            source_hint: sourceHint,
            tags: Array.isArray(baseTags) ? [...baseTags, ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))] : [String(baseTags), ...currentSectionTitle.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !t.includes('`'))],
            frontmatter: frontmatter, 
            parent_title: baseTitle, 
            dataSource: dataSource,
          });
        }
      }
      
      if (resultItems.length === 0 && tokens.length > 0) { 
        const fallbackContent = tokensToPlainText(tokens);
        if (fallbackContent.trim()) {
          resultItems.push({
            type: frontmatter.type || 'documentation_page', 
            title: baseTitle, 
            content: fallbackContent,
            raw_markdown_content: markdownBody, 
            source_hint: sourceHint,
            tags: Array.isArray(baseTags) ? baseTags : [String(baseTags)],
            frontmatter: frontmatter, 
            parent_title: baseTitle, 
            dataSource: dataSource,
          });
        }
      }
    }
    
    return resultItems.filter(item => item.content.trim() !== '');
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error);
    return null;
  }
}

async function processDirectory(
  dirPath: string, 
  scanBasePathForTags: string, 
  repoCloneBasePathForLink: string, 
  githubBaseUrl: string, 
  dataSource: 'express_sdk' | 'spectrum_web_components',
  allItems: MCPResultItem[]
) {
  console.log(`Processing directory: ${dirPath}`);
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (['node_modules', '.git', '.github', 'dist', '.vitepress', 'images'].includes(entry.name)) {
        continue;
      }
      
      await processDirectory(fullPath, scanBasePathForTags, repoCloneBasePathForLink, githubBaseUrl, dataSource, allItems);
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
      // Skip certain common files
      if (entry.name.startsWith('_') || 
          ['contributing.md', 'changelog.md', 'license.md'].includes(entry.name.toLowerCase())) {
        continue;
      }
      
      console.log(`Processing ${dataSource} file: ${path.relative(scanBasePathForTags, fullPath)}`);
      const items = await parseMarkdownFile(fullPath, scanBasePathForTags, repoCloneBasePathForLink, githubBaseUrl, dataSource);
      if (items && items.length > 0) {
        allItems.push(...items);
      }
    }
  }
}

async function processRepository(
  scanPath: string, 
  repoCloneBasePath: string, 
  githubBaseUrl: string, 
  dataSource: 'express_sdk' | 'spectrum_web_components',
  allItems: MCPResultItem[]
) {
  console.log(`Starting documentation parsing for ${dataSource} from: ${scanPath}`);
  if (!await fs.pathExists(scanPath)) {
    console.error(`Error: Documentation path for ${dataSource} not found: ${scanPath}`);
    return;
  }

  try {
    await processDirectory(scanPath, scanPath, repoCloneBasePath, githubBaseUrl, dataSource, allItems);
    console.log(`Completed processing ${dataSource} documentation.`);
  } catch (error) {
    console.error(`Error processing ${dataSource} repository:`, error);
  }
}

async function main() {
  const allKnowledgeItems: MCPResultItem[] = [];

  // Check if directories exist
  if (await fs.pathExists(EXPRESS_DOCS_SRC_PAGES_PATH)) {
    await processRepository(EXPRESS_DOCS_SRC_PAGES_PATH, EXPRESS_DOCS_REPO_CLONE_PATH, EXPRESS_GITHUB_BASE_URL, 'express_sdk', allKnowledgeItems);
  } else {
    console.warn(`Express docs path not found: ${EXPRESS_DOCS_SRC_PAGES_PATH}`);
    console.warn('Please clone the Adobe Express docs repository first:');
    console.warn(`mkdir -p ${path.dirname(EXPRESS_DOCS_REPO_CLONE_PATH)} && git clone https://github.com/AdobeDocs/express-add-ons-docs.git ${EXPRESS_DOCS_REPO_CLONE_PATH}`);
  }

  if (await fs.pathExists(SWC_PACKAGES_PATH)) {
    await processRepository(SWC_PACKAGES_PATH, SWC_REPO_CLONE_PATH, SWC_GITHUB_BASE_URL, 'spectrum_web_components', allKnowledgeItems);
  } else {
    console.warn(`Spectrum Web Components path not found: ${SWC_PACKAGES_PATH}`);
    console.warn('Please clone the Spectrum Web Components repository first:');
    console.warn(`mkdir -p ${path.dirname(SWC_REPO_CLONE_PATH)} && git clone https://github.com/adobe/spectrum-web-components.git ${SWC_REPO_CLONE_PATH}`);
  }

  try {
    // Create output directory if it doesn't exist
    const outputDir = path.dirname(FINAL_OUTPUT_KB_PATH);
    await fs.ensureDir(outputDir);
    
    // Write the knowledge base file
    await fs.writeJson(FINAL_OUTPUT_KB_PATH, allKnowledgeItems, { spaces: 2 });
    console.log(`Successfully generated knowledge_base.json with ${allKnowledgeItems.length} items at ${FINAL_OUTPUT_KB_PATH}`);
  } catch (error) {
    console.error('Error writing knowledge_base.json:', error);
  }
}

main().catch(error => {
  console.error("Unhandled error in main function of doc-parser:", error);
  process.exit(1);
});
