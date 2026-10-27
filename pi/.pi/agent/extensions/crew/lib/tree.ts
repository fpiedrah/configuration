import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PINNED } from "./config.ts";
import type { Config } from "./config.ts";
import { listNames, readJson } from "./files.ts";
import { readablePath } from "./runs.ts";
import type { Run } from "./runs.ts";

export interface Place {
  depth: number;
  tree?: string;
  parent?: string;
}

export type ParkReason = "parked" | "asking" | "waiting";

export interface Entry {
  run: string;
  name: string;
  model: string;
  session: string;
  parent?: string;
  depth: number;
  pid: number;
  host: string;
  tab?: string;
  agent?: string;
  started?: string;
  reason?: ParkReason;
}

export interface TreeState {
  id: string;
  slots: Entry[];
  tickets: Entry[];
  parked: Entry[];
}

interface EntryFile {
  file: string;
  entry: Entry;
}

export function crewPlace(environment: NodeJS.ProcessEnv): Place {
  const depth = Number(environment.PI_CREW_DEPTH);
  return {
    depth: Number.isInteger(depth) && depth > 0 ? depth : 0,
    tree: environment.PI_CREW_TREE || undefined,
    parent: environment.PI_CREW_RUN || undefined,
  };
}

export function childEnvironment(
  place: Place,
  tree: string,
  root: string,
  run: Run,
  pinned: string,
): Record<string, string> {
  return {
    PI_CREW_DEPTH: String(place.depth + 1),
    PI_CREW_TREE: tree,
    PI_CREW_RUN: run.id,
    PI_CREW_DIR: root,
    [PINNED]: pinned,
  };
}

function hostIdentity(): string {
  try {
    return `${os.hostname()}/${fs.readlinkSync("/proc/self/ns/pid")}`;
  } catch {
    return os.hostname();
  }
}

const HOST = hostIdentity();

const SLOT_NAME = /^slot-(\d+)\.json$/;

const STAMP_DIGITS = 15;

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function alive(entry: Entry): boolean {
  return entry.host !== HOST || isAlive(entry.pid);
}

function slotIndex(name: string): number {
  return Number(SLOT_NAME.exec(name)?.[1]);
}

function touch(file: string): void {
  const time = new Date();
  try {
    fs.utimesSync(file, time, time);
  } catch {}
}

let scratchCount = 0;

function scratchPath(file: string): string {
  scratchCount += 1;
  return `${file}.${process.pid}.${scratchCount}.tmp`;
}

