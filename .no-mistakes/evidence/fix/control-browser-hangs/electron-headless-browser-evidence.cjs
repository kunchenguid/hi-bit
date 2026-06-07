const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const evidenceDir = __dirname;
const userDataDir = path.join(evidenceDir, "electron-user-data");
const reportPath = path.join(evidenceDir, "electron-headless-browser-report.json");
const screenshotPath = path.join(evidenceDir, "electron-headless-loaded-page.png");

app.setPath("userData", userDataDir);
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("no-sandbox");

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/creation") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html>
          <head><title>Bot Headless Preview</title></head>
          <body style="margin:0;font-family:sans-serif;background:#14213d;color:white;display:grid;place-items:center;height:100vh">
            <main style="text-align:center">
              <h1>Creation preview loaded</h1>
              <p id="status">Headless browser can attach after navigation.</p>
            </main>
          </body>
        </html>`);
      return;
    }
    if (req.url === "/stuck") {
      // Accept the request but never finish it, matching a preview that stalls.
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function createWindow() {
  return new BrowserWindow({
    show: false,
    width: 900,
    height: 560,
    webPreferences: {
      offscreen: true,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.then(
      (value) => ({ status: "resolved", value }),
      (error) => ({ status: "rejected", error: String(error && error.message ? error.message : error) }),
    ),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ status: "timed-out", label }), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function run() {
  await fs.mkdir(evidenceDir, { recursive: true });
  const server = await startServer();
  const port = server.address().port;
  const creationUrl = `http://127.0.0.1:${port}/creation`;
  const stuckUrl = `http://127.0.0.1:${port}/stuck`;
  const results = {
    createdAt: new Date().toISOString(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    creationUrl,
    scenarios: [],
  };

  try {
    const oldOrderWindow = createWindow();
    oldOrderWindow.webContents.debugger.attach("1.3");
    const oldOrder = await withTimeout(
      oldOrderWindow.webContents.debugger.sendCommand("Page.enable"),
      1000,
      "Page.enable before first navigation",
    );
    results.scenarios.push({
      name: "cdp-command-before-first-navigation",
      outcome: oldOrder.status,
      demonstrates: "This is the real Electron operation that used to be attempted before the page committed.",
    });
    oldOrderWindow.destroy();

    const fixedWindow = createWindow();
    await fixedWindow.loadURL(creationUrl);
    fixedWindow.webContents.debugger.attach("1.3");
    const pageEnableAfterLoad = await withTimeout(
      fixedWindow.webContents.debugger.sendCommand("Page.enable"),
      1000,
      "Page.enable after navigation",
    );
    const runtimeAfterLoad = await withTimeout(
      fixedWindow.webContents.debugger.sendCommand("Runtime.evaluate", {
        expression: "document.querySelector('#status')?.textContent",
        returnByValue: true,
      }),
      1000,
      "Runtime.evaluate after navigation",
    );
    const image = await fixedWindow.capturePage();
    await fs.writeFile(screenshotPath, image.toPNG());
    results.scenarios.push({
      name: "load-url-then-attach-controller",
      pageEnableOutcome: pageEnableAfterLoad.status,
      runtimeEvaluateOutcome: runtimeAfterLoad.status,
      pageText: runtimeAfterLoad.value && runtimeAfterLoad.value.result && runtimeAfterLoad.value.result.value,
      screenshot: screenshotPath,
      demonstrates: "A real offscreen Electron tab loads the creation URL, then CDP attaches and reads the page without hanging.",
    });
    fixedWindow.destroy();

    const stuckWindow = createWindow();
    const stuckLoad = await withTimeout(stuckWindow.loadURL(stuckUrl), 1200, "stalled loadURL");
    results.scenarios.push({
      name: "stalled-preview-load",
      outcome: stuckLoad.status,
      demonstrates: "A real Electron loadURL can remain pending on a stalled preview, so the host deadline is needed to return control to the bot.",
    });
    stuckWindow.destroy();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

app.whenReady().then(run).then(() => app.quit(), (error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
