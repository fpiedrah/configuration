import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { attempt, listNames } from "../lib/files.ts";

export interface Request {
  verb: string;
  name?: string;
  task?: string;
  model?: string;
  effort?: string;
  cwd?: string;
  fork?: string;
  resume?: string;
  deadline?: number;
  maxTurns?: number;
  group?: string;
  worktree?: string;
  base?: string;
  force?: boolean;
  run?: string;
  text?: string;
  who?: string;
  lines?: number;
}

export interface Reply {
  ok: boolean;
  text: string;
  missing?: boolean;
}

const SOCKET_SUFFIX = ".sock";
const REWAKE_EXIT = 2;

export function socketDirectory(environment: NodeJS.ProcessEnv): string {
  const runtime = environment.XDG_RUNTIME_DIR;
  return runtime
    ? path.join(runtime, "crew")
    : path.join("/tmp", `crew-${os.userInfo().uid}`);
}

export function socketPath(
  environment: NodeJS.ProcessEnv,
  claudePid: number | undefined,
  session: string,
): string {
  return path.join(
    socketDirectory(environment),
    `${claudePid ?? 0}-${session}${SOCKET_SUFFIX}`,
  );
}

export function socketSession(socket: string): string {
  const name = path.basename(socket, SOCKET_SUFFIX);
  return name.slice(name.indexOf("-") + 1);
}

export function listSockets(
  environment: NodeJS.ProcessEnv,
  claudePid?: number,
): string[] {
  const directory = socketDirectory(environment);
  const sockets: string[] = [];
  for (const name of listNames(directory).sort()) {
    if (!name.endsWith(SOCKET_SUFFIX)) continue;
    if (claudePid !== undefined && !name.startsWith(`${claudePid}-`)) continue;
    sockets.push(path.join(directory, name));
  }
  return sockets;
}

export function readLines(
  stream: net.Socket,
  onLine: (line: string) => void,
): void {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    let end = buffer.indexOf("\n");
    while (end >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line.trim()) onLine(line);
      end = buffer.indexOf("\n");
    }
  });
}

export function encode(value: Request | Reply): string {
  return `${JSON.stringify(value)}\n`;
}

export function request(socket: string, message: Request): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const connection = net.createConnection(socket);
    let answered = false;
    connection.on("connect", () => connection.write(encode(message)));
    readLines(connection, (line) => {
      answered = true;
      connection.end();
      try {
        const reply = JSON.parse(line) as Reply;
        resolve(reply);
      } catch (error) {
        reject(error);
      }
    });
    connection.on("error", reject);
    connection.on("close", () => {
      if (!answered) reject(new Error("crew daemon closed the connection"));
    });
  });
}

export function awaitMessages(environment: NodeJS.ProcessEnv): Promise<number> {
  const claudePid = Number(environment.CLAUDE_PID);
  const sockets = Number.isInteger(claudePid)
    ? listSockets(environment, claudePid)
    : [];
  if (sockets.length === 0) return Promise.resolve(0);
  return new Promise((resolve) => {
    let open = sockets.length;
    for (const socket of sockets) {
      const connection = net.createConnection(socket);
      connection.on("connect", () =>
        connection.write(encode({ verb: "wait" })),
      );
      readLines(connection, (line) => {
        const reply = attempt<Reply | undefined>(
          () => JSON.parse(line) as Reply,
          undefined,
        );
        if (!reply?.text) return;
        process.stderr.write(`${reply.text}\n`);
        resolve(REWAKE_EXIT);
      });
      connection.on("error", () => {});
      connection.on("close", () => {
        open -= 1;
        if (open === 0) resolve(0);
      });
    }
  });
}
