import { describe, it, expect } from "vitest";
import { __test_parseUaString } from "@/lib/ua-parse";

describe("ua-parse — UA-string fallback", () => {
  it("RUMBR-001: parses Chrome desktop", () => {
    const r = __test_parseUaString(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );
    expect(r.browserName).toBe("Chrome");
    expect(r.browserMajor).toBe(124);
    expect(r.osName).toBe("macOS");
    expect(r.deviceType).toBe("desktop");
  });

  it("RUMBR-002: parses Safari iOS mobile", () => {
    const r = __test_parseUaString(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    );
    expect(r.browserName).toBe("Safari");
    expect(r.osName).toBe("iOS");
    expect(r.osMajor).toBe(17);
    expect(r.deviceType).toBe("mobile");
  });

  it("parses Firefox Android", () => {
    const r = __test_parseUaString(
      "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
    );
    expect(r.browserName).toBe("Firefox");
    expect(r.osName).toBe("Android");
    expect(r.deviceType).toBe("mobile");
  });

  it("classifies known bot UAs", () => {
    const r = __test_parseUaString(
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    );
    expect(r.deviceType).toBe("bot");
  });

  it("classifies iPad as tablet", () => {
    const r = __test_parseUaString(
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/604.1",
    );
    expect(r.deviceType).toBe("tablet");
    expect(r.osName).toBe("iOS");
  });
});
