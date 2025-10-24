/*
 * File: mcp-server.js
 * Description: Implements an MCP (Model Context Protocol) server using HTTP and JSON-RPC 2.0.
 *              Handles tool calls and initialization requests from clients, interfacing with
 *              the tools module for file system operations. Supports batch processing and
 *              authentication. Extend this file to add new JSON-RPC methods or external API
 *              integrations for the LLM to interact with.
 * Configuration: Reads settings from config.json (AUTH_TOKEN, etc.).
 * Usage: Run with `node mcp-server.js`. Send POST requests to /mcp with JSON-RPC payloads.
 */

const http = require("http");
const fs = require("fs");
const tools = require("./tools");

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const authToken = config.MCP_SERVER_AUTH_TOKEN || "Super8Duper8Secret8T0ken";
const port = 3000;

// Handle a single JSON-RPC request
async function handleSingleCall(json) {
  if (json.method === "tool_call") {
    const { name, arguments: args } = json.params;
    try {
      // Execute the specified tool with provided arguments
      const result = await tools[name](args);
      return {
        jsonrpc: "2.0",
        id: json.id,
        result: { content: [{ type: "text", text: JSON.stringify(result) }] },
      };
    } catch (error) {
      // Return error response for invalid tool or execution failure
      return {
        jsonrpc: "2.0",
        id: json.id,
        error: { code: -32000, message: error.message },
      };
    }
  } else if (json.method === "initialize") {
    // Handle MCP initialization, return supported capabilities
    return {
      jsonrpc: "2.0",
      id: json.id,
      result: {
        capabilities: {
          tools: Object.keys(tools).filter(
            (name) => name !== "delete_file" || config.ALLOW_DELETE
          ),
        },
      },
    };
  }
  // Return error for unsupported methods
  return {
    jsonrpc: "2.0",
    id: json.id,
    error: { code: -32600, message: "Invalid method" },
  };
}

// Create HTTP server for MCP JSON-RPC requests
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/mcp") {
    // Validate authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${authToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized" },
        })
      );
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const json = JSON.parse(body);
        let responses = [];
        if (Array.isArray(json)) {
          // Process batch requests
          for (const item of json) {
            const resp = await handleSingleCall(item);
            if (resp) responses.push(resp);
          }
        } else {
          // Process single request
          const resp = await handleSingleCall(json);
          if (resp) responses = [resp];
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(responses.length === 1 ? responses[0] : responses)
        );
      } catch (error) {
        // Handle parsing or processing errors
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: error.message },
          })
        );
      }
    });
  } else {
    // Return 404 for non-MCP endpoints
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Not Found" },
      })
    );
  }
});

// TODO: Add middleware for rate limiting, logging.
// TODO: Implement Server-Sent Events (SSE) for real-time notifications (e.g., file changes).

server.listen(port, () =>
  console.log(`MCP server running at http://localhost:${port}/mcp`)
);
