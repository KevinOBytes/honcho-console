import { describe, expect, it } from "vitest";

import { streamResponseText } from "./stream-text";

function responseFrom(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("streamResponseText", () => {
  it("extracts content from SSE data events", async () => {
    const received: string[] = [];
    const text = await streamResponseText(
      responseFrom(['data: {"content":"Hello "}\n\n', 'data: {"content":"world"}\n\n']),
      (chunk) => received.push(chunk),
    );
    expect(received).toEqual(["Hello ", "world"]);
    expect(text).toBe("Hello world");
  });

  it("falls back to raw payload text when an SSE event is not JSON", async () => {
    const text = await streamResponseText(responseFrom(["data: plain words\n\n", "data: more\n\n"]), () => {});
    expect(text).toBe("plain wordsmore");
  });

  it("streams plain chunks without SSE framing", async () => {
    const received: string[] = [];
    const text = await streamResponseText(responseFrom(["streaming ", "plain", " text"]), (chunk) => received.push(chunk));
    expect(received.join("")).toBe("streaming plain text");
    expect(text).toBe("streaming plain text");
  });

  it("skips events without string content", async () => {
    const text = await streamResponseText(responseFrom(['data: {"content":null}\n\n', 'data: {"content":"kept"}\n\n']), () => {});
    expect(text).toBe("kept");
  });
});