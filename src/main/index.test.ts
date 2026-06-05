import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    app: {
      getVersion: vi.fn(() => "0.0.1"),
      getPath: vi.fn(() => "/tmp/hi-bit"),
      isPackaged: false,
      on: vi.fn(),
      once: vi.fn(),
      quit: vi.fn(),
      whenReady: vi.fn(() => new Promise(() => {})),
    },
    BrowserWindow: Object.assign(vi.fn(), { getAllWindows: vi.fn(() => []) }),
    ipcMain: {
      handle: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(name, handler);
      }),
    },
    safeStorage: {},
    shell: { openExternal: vi.fn(), openPath: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    net: { fetch: vi.fn() },
  };
});

vi.mock("electron", () => electronMock);

describe("registerIpc", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.ipcMain.handle.mockClear();
  });

  it("stops preview servers on logout", async () => {
    const { registerIpc } = await import("./index");
    const services = {
      auth: { status: vi.fn(), login: vi.fn(), logout: vi.fn() },
      runtime: { disposeAll: vi.fn() },
      bitRuntime: { disposeAll: vi.fn() },
      preview: { stopAll: vi.fn() },
      profiles: {},
      projects: {},
      conversation: {},
      bit: {},
      layout: { root: "/tmp/hi-bit" },
    };

    registerIpc(services as never);
    await electronMock.handlers.get("hibit:auth:logout")?.({});

    expect(services.auth.logout).toHaveBeenCalled();
    expect(services.preview.stopAll).toHaveBeenCalled();
    expect(services.runtime.disposeAll).toHaveBeenCalled();
    expect(services.bitRuntime.disposeAll).toHaveBeenCalled();
  }, 10_000);
});

describe("isAppRendererSource", () => {
  beforeEach(() => {
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it("allows only the bundled renderer file in packaged file-url mode", async () => {
    const { isAppRendererSource } = await import("./index");

    expect(
      isAppRendererSource(
        "file:///Applications/Hi-Bit.app/Contents/Resources/app.asar/out/renderer/index.html",
        "/Applications/Hi-Bit.app/Contents/Resources/app.asar/out/renderer/index.html",
      ),
    ).toBe(true);
    expect(
      isAppRendererSource(
        "file:///Applications/Hi-Bit.app/Contents/Resources/app.asar/out/renderer/other.html",
        "/Applications/Hi-Bit.app/Contents/Resources/app.asar/out/renderer/index.html",
      ),
    ).toBe(false);
    expect(
      isAppRendererSource(
        "file:///Users/kid/Downloads/camera.html",
        "/Applications/Hi-Bit.app/Contents/Resources/app.asar/out/renderer/index.html",
      ),
    ).toBe(false);
  });

  it("allows only the parsed dev server origin in dev mode", async () => {
    process.env.ELECTRON_RENDERER_URL = "http://localhost:5173/";
    const { isAppRendererSource } = await import("./index");

    expect(isAppRendererSource("http://localhost:5173/")).toBe(true);
    expect(isAppRendererSource("http://localhost:5173/chat")).toBe(true);
    expect(isAppRendererSource("http://localhost:5173@evil.example/camera.html")).toBe(false);
  });
});

describe("isAllowedAppRendererPermission", () => {
  beforeEach(() => {
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it("allows clipboard reads only for the app renderer", async () => {
    process.env.ELECTRON_RENDERER_URL = "http://localhost:5173/";
    const { isAllowedAppRendererPermission } = await import("./index");

    expect(isAllowedAppRendererPermission("clipboard-read", "http://localhost:5173/")).toBe(true);
    expect(isAllowedAppRendererPermission("clipboard-read", "http://localhost:5173/chat")).toBe(
      true,
    );
    expect(
      isAllowedAppRendererPermission("clipboard-read", "http://localhost:5173@evil.example/"),
    ).toBe(false);
    expect(isAllowedAppRendererPermission("clipboard-read", "http://127.0.0.1:12345/")).toBe(false);
  });
});

describe("permissionRequestingSource", () => {
  it("prefers the full requesting URL over the origin", async () => {
    const { permissionRequestingSource } = await import("./index");

    expect(
      permissionRequestingSource("file://", {
        requestingUrl:
          "file:///Applications/Hi-Bit.app/Contents/Resources/app.asar/out/renderer/index.html",
      }),
    ).toBe("file:///Applications/Hi-Bit.app/Contents/Resources/app.asar/out/renderer/index.html");
  });
});
