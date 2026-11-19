import { describe, it, expect } from "vitest";
import { classFormSchema } from "@/lib/validators/class";

const BASE = {
  title: "AI Enabled Systems design",
  track: "advanced_training" as const,
};

describe("classFormSchema — new optional rich-text fields", () => {
  it("defaults curriculum, reading_assignments, class_expectations to empty string", () => {
    const parsed = classFormSchema.parse(BASE);
    expect(parsed.curriculum).toBe("");
    expect(parsed.reading_assignments).toBe("");
    expect(parsed.class_expectations).toBe("");
  });

  it("accepts safe HTML in all three new fields", () => {
    const parsed = classFormSchema.parse({
      ...BASE,
      curriculum: "<h3>Module 1</h3><p>Intro</p>",
      reading_assignments: "<ul><li>Paper A</li></ul>",
      class_expectations: "<p>Show up. Be kind.</p>",
    });
    expect(parsed.curriculum).toContain("Module 1");
    expect(parsed.reading_assignments).toContain("Paper A");
    expect(parsed.class_expectations).toContain("Be kind");
  });

  it("strips script tags from new fields at the validator boundary", () => {
    const parsed = classFormSchema.parse({
      ...BASE,
      curriculum: "<p>ok</p><script>alert(1)</script>",
      reading_assignments: "<script>evil()</script><p>read</p>",
      class_expectations: "<p>fine</p><script>x()</script>",
    });
    expect(parsed.curriculum).not.toMatch(/<script/i);
    expect(parsed.reading_assignments).not.toMatch(/<script/i);
    expect(parsed.class_expectations).not.toMatch(/<script/i);
  });

  it("rejects curriculum above the 50,000 character ceiling", () => {
    const out = classFormSchema.safeParse({ ...BASE, curriculum: "x".repeat(50_001) });
    expect(out.success).toBe(false);
  });

  it("rejects reading_assignments above the 20,000 character ceiling", () => {
    const out = classFormSchema.safeParse({ ...BASE, reading_assignments: "x".repeat(20_001) });
    expect(out.success).toBe(false);
  });

  it("rejects class_expectations above the 20,000 character ceiling", () => {
    const out = classFormSchema.safeParse({ ...BASE, class_expectations: "x".repeat(20_001) });
    expect(out.success).toBe(false);
  });

  it("defaults short_description to an empty string", () => {
    expect(classFormSchema.parse(BASE).short_description).toBe("");
  });

  it("accepts a short_description at the 140-character cap", () => {
    const out = classFormSchema.safeParse({ ...BASE, short_description: "x".repeat(140) });
    expect(out.success).toBe(true);
  });

  it("rejects a short_description above 140 characters", () => {
    const out = classFormSchema.safeParse({ ...BASE, short_description: "x".repeat(141) });
    expect(out.success).toBe(false);
  });

  it("rejects an XSS payload in short_description", () => {
    const out = classFormSchema.safeParse({ ...BASE, short_description: "<script>alert(1)</script>" });
    expect(out.success).toBe(false);
  });

  it("defaults deliverables to an empty array", () => {
    expect(classFormSchema.parse(BASE).deliverables).toEqual([]);
  });

  it("accepts a deliverables array of plain strings", () => {
    const out = classFormSchema.safeParse({
      ...BASE,
      deliverables: ["Portfolio case study", "Deployed demo"],
    });
    expect(out.success).toBe(true);
  });

  it("rejects more than 30 deliverables", () => {
    const out = classFormSchema.safeParse({
      ...BASE,
      deliverables: Array.from({ length: 31 }, (_, i) => `d${i}`),
    });
    expect(out.success).toBe(false);
  });

  it("rejects a deliverable above the 200-character item cap", () => {
    const out = classFormSchema.safeParse({ ...BASE, deliverables: ["x".repeat(201)] });
    expect(out.success).toBe(false);
  });

  it("rejects an XSS payload in a deliverable", () => {
    const out = classFormSchema.safeParse({ ...BASE, deliverables: ["<script>alert(1)</script>"] });
    expect(out.success).toBe(false);
  });

  it("still requires title (existing behavior preserved)", () => {
    const out = classFormSchema.safeParse({ track: "basic_training" });
    expect(out.success).toBe(false);
  });
});
