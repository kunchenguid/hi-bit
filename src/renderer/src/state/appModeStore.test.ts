import { beforeEach, describe, expect, it } from "vitest";
import { useAppModeStore } from "./appModeStore";

describe("appModeStore", () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: "kid" });
  });

  it("starts in kid mode", () => {
    expect(useAppModeStore.getState().mode).toBe("kid");
  });

  it("enterParent flips mode to parent", () => {
    useAppModeStore.getState().enterParent();
    expect(useAppModeStore.getState().mode).toBe("parent");
  });

  it("exitParent flips mode back to kid", () => {
    useAppModeStore.getState().enterParent();
    useAppModeStore.getState().exitParent();
    expect(useAppModeStore.getState().mode).toBe("kid");
  });
});
