import { describe, it, expect, beforeEach } from "vitest";
import { MemoryCache } from "@/lib/memory-cache";

describe("MemoryCache", () => {
  beforeEach(() => {
    MemoryCache.clear();
  });

  it("returns undefined for missing keys", () => {
    expect(MemoryCache.get("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    MemoryCache.set("key", { data: 42 }, 60_000);
    expect(MemoryCache.get("key")).toEqual({ data: 42 });
  });

  it("returns undefined for expired entries", () => {
    MemoryCache.set("key", "old", -1); // already expired
    expect(MemoryCache.get("key")).toBeUndefined();
  });

  it("invalidates specific keys", () => {
    MemoryCache.set("a", 1, 60_000);
    MemoryCache.set("b", 2, 60_000);
    MemoryCache.invalidate("a");
    expect(MemoryCache.get("a")).toBeUndefined();
    expect(MemoryCache.get("b")).toBe(2);
  });

  it("invalidates by prefix", () => {
    MemoryCache.set("user:1", "alice", 60_000);
    MemoryCache.set("user:2", "bob", 60_000);
    MemoryCache.set("system:config", "val", 60_000);
    MemoryCache.invalidatePrefix("user:");
    expect(MemoryCache.get("user:1")).toBeUndefined();
    expect(MemoryCache.get("user:2")).toBeUndefined();
    expect(MemoryCache.get("system:config")).toBe("val");
  });

  it("clears all entries", () => {
    MemoryCache.set("a", 1, 60_000);
    MemoryCache.set("b", 2, 60_000);
    MemoryCache.clear();
    expect(MemoryCache.size).toBe(0);
  });

  it("reports correct size", () => {
    expect(MemoryCache.size).toBe(0);
    MemoryCache.set("a", 1, 60_000);
    MemoryCache.set("b", 2, 60_000);
    expect(MemoryCache.size).toBe(2);
  });

  it("overwrites existing values", () => {
    MemoryCache.set("key", "old", 60_000);
    MemoryCache.set("key", "new", 60_000);
    expect(MemoryCache.get("key")).toBe("new");
  });
});
