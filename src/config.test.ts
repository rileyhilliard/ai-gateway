/**
 * Checks the API's environment defaults, port precedence and invalid settings. These unit
 * tests pin the configuration the process entry uses at startup.
 */

import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("uses defaults for an empty environment", () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      logLevel: "info",
      maxBodyBytes: 10_485_760,
      seedPath: "seed/company.json",
      openRouterKey: undefined,
      adminKey: undefined,
      demoClock: false,
    });
  });

  it("reads the seed path, the OpenRouter key and the admin key", () => {
    const config = loadConfig({
      SEED_PATH: "seed/other.json",
      OPENROUTER_KEY: "sk-or-test",
      ADMIN_KEY: "admin-test",
    });
    expect(config).toMatchObject({
      seedPath: "seed/other.json",
      openRouterKey: "sk-or-test",
      adminKey: "admin-test",
    });
  });

  it("prefers PORT_API, falls back to PORT, and treats empty values as unset", () => {
    expect(loadConfig({ PORT_API: "8080", PORT: "9000" }).port).toBe(8080);
    expect(loadConfig({ PORT: "9000" }).port).toBe(9000);
    expect(loadConfig({ PORT_API: "", PORT: "" }).port).toBe(3000);
  });

  it("treats an empty ADMIN_KEY as unset and rejects one shorter than 8 characters", () => {
    expect(loadConfig({ ADMIN_KEY: "" }).adminKey).toBeUndefined();
    expect(() => loadConfig({ ADMIN_KEY: "   " })).toThrow(ConfigError);
    expect(() => loadConfig({ ADMIN_KEY: "short" })).toThrow(/ADMIN_KEY/);
  });

  it("turns the demo clock on only for DEMO_CLOCK=1", () => {
    expect(loadConfig({ DEMO_CLOCK: "1" }).demoClock).toBe(true);
    expect(loadConfig({ DEMO_CLOCK: "0" }).demoClock).toBe(false);
    expect(() => loadConfig({ DEMO_CLOCK: "yes" })).toThrow(/DEMO_CLOCK/);
  });

  it("reads LOG_LEVEL case-insensitively", () => {
    expect(loadConfig({ LOG_LEVEL: "DEBUG" }).logLevel).toBe("debug");
  });

  it.each([
    ["PORT_API", "eighty"],
    ["PORT_API", "70000"],
    ["LOG_LEVEL", "loud"],
    ["MAX_BODY_BYTES", "0"],
  ])("rejects %s=%s with a message naming it", (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [key]: value })).toThrow(key);
  });
});
