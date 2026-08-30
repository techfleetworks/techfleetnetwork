// bdd-gate coverage: src/services/explore.service.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateQuery, writeCache } from "@/services/explore.service";
import { invokeEdge } from "@/lib/edge/invokeEdge";

// writeCache routes through invokeEdge (Phase 1 migration); mock it so both the
// happy path and the best-effort error-swallow can be exercised.
vi.mock("@/lib/edge/invokeEdge", () => ({ invokeEdge: vi.fn() }));

// Mock supabase to prevent import errors
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      insert: () => Promise.resolve({ error: null }),
      upsert: () => Promise.resolve({ error: null }),
    }),
    functions: { invoke: () => Promise.resolve({ data: { success: false }, error: null }) },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

describe("ExploreService", () => {
  describe("validateQuery", () => {
    it("rejects empty query", () => {
      const result = validateQuery("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 2");
    });

    it("rejects single-char query", () => {
      const result = validateQuery("a");
      expect(result.valid).toBe(false);
    });

    it("accepts valid query", () => {
      const result = validateQuery("learn agile");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("learn agile");
    });

    it("trims whitespace", () => {
      const result = validateQuery("  design sprint  ");
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe("design sprint");
    });

    it("sanitises XSS in query", () => {
      const result = validateQuery('<script>alert("xss")</script>hello');
      expect(result.valid).toBe(true);
      expect(result.sanitized).not.toContain("<script>");
      expect(result.sanitized).toContain("hello");
    });

    it("rejects oversized queries (> 1000 bytes)", () => {
      const huge = "a".repeat(1001);
      const result = validateQuery(huge);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too long");
    });
  });

  describe("writeCache (invokeEdge migration)", () => {
    beforeEach(() => vi.mocked(invokeEdge).mockReset());

    it("routes the cache write through invokeEdge with the expected body", async () => {
      vi.mocked(invokeEdge).mockResolvedValue(undefined as never);
      await writeCache("norm-key", "# markdown");
      expect(invokeEdge).toHaveBeenCalledWith("write-exploration-cache", {
        body: { query_normalized: "norm-key", response_markdown: "# markdown" },
      });
    });

    it("is best-effort — swallows an edge failure and never throws", async () => {
      vi.mocked(invokeEdge).mockImplementationOnce(async () => {
        throw new Error("edge down");
      });
      let threw = false;
      try {
        await writeCache("k", "md");
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
      expect(invokeEdge).toHaveBeenCalledTimes(1);
    });
  });
});
