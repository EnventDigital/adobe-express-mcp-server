# Changelog

All notable changes to the Adobe Express MCP Server will be documented in this file.

## [1.0.1] - 2025-06-04

### Fixed
- Fixed output schema format in tools to properly define the structure for MCP SDK validation
- Changed from using Zod schema's `.shape` property to direct schema objects
- Specifically fixed `queryDocumentation`, `getAssistantCapabilities`, `setKnowledgeSource`, and `scaffold-addon-project` tools
- Fixed structuredContent object typing to ensure correct format for MCP tools
- Added test script for verifying MCP server functionality
- Updated README with troubleshooting section

## [1.0.0] - Initial Release

### Added
- First stable release of the Adobe Express MCP Server
- Support for documentation lookup via GitHub or local knowledge base
- Code examples for common Adobe Express add-on features
- Implementation guidance for adding features to add-ons
- Scaffold generation for new add-on projects
