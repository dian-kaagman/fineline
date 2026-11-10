import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** A stand-in for the conversion worker that answers in the shape of docs/api/worker-openapi.yaml. */

export interface StubReply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  delayMs?: number;
}

export interface StubCall {
  authorization: string | undefined;
  fields: Record<string, string>;
  fileName: string | undefined;
  fileType: string | undefined;
  fileSize: number;
}

export interface WorkerStub {
  url: string;
  calls: StubCall[];
  reply: (call: StubCall) => StubReply | Promise<StubReply>;
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function startWorkerStub(
  defaultReply: (call: StubCall) => StubReply,
): Promise<WorkerStub> {
  const stub: WorkerStub = {
    url: "",
    calls: [],
    reply: defaultReply,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server: Server = createServer((req, res) => {
    void (async () => {
      const body = await readBody(req);
      const form = await new Request("http://stub", {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] ?? "" },
        body,
      }).formData();
      const fields: Record<string, string> = {};
      let file: File | undefined;
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") fields[key] = value;
        else if (key === "photo") file = value;
      }
      const call: StubCall = {
        authorization: req.headers.authorization,
        fields,
        fileName: file?.name,
        fileType: file?.type,
        fileSize: file?.size ?? 0,
      };
      stub.calls.push(call);
      const reply = await stub.reply(call);
      if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
      res.writeHead(reply.status, { "content-type": "application/json", ...reply.headers });
      res.end(reply.body === undefined ? "" : JSON.stringify(reply.body));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return stub;
}
