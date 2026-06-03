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
  });
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
});
