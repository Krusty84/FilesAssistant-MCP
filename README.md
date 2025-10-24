# FilesAssistant-MCP

## What is this?

This project is a template for building custom Model Context Protocol (MCP)-based agents that integrate with large language models (LLMs) via an OpenAI-compatible API. It provides a foundation for creating intelligent agents capable of processing natural language queries and executing tasks through predefined tools. For demonstration purposes, this template implements file system operations with robust safety mechanisms to prevent unintended file modifications or deletions. The MCP server handles JSON-RPC requests, while the client communicates with the LLM (e.g., DeepSeek, OpenAI, or Ollama) to determine which tools to invoke based on user input.

## Features

- **Intelligent File Management**: Leverages an LLM to interpret natural language queries and select appropriate file operations.
- **MCP Server**: Implements a JSON-RPC 2.0 server for handling tool calls, supporting batch requests and initialization.
- **File System Tools**:
  - `analyze_logs`: Searches log files for patterns (e.g., errors) using regular expressions.
  - `search_files`: Finds files by name, content, or metadata (e.g., modification date).
  - `organize_files`: Groups files by extension or creation date into subdirectories.
  - `replace_text`: Performs bulk text replacement in files (e.g., changing "http" to "https").
  - `delete_file`: Deletes files, with configurable restrictions to prevent unauthorized deletions.
- **Multi-LLM Support**: Compatible with any OpenAI-style API (DeepSeek, OpenAI, Ollama, etc.) via a configurable provider system.
- **Security**:
  - Restricts file operations to a designated `WORKING_DIR` to prevent unauthorized access.
  - Requires `MCP_SERVER_AUTH_TOKEN` for MCP server authentication.
  - Disables file deletion by default (`ALLOW_DELETE=false`) for safety.
- **Modular Design**: Tools are defined in a separate module (`tools.js`), enabling easy addition of new functionality.
- **Configurable**: Settings (API provider, keys, directory, etc.) are managed in `config.json`.

## How to Use

### Prerequisites
- Node.js (v18 or higher recommended).
- NPM packages: `axios`, `readline-sync`, `glob`.
- An API key for your chosen LLM provider (e.g., DeepSeek from [platform.deepseek.com](https://platform.deepseek.com)).

### Installation
1. Clone the repository or copy the project files.
2. Install dependencies:
   ```bash
   npm install axios readline-sync glob
   ```
3. Edit `config.json` in the project root to match your environment:
   - `API_PROVIDER`: Options include `deepseek`, `openai`, `ollama`, or custom providers.
   - `LLM_API_KEY`: API key for the LLM provider (not required for Ollama).
   - `MODEL`: Model name (e.g., `gpt-4` for OpenAI, `llama3` for Ollama).
   - `MCP_SERVER_AUTH_TOKEN`: Token for MCP server authentication.
   - `WORKING_DIR`: Directory where file operations are allowed.
   - `ALLOW_DELETE`: Set to `true` to enable file deletion (default: `false`).

### Running the Application
1. Start the MCP server:
   ```bash
   node mcp-server.js
   ```
   The server will run on `http://localhost:3000/mcp`.
2. Start the client:
   ```bash
   node llm-client.js
   ```
3. Enter queries in the client console, e.g.:
   - "Find all files containing 'error' and replace 'http' with 'https'."
   - "Organize files by extension."
   - "Analyze access.log for '404' errors."
4. To exit the client, type `exit`.

### Example Workflow
- **Query**: "Find files with 'error' and replace 'http' with 'https'."
- **Process**:
  1. The client sends the query to the LLM (e.g., DeepSeek).
  2. The LLM decides to call `search_files` with `query: "error"`, `by: "content"`.
  3. The MCP server executes the tool and returns matching file paths.
  4. The LLM then calls `replace_text` for each file.
  5. The client displays the final response.

## How to Extend

This template is designed for easy customization. Below are key areas for adding new functionality:

### Adding New Tools
1. **Define the Tool**:
   - Open `tools.js` and add a new function to `module.exports`. For example:
     ```javascript
     // EXTENSION POINT: Example tool for compressing files
     compress_files: async ({ filename }) => {
       // Implement compression logic (e.g., using 'archiver' package)
       const filePath = ensureSafePath(filename);
       // ...
       return `File ${filePath} compressed`;
     },
     ```
2. **Update Client Tool Definitions**:
   - In `llm-client.js`, add the tool to the `tools` array with its schema:
     ```javascript
     {
       name: 'compress_files',
       description: 'Compress a file into a zip archive',
       parameters: {
         type: 'object',
         properties: { filename: { type: 'string' } },
         required: ['filename'],
       },
     },
     ```
3. Test the new tool with a query like "Compress file.txt into a zip."

### Adding External API Integration
- Add a tool to interact with external APIs, such as the public JSONPlaceholder API (no token required):
  ```javascript
  // EXAMPLE: REST API CALL - Fetch data from public JSONPlaceholder API
  fetch_external_data: async ({ endpoint = 'posts' }) => {
    try {
      const response = await axios.get(`https://jsonplaceholder.typicode.com/${endpoint}`);
      return {
        data: response.data,
        count: Array.isArray(response.data) ? response.data.length : 1,
        message: `Fetched ${endpoint} data successfully`
      };
    } catch (error) {
      throw new Error(`API call failed: ${error.message}`);
    }
  },
  ```
- Add the corresponding schema to `llm-client.js`:
  ```javascript
  {
    name: 'fetch_external_data',
    description: 'Fetch user list for saving to files',
    parameters: {
      type: 'object',
      properties: { endpoint: { type: 'string', enum: ['posts', 'users', 'comments'] } },
      required: ['endpoint'],
    },
  },
  ```
- Test with queries like "Fetch posts from JSONPlaceholder and save to posts.json."

### Adding New LLM Providers
1. **Update Providers**:
   - In `llm-client.js`, extend the `providers` object:
     ```javascript
     // EXTENSION POINT: Add new providers
     anthropic: {
       url: 'https://your-anthropic-adapter-url/v1/chat/completions',
       model: 'claude-3-opus',
       apiKey: config.LLM_API_KEY,
     },
     ```
2. Update `config.json` with the new provider:
   ```json
   {
     "API_PROVIDER": "anthropic",
     "LLM_API_KEY": "your_anthropic_key",
     "MODEL": "claude-3-opus"
   }
   ```

### Other Extensions
- **Real-Time Monitoring**: Add a tool in `tools.js` using `fs.watch` to monitor file changes and notify the LLM.
- **Persistent History**: Save message history to a file or database in `llm-client.js`.
- **Enhanced Security**: Add rate limiting or logging in `mcp-server.js` for the MCP server.
- **Streaming Responses**: Modify `callLLM` in `llm-client.js` to handle streaming responses if supported by the LLM provider.

### Notes
- Ensure new tools respect `WORKING_DIR` restrictions using `ensureSafePath`.
- Test thoroughly when enabling `ALLOW_DELETE` to avoid accidental file loss.
- Check LLM provider documentation for specific `tool_calls` or model requirements.
