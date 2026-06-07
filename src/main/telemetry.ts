// Anonymous, best-effort usage telemetry sent to a self-hosted Umami instance.
//
// Source/dev/test builds are no-op unless a website id is explicitly supplied.
// Release builds inject the host and website id at build time through
// electron.vite.config.ts. Events never include kid names, prompts, profile ids,
// creation ids, file contents, attachment ids, URLs, or paths.

const HARDCODED_FALLBACK_HOST = "https://a.kunchenguid.com";
const UMAMI_PATH = "/api/send";
const DEFAULT_HOSTNAME = "app";
const DEFAULT_TITLE = "Hi-Bit";
const DEFAULT_APP = "hi-bit";
const DEFAULT_REQUEST_TIMEOUT_MS = 1_000;
const MAX_EVENT_NAME_LENGTH = 64;
const MAX_FIELD_STRING_LENGTH = 80;
const ALLOWED_FIELD_NAMES = new Set(["source", "status", "platform", "arch", "version"]);

export type TelemetryEnv = Record<string, string | undefined>;

export type ResolveTelemetryConfigInput = {
  env: TelemetryEnv;
  buildHost: string;
  buildWebsiteID: string;
};

export type ResolvedTelemetryConfig = {
  enabled: boolean;
  host: string;
  websiteID: string;
};

export type TelemetryClientConfig = {
  enabled: boolean;
  host: string;
  websiteID: string;
  app?: string;
  version: string;
  platform?: string;
  arch?: string;
  fetch?: typeof fetch;
  requestTimeoutMs?: number;
};

export type TelemetryFields = Record<string, unknown>;

export interface TelemetryClient {
  track(name: string, fields?: TelemetryFields): void;
  pageview(path: string, fields?: TelemetryFields): void;
  close(timeoutMs?: number): Promise<void>;
}

export function resolveTelemetryConfig(
  input: ResolveTelemetryConfigInput,
): ResolvedTelemetryConfig {
  const optOut = String(input.env.HIBIT_TELEMETRY || "")
    .trim()
    .toLowerCase();
  if (optOut === "0" || optOut === "false" || optOut === "off") {
    return { enabled: false, host: "", websiteID: "" };
  }

  const websiteID =
    String(input.env.HIBIT_UMAMI_WEBSITE_ID || "").trim() || input.buildWebsiteID.trim();
  if (!websiteID) {
    return { enabled: false, host: "", websiteID: "" };
  }

  const host =
    String(input.env.HIBIT_UMAMI_HOST || "").trim() ||
    input.buildHost.trim() ||
    HARDCODED_FALLBACK_HOST;
  return { enabled: true, host, websiteID };
}

// These references are replaced at build time by electron-vite's `define`.
// In source/dev/test they read as undefined and the client stays a no-op.
export function getBuildTimeUmamiHost(): string {
  return process.env.HIBIT_BUILD_UMAMI_HOST || "";
}

export function getBuildTimeUmamiWebsiteID(): string {
  return process.env.HIBIT_BUILD_UMAMI_WEBSITE_ID || "";
}

export function createTelemetryClient(config: TelemetryClientConfig): TelemetryClient {
  if (!config.enabled || !config.websiteID) {
    return new NoopTelemetryClient();
  }
  const endpoint = normalizeEndpoint(config.host);
  if (!endpoint) {
    return new NoopTelemetryClient();
  }
  return new HttpTelemetryClient(endpoint, config);
}

let defaultClient: TelemetryClient | null = null;

export type InitTelemetryInput = {
  app?: string;
  version: string;
  platform?: string;
  arch?: string;
  env?: TelemetryEnv;
  fetch?: typeof fetch;
};

export function initDefaultTelemetry(init: InitTelemetryInput): TelemetryClient {
  const resolved = resolveTelemetryConfig({
    env: init.env || process.env,
    buildHost: getBuildTimeUmamiHost(),
    buildWebsiteID: getBuildTimeUmamiWebsiteID(),
  });
  defaultClient = createTelemetryClient({
    enabled: resolved.enabled,
    host: resolved.host,
    websiteID: resolved.websiteID,
    app: init.app,
    version: init.version,
    platform: init.platform,
    arch: init.arch,
    fetch: init.fetch,
  });
  return defaultClient;
}

