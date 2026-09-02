import { createServer } from "node:http";

function openAiStream() {
  const events = [
    { type: "response.output_item.added", item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] } },
    { type: "response.content_part.added", part: { type: "output_text", text: "" } },
    { type: "response.output_text.delta", delta: "ok" },
    { type: "response.output_item.done", item: { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ok" }] } },
    { type: "response.completed", response: { status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 } } } },
  ];
  return `${events.map((event) => `data: ${JSON.stringify(event)}`).join("\n\n")}\n\n`;
}

function anthropicStream() {
  const events = [
    ["message_start", { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 1, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n`).join("\n");
}

function googleStream() {
  return `data: ${JSON.stringify({
    candidates: [{ content: { role: "model", parts: [{ text: "ok" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  })}\n\n`;
}

export async function startMockProxy({ dialect }) {
  const requests = [];
  const responses = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: request.method,
      path: request.url,
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([key, value]) => [
          key,
          /authorization|api-key/i.test(key) ? "<redacted>" : value,
        ]),
      ),
      rawHeaders: request.headers,
      body: JSON.parse(rawBody || "{}"),
    });
    const body = dialect === "openai" ? openAiStream() : dialect === "anthropic" ? anthropicStream() : googleStream();
    responses.push(body);
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    responses,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
