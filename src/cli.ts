import { DEFAULT_PORT, PROJECTS_FILE, SCHEDULE_FILE } from "./paths";
import { addProject } from "./registry/registry";
import { makeServer } from "./server/server";

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function portOpen(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/api/projects`);
    return true;
  } catch {
    return false;
  }
}

// Relaunch self as a detached `serve` process that outlives this short-lived
// `register` invocation (called from session-start hooks).
// Dev: argv[1] is the entry script (index.ts) -> [bun, index.ts, serve].
// Compiled: exe is the entry -> [exe, serve].
function launchServerDetached(port: number): void {
  const entry = process.argv[1];
  const compiled = !entry || !entry.endsWith(".ts");
  const serveArgs = compiled
    ? [process.execPath, "serve", "--port", String(port)]
    : [process.execPath, entry!, "serve", "--port", String(port)];

  if (process.platform === "win32") {
    // PowerShell Start-Process fully detaches the server so it survives once
    // `register` exits. Single-quote each arg to tolerate spaces in paths.
    const exe = serveArgs[0]!;
    const argList = serveArgs.slice(1).map((a) => `'${a}'`).join(",");
    const psCmd = `Start-Process -FilePath '${exe}' -ArgumentList ${argList} -WindowStyle Hidden`;
    Bun.spawn(["powershell", "-NoProfile", "-Command", psCmd], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } else {
    Bun.spawn(serveArgs, { stdio: ["ignore", "ignore", "ignore"] }).unref();
  }
}

// Open the dashboard in the default browser. Only called on a cold start so
// repeated sessions don't spam new tabs.
function openBrowser(port: number): void {
  const url = `http://127.0.0.1:${port}`;
  if (process.platform === "win32") {
    Bun.spawn(["powershell", "-NoProfile", "-Command", `Start-Process '${url}'`], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } else {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    Bun.spawn([cmd, url], { stdio: ["ignore", "ignore", "ignore"] }).unref();
  }
}

// Poll until the server is accepting requests (so the browser doesn't open
// before it's listening). Mirrors clawd's waitForClawdPort.
async function waitForPort(port: number, timeoutMs = 6000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await Bun.sleep(150);
  }
  return false;
}

export async function run(argv: string[]): Promise<void> {
  const [cmd, ...args] = argv;
  const port = Number(getFlag(args, "--port") ?? DEFAULT_PORT);

  if (cmd === "version") {
    console.log("agentboard 0.1.0");
    return;
  }

  if (cmd === "serve") {
    makeServer({ port, projectsFile: PROJECTS_FILE, scheduleFile: SCHEDULE_FILE });
    console.log(`AgentBoard on http://127.0.0.1:${port}`);
    return;
  }

  if (cmd === "register") {
    const path = args[0];
    if (!path) {
      console.error("usage: agentboard register <path> [--tool claude|codex]");
      process.exit(1);
    }
    await addProject(path, getFlag(args, "--tool"));
    if (!(await portOpen(port))) {
      launchServerDetached(port);
      // cold start: wait until it's listening, then surface the board once
      if (await waitForPort(port)) openBrowser(port);
    }
    console.log(`registered ${path}`);
    return;
  }

  console.error("usage: agentboard <serve|register|version>");
  process.exit(1);
}