export function startAppTelemetry(init: InitTelemetryInput): TelemetryClient {
  const client = initDefaultTelemetry({ ...init, app: init.app || DEFAULT_APP });
  client.track("app_start");
  client.pageview("/app");
  return client;
}

export function getDefaultTelemetry(): TelemetryClient {
  return defaultClient || new NoopTelemetryClient();
}

export function resetDefaultTelemetryForTests(): void {
  defaultClient = null;
}

class NoopTelemetryClient implements TelemetryClient {
  track(): void {}

  pageview(): void {}

  async close(): Promise<void> {}
}

class HttpTelemetryClient implements TelemetryClient {
  private readonly websiteID: string;
  private readonly app: string;
  private readonly version: string;
  private readonly platform: string;
  private readonly arch: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly inFlight = new Set<Promise<void>>();
  private closed = false;

  constructor(
    private readonly endpoint: string,
    config: TelemetryClientConfig,
  ) {
    this.websiteID = config.websiteID;
    this.app = config.app || DEFAULT_APP;
    this.version = config.version;
    this.platform = config.platform || "";
    this.arch = config.arch || "";
    this.fetchImpl = config.fetch || fetch;
    this.timeoutMs = config.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
    this.userAgent = `${this.app}/${config.version} telemetry`;
  }

  track(name: string, fields: TelemetryFields = {}): void {
    if (this.closed) return;
    const eventName = normalizeEventName(name);
    if (!eventName) return;
    this.send(eventName, eventURL(this.app, eventName), fields);
  }

  pageview(path: string, fields: TelemetryFields = {}): void {
    if (this.closed) return;
    this.send("", normalizePagePath(path), fields);
  }

  async close(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<void> {
    this.closed = true;
    if (this.inFlight.size === 0 || timeoutMs <= 0) return;
    const drained = Promise.allSettled(Array.from(this.inFlight)).then(() => undefined);
    await Promise.race([
      drained,
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
  }

  private send(name: string, url: string, fields: TelemetryFields): void {
    const data = sanitizeFields(fields);
    if (this.platform && data.platform === undefined) data.platform = this.platform;
    if (this.arch && data.arch === undefined) data.arch = this.arch;
    if (data.version === undefined) data.version = this.version;

    const payload = {
      type: "event",
      payload: {
        website: this.websiteID,
        hostname: DEFAULT_HOSTNAME,
        title: DEFAULT_TITLE,
        url,
        name,
        data,
        timestamp: Math.floor(Date.now() / 1000),
      },
    };

    let body: string;
    try {
      body = JSON.stringify(payload);
    } catch {
      return;
    }

    const request = this.fire(body);
    this.inFlight.add(request);
    void request.finally(() => this.inFlight.delete(request));
  }

  private async fire(body: string): Promise<void> {
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      try {
        await response.body?.cancel?.();
      } catch {
        // Best effort only.
      }
    } catch {
      // Telemetry must never affect app behavior.
    }
  }
}

function sanitizeFields(fields: TelemetryFields): TelemetryFields {
  const data: TelemetryFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELD_NAMES.has(key)) continue;
    if (typeof value === "string") {
      data[key] = value.slice(0, MAX_FIELD_STRING_LENGTH);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      data[key] = value;
    }
  }
  return data;
}

function normalizeEndpoint(host: string): string | null {
  let url: URL;
  try {
    url = new URL(String(host || "").trim());
  } catch {
    return null;
  }
  if (!url.protocol || !url.host) return null;
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith(UMAMI_PATH) ? pathname : pathname + UMAMI_PATH;
  return url.toString();
}

function normalizeEventName(name: string): string | null {
  const trimmed = String(name || "").trim();
  if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) return null;
  return trimmed.slice(0, MAX_EVENT_NAME_LENGTH);
}

function eventURL(app: string, name: string): string {
  if (!name) return `app://${app}`;
  return `app://${app}/${name.replace(/\./g, "/")}`;
}

function normalizePagePath(path: string): string {
  const trimmed = String(path || "").trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
