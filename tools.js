/*
 * File: tools.js
 * Description: Defines tools for file system operations used by the MCP server.
 *              Each tool is a function that performs a specific task (e.g., log analysis,
 *              file search). Tools are restricted to the WORKING_DIR specified in config.json.
 *              Extend this file by adding new tools to module.exports for the LLM to use.
 * Configuration: Reads WORKING_DIR and ALLOW_DELETE from config.json.
 * Usage: Imported by mcp-server.js to handle tool_call requests.
 */

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const axios = require("axios");

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const workingDir = config.WORKING_DIR || process.cwd();
const allowDelete = config.ALLOW_DELETE === true;

// Ensure file paths stay within WORKING_DIR to prevent unauthorized access
function ensureSafePath(filename) {
  const fullPath = path.resolve(workingDir, filename);
  if (!fullPath.startsWith(path.resolve(workingDir))) {
    throw new Error("Attempt to access path outside WORKING_DIR");
  }
  return fullPath;
}

// EXTENSION POINT: Add new tools by extending this module.exports object.
// EXTENSION POINT: Integrate external APIs (e.g., database queries, cloud storage) for additional functionality.

module.exports = {
  // Analyze log file for patterns (e.g., errors)
  analyze_logs: async ({ pattern, filename }) => {
    const filePath = ensureSafePath(filename);
    if (!fs.existsSync(filePath)) throw new Error("Log file not found");
    const content = fs.readFileSync(filePath, "utf8");
    const regex = new RegExp(pattern, "g");
    const matches = content.match(regex) || [];
    return { matches, count: matches.length };
  },

  // Search files by name, content, or metadata
  search_files: async ({ query, by = "name" }) => {
    const files = glob.sync(`${workingDir}/**/*`, { nodir: true });
    let results = [];
    if (by === "name") {
      results = files.filter((f) => path.basename(f).includes(query));
    } else if (by === "content") {
      results = files.filter((f) => {
        try {
          const content = fs.readFileSync(f, "utf8");
          return content.includes(query);
        } catch {
          return false;
        }
      });
    } else if (by === "date") {
      results = files.filter((f) => {
        const stats = fs.statSync(f);
        return stats.mtime.toISOString().startsWith(query);
      });
    }
    return results.map((f) => path.relative(workingDir, f));
  },

  // Organize files by extension or date
  organize_files: async ({ by = "extension" }) => {
    const files = glob.sync(`${workingDir}/**/*`, { nodir: true });
    const groups = {};
    for (const file of files) {
      const relPath = path.relative(workingDir, file);
      let groupKey;
      if (by === "extension") {
        groupKey = path.extname(file).slice(1) || "no-extension";
      } else if (by === "date") {
        const stats = fs.statSync(file);
        groupKey = stats.mtime.toISOString().split("T")[0];
      }
      const targetDir = path.join(workingDir, groupKey);
      if (!fs.existsSync(targetDir))
        fs.mkdirSync(targetDir, { recursive: true });
      const newPath = path.join(targetDir, path.basename(file));
      fs.renameSync(file, newPath);
      groups[groupKey] = groups[groupKey] || [];
      groups[groupKey].push(path.relative(workingDir, newPath));
    }
    return groups;
  },

  // Replace text in a file
  replace_text: async ({ search, replace, filename }) => {
    const filePath = ensureSafePath(filename);
    if (!fs.existsSync(filePath)) throw new Error("File not found");
    const content = fs.readFileSync(filePath, "utf8");
    const newContent = content.replace(new RegExp(search, "g"), replace);
    fs.writeFileSync(filePath, newContent, "utf8");
    return `Text replaced in ${filePath}`;
  },

  // Delete a file (only if allowed)
  delete_file: async ({ filename }) => {
    if (!allowDelete)
      throw new Error("File deletion is disabled in configuration");
    const filePath = ensureSafePath(filename);
    if (!fs.existsSync(filePath)) throw new Error("File not found");
    fs.unlinkSync(filePath);
    return `File deleted: ${filePath}`;
  },

  // EXAMPLE: REST API CALL - Fetch data from public JSONPlaceholder API (no token required)
  // This tool demonstrates integrating external REST APIs for file-related workflows.
  // Usage: Fetch JSON data and save it to a file using create_file tool.
  // To enable: Uncomment and add to tools descriptions in deepseek-client.js
  /*
  fetch_external_data: async ({ endpoint = 'posts' }) => {
    try {
      // Public endpoint: https://jsonplaceholder.typicode.com/{endpoint}
      // Returns JSON array/object with fake data (users, posts, etc.)
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
  */

  // EXTENSION POINT: Add a tool for file compression (e.g., zip archives).
  // EXTENSION POINT: Implement real-time file monitoring for changes.
  // EXTENSION POINT: Add more API integrations, like weather data or stock quotes, for dynamic file content generation.
};
