/*
 * File: llm-client.js
 * Description: Implements a client that interacts with the DeepSeek LLM via its API.
 *              Sends user queries, provides tool definitions, and processes tool calls
 *              by forwarding them to the MCP server. The LLM decides which tools to call
 *              based on query context. Extend this file by adding new tool definitions or
 *              custom command schemas for the LLM to interact with.
 * Configuration: Reads LLM_API_KEY, MODEL and MCP_SERVER_AUTH_TOKEN from config.json.
 * Usage: Run with `node llm-client.js`. Enter queries interactively.
 */

const axios = require("axios");
const readlineSync = require("readline-sync");
const fs = require("fs");

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const providers = {
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    model: config.MODEL || "deepseek-chat",
    apiKey: config.LLM_API_KEY,
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    model: config.MODEL || "gpt-4",
    apiKey: config.LLM_API_KEY,
  },
  ollama: {
    url: "http://localhost:11434/v1/chat/completions",
    model: config.MODEL || "llama3",
    apiKey: config.LLM_API_KEY || "", // Ollama basicaly doesn't require an API key
  },
  // EXTENSION POINT: Here, add new providers (e.g., Anthropic with adapter, Grok) here
};
const provider = providers[config.API_PROVIDER] || providers.deepseek;
const apiKey = provider.apiKey;
const apiUrl = provider.url;
const model = provider.model;
const mcpServerUrl = "http://localhost:3000/mcp";
const authToken = config.MCP_SERVER_AUTH_TOKEN || "Super8Duper8Secret8T0ken";

// Expose available tools for the LLM, that LLM can call via MCP server and use for solve user tasks
const tools = [
  {
    name: "analyze_logs",
    description: "Analyze a log file for patterns (e.g., errors)",
    parameters: {
      type: "object",
      properties: { filename: { type: "string" }, pattern: { type: "string" } },
      required: ["filename", "pattern"],
    },
  },
  {
    name: "search_files",
    description:
      "Search files by name, content, or date (by: name, content, date)",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        by: { type: "string", enum: ["name", "content", "date"] },
      },
      required: ["query"],
    },
  },
  {
    name: "organize_files",
    description: "Group files by extension or date (by: extension, date)",
    parameters: {
      type: "object",
      properties: { by: { type: "string", enum: ["extension", "date"] } },
      required: ["by"],
    },
  },
  {
    name: "replace_text",
    description: "Replace text in a file",
    parameters: {
      type: "object",
      properties: {
        filename: { type: "string" },
        search: { type: "string" },
        replace: { type: "string" },
      },
      required: ["filename", "search", "replace"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file if permitted in configuration",
    parameters: {
      type: "object",
      properties: { filename: { type: "string" } },
      required: ["filename"],
    },
  },
  {
    name: "fetch_external_data",
    description: "Fetch user list for saving to files",
    parameters: {
      type: "object",
      properties: {
        endpoint: { type: "string", enum: ["posts", "users", "comments"] },
      },
      required: ["endpoint"],
    },
  },
];

// EXTENSION POINT: Here, add new tools to this array for additional functionality (e.g., database queries, cloud storage).
// EXTENSION POINT: Here, adjust tool schemas for provider-specific requirements (e.g., Anthropic may need different format).

// Call the LLM API with messages and tools
async function callLLM(messages) {
  try {
    const response = await axios.post(
      apiUrl,
      {
        model,
        messages,
        tools: tools.map((t) => ({ type: "function", function: t })),
        tool_choice: "auto",
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.choices[0].message;
  } catch (error) {
    throw new Error(`LLM API call failed: ${error.message}`);
  }
}

// Call MCP server to execute a tool seleted by the LLM
async function callMcpTool(toolCall) {
  const response = await axios.post(
    mcpServerUrl,
    {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tool_call",
      params: {
        name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.result.content[0].text;
}

// Main loop for user interaction
async function main() {
  if (!apiKey && provider.apiKey !== "") {
    console.error(
      "LLM_API_KEY is not set for the selected provider in config.json"
    );
    return;
  }
  const messages = [
    {
      role: "system",
      content:
        "You are an intelligent AI. Use tools to manage files in the specified directory.",
    },
  ];
  while (true) {
    const userInput = readlineSync.question('Enter your query (or "exit"): ');
    if (userInput === "exit") break;
    messages.push({ role: "user", content: userInput });

    let response = await callLLM(messages);
    while (response.tool_calls) {
      messages.push(response);
      for (const toolCall of response.tool_calls) {
        try {
          const toolResult = await callMcpTool(toolCall);
          messages.push({
            role: "tool",
            content: toolResult,
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          messages.push({
            role: "tool",
            content: `Error: ${error.message}`,
            tool_call_id: toolCall.id,
          });
        }
      }
      response = await callLLM(messages);
    }
    console.log("LLM response:", response.content);
    messages.push(response);
  }
}

// EXTENSION POINT: Here, add support for persistent message history (e.g., save to file or database).
// EXTENSION POINT: Here, implement provider-specific error handling or retry logic for API calls.
// EXTENSION POINT: Here, add support for streaming responses from LLMs that support it.

main();