function writeEntry(file: string, entry: Entry, exclusive: boolean): boolean {
  const scratch = scratchPath(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(scratch, JSON.stringify(entry));
  touch(scratch);
  try {
    if (exclusive) fs.linkSync(scratch, file);
    else fs.renameSync(scratch, file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    fs.rmSync(scratch, { force: true });
  }
}

export class Tree {
  readonly id: string;
  private readonly root: string;
  private readonly session: string;
  private readonly place: Place;
  private readonly maxConcurrent: number;
  private readonly maxParked: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly treeDirectory: string;
  private readonly queueDirectory: string;
  private readonly parkedDirectory: string;
  private lastStamp = 0;

  constructor(
    root: string,
    session: string,
    place: Place,
    { maxConcurrent, maxParked, heartbeatTimeoutMs }: Config,
  ) {
    this.id = place.tree ?? session;
    this.root = root;
    this.session = session;
    this.place = place;
    this.maxConcurrent = maxConcurrent;
    this.maxParked = maxParked;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.treeDirectory = path.join(root, "trees", this.id);
    this.queueDirectory = path.join(this.treeDirectory, "queue");
    this.parkedDirectory = path.join(this.treeDirectory, "parked");
  }

  private slotFile(index: number): string {
    return path.join(this.treeDirectory, `slot-${index}.json`);
  }

  private runDirectory(runId: string): string {
    return path.join(this.root, "runs", runId);
  }

  private stale(file: string): boolean {
    try {
      const entry = readJson<Entry>(file);
      if (entry && !alive(entry)) return true;
      return Date.now() - fs.statSync(file).mtimeMs > this.heartbeatTimeoutMs;
    } catch {
      return false;
    }
  }

  private reap(file: string): void {
    const scratch = scratchPath(file);
    try {
      fs.renameSync(file, scratch);
    } catch {
      return;
    }
    if (!this.stale(scratch)) {
      try {
        fs.linkSync(scratch, file);
      } catch {}
    }
    fs.rmSync(scratch, { force: true });
  }

  private entries(directory: string, names: string[]): EntryFile[] {
    const found: EntryFile[] = [];
    for (const name of names) {
      const file = path.join(directory, name);
      if (this.stale(file)) this.reap(file);
      const entry = readJson<Entry>(file);
      if (entry) found.push({ file, entry });
    }
    return found;
  }

  private slots(): EntryFile[] {
    const names = listNames(this.treeDirectory).filter((name) =>
      SLOT_NAME.test(name),
    );
    names.sort((left, right) => slotIndex(left) - slotIndex(right));
    return this.entries(this.treeDirectory, names);
  }

  private sortedEntries(directory: string): EntryFile[] {
    const names = listNames(directory).filter((name) => name.endsWith(".json"));
    return this.entries(directory, names.sort());
  }

  private tickets(): EntryFile[] {
    return this.sortedEntries(this.queueDirectory);
  }

  private parkedEntries(): EntryFile[] {
    return this.sortedEntries(this.parkedDirectory);
  }

  private entryOf(run: Run): Entry {
    return {
      run: run.id,
      name: run.name,
      model: run.model,
      session: this.session,
      parent: this.place.parent,
      depth: this.place.depth + 1,
      pid: process.pid,
      host: HOST,
      tab: run.tab,
      agent: run.agent,
      started: run.started,
    };
  }

  private slotOf(run: Run): EntryFile | undefined {
    return this.slots().find((slot) => slot.entry.run === run.id);
  }

  private ticketOf(run: Run): EntryFile | undefined {
    return this.tickets().find((ticket) => ticket.entry.run === run.id);
  }

  private parkedOf(run: Run): EntryFile | undefined {
    return this.parkedEntries().find((parked) => parked.entry.run === run.id);
  }

  private dropParked(run: Run): void {
    const parked = this.parkedOf(run);
    if (parked) fs.rmSync(parked.file, { force: true });
  }

  private freshStamp(): number {
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1);
    return this.lastStamp;
  }

  private originalStamp(run: Run): number {
    const created = Date.parse(run.created);
    return Number.isFinite(created) ? created : this.freshStamp();
  }

  private ticketFile(run: Run, stamp: number): string {
    const digits = String(stamp).padStart(STAMP_DIGITS, "0");
    return path.join(this.queueDirectory, `${digits}-${run.id}.json`);
  }

  private enqueue(run: Run, stamp = () => this.freshStamp()): void {
    const ticket = this.ticketOf(run);
    if (ticket && !ticket.entry.reason) return;
    const file = this.ticketFile(run, stamp());
    writeEntry(file, this.entryOf(run), false);
    if (ticket && ticket.file !== file) fs.rmSync(ticket.file, { force: true });
  }

  private contenders(): EntryFile[] {
    return this.tickets().filter((ticket) => !ticket.entry.reason);
  }

  private withdraw(run: Run): void {
    const ticket = this.ticketOf(run);
    if (ticket) fs.rmSync(ticket.file, { force: true });
  }

  private claim(run: Run): boolean {
    for (let index = 0; index < this.maxConcurrent; index++) {
      if (writeEntry(this.slotFile(index), this.entryOf(run), true))
        return true;
    }
    return false;
  }

  waiting(run: Run): boolean {
    this.enqueue(run);
    const ahead = this.contenders().findIndex(
      (ticket) => ticket.entry.run === run.id,
    );
    return ahead >= this.maxConcurrent - this.slots().length;
  }

  acquire(run: Run): boolean {
    if (this.slotOf(run)) return true;
    if (this.waiting(run) || !this.claim(run)) return false;
    this.withdraw(run);
    return true;
  }

  park(run: Run, reason: ParkReason): boolean {
    if (!this.parkedOf(run) && this.parkedEntries().length >= this.maxParked)
      return false;
    writeEntry(
      path.join(this.parkedDirectory, `${run.id}.json`),
      { ...this.entryOf(run), reason },
      false,
    );
    this.withdraw(run);
    const slot = this.slotOf(run);
    if (slot) fs.rmSync(slot.file, { force: true });
    return true;
  }

  unpark(run: Run): boolean {
    if (!this.acquire(run)) return false;
    this.dropParked(run);
    return true;
  }

  parkedReason(run: Run): ParkReason | undefined {
    return this.parkedOf(run)?.entry.reason ?? this.ticketOf(run)?.entry.reason;
  }

  update(run: Run): void {
    const slot = this.slotOf(run);
    if (slot) writeEntry(slot.file, this.entryOf(run), false);
  }

  release(run: Run): void {
    this.withdraw(run);
    const slot = this.slotOf(run);
    if (slot) fs.rmSync(slot.file, { force: true });
    this.dropParked(run);
  }

  private standBy(run: Run, reason: ParkReason): void {
    if (this.park(run, reason) || this.ticketOf(run)) return;
    writeEntry(
      this.ticketFile(run, this.originalStamp(run)),
      { ...this.entryOf(run), reason },
      false,
    );
  }

  private rejoin(run: Run): void {
    this.enqueue(run, () => this.originalStamp(run));
    this.acquire(run);
  }

  private restore(run: Run): void {
    const reason = run.parked ? "parked" : run.ask ? "asking" : undefined;
    if (reason) this.standBy(run, reason);
    else this.rejoin(run);
  }

  private heldFiles(): Map<string, string[]> {
    const files = new Map<string, string[]>();
    const stored = [
      ...this.slots(),
      ...this.tickets(),
      ...this.parkedEntries(),
    ];
    for (const { entry, file } of stored)
      files.set(entry.run, [...(files.get(entry.run) ?? []), file]);
    return files;
  }

  private seated(held: string[] | undefined): boolean {
    return (held ?? []).some(
      (file) => path.dirname(file) !== this.queueDirectory,
    );
  }

  private beatRun(run: Run, held: string[] | undefined): void {
    if (held) for (const file of held) touch(file);
    if (run.status === "running" && !this.seated(held)) this.restore(run);
    else if (!held && run.status === "queued")
      this.enqueue(run, () => this.originalStamp(run));
  }

  beat(runs: Run[]): void {
    const files = this.heldFiles();
    for (const run of runs) this.beatRun(run, files.get(run.id));
  }

  renew(): void {
    if (!this.place.parent) return;
    const file = path.join(this.runDirectory(this.place.parent), "lease");
    try {
      fs.writeFileSync(file, "");
      touch(file);
    } catch {}
  }

  leased(run: Run): boolean {
    try {
      const file = readablePath(this.runDirectory(run.id), "lease");
      const age = Date.now() - fs.statSync(file).mtimeMs;
      return age <= this.heartbeatTimeoutMs / 2;
    } catch {
      return false;
    }
  }

  descendants(run: Run): Entry[] {
    const { slots, tickets, parked } = this.state();
    const subtree = new Set([run.id]);
    const found: Entry[] = [];
    let grew = true;
    while (grew) {
      grew = false;
      for (const entry of [...slots, ...tickets, ...parked]) {
        if (!entry.parent || !subtree.has(entry.parent)) continue;
        if (subtree.has(entry.run)) continue;
        subtree.add(entry.run);
        found.push(entry);
        grew = true;
      }
    }
    return found;
  }

  state(): TreeState {
    return {
      id: this.id,
      slots: this.slots().map((slot) => slot.entry),
      tickets: this.tickets().map((ticket) => ticket.entry),
      parked: this.parkedEntries().map((parked) => parked.entry),
    };
  }
}
