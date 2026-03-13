import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

async function runPreflight() {
  await new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", "authority:preflight"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`authority preflight exited from signal ${signal}`));
        return;
      }
      if ((code ?? 0) !== 0) {
        reject(new Error(`authority preflight exited with code ${code ?? 1}`));
        return;
      }
      resolve(null);
    });
  });
}

function startProcess(name, args) {
  const child = spawn(npmCommand, args, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start:`, error);
  });

  return child;
}

await runPreflight();

const processes = [
  startProcess("authority", ["run", "authority:dev"]),
  startProcess("web", ["run", "dev:web"]),
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => {
    for (const child of processes) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 1_000).unref();
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    if (signal) {
      console.error(`dev child exited from signal ${signal}`);
      shutdown(1);
      return;
    }
    if ((code ?? 0) !== 0) {
      console.error(`dev child exited with code ${code}`);
      shutdown(code ?? 1);
      return;
    }
    shutdown(0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
