export async function streamResponseText(
  response: Response,
  onChunk: (text: string) => void,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const flushEvent = (event: string) => {
    const trimmed = event.trim();
    if (!trimmed) return;
    const sseMatch = /^data:\s?(.*)$/ms.exec(trimmed);
    if (!sseMatch) {
      if (event) {
        full += event;
        onChunk(event);
      }
      return;
    }
    const payload = sseMatch[1];
    let text: string | null = null;
    try {
      const parsed = JSON.parse(payload) as { content?: string | null } | string;
      if (typeof parsed === "string") text = parsed;
      else if (typeof parsed.content === "string") text = parsed.content;
    } catch {
      text = payload;
    }
    if (text) {
      full += text;
      onChunk(text);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes("\n\n")) {
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) flushEvent(event);
    } else {
      flushEvent(buffer);
      buffer = "";
    }
  }
  const tail = decoder.decode();
  if (tail) {
    buffer += tail;
    flushEvent(buffer);
    buffer = "";
  }
  if (buffer.trim()) flushEvent(buffer);
  return full;
}