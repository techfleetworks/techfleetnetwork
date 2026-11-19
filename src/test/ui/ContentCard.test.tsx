// B9: ContentCard — the shared, theme-aware, presentational listing card.
// It is auth-agnostic, so these tests render it directly with no router/auth
// context: the behavior under test is "renders its props and emits its actions".
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ContentCard, type ContentCardBaseProps } from "@/components/ContentCard";

// Base props carry NO image (the image props are a discriminated union: an image
// forces an alt). Typing the factory as the image-less base props keeps
// `...overrides` from widening imageUrl to an optional that matches neither union
// arm (TS2322). Image tests add imageUrl + imageAlt at the JSX call site.
function baseProps(overrides: Partial<ContentCardBaseProps> = {}): ContentCardBaseProps {
  return {
    title: "Agile Foundations",
    status: { label: "Registration open", tone: "success" },
    meta: "Training starts on March 3",
    chips: ["Product", "Design"],
    blurb: "A short, purpose-built blurb for the card.",
    primaryAction: { label: "Join Platform", href: "/login?redirect=%2Fcourses%2Fagile" },
    secondaryAction: { label: "View details", href: "/courses/agile" },
    ...overrides,
  };
}

describe("ContentCard (B9)", () => {
  it("renders title, status, meta, chips, blurb and both actions", () => {
    render(<ContentCard {...baseProps()} />);
    expect(screen.getByRole("heading", { name: "Agile Foundations" })).toBeInTheDocument();
    expect(screen.getByText("Registration open")).toBeInTheDocument();
    expect(screen.getByText("Training starts on March 3")).toBeInTheDocument();
    expect(screen.getByText("Product")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.getByText("A short, purpose-built blurb for the card.")).toBeInTheDocument();
    expect(screen.getByText("Join Platform")).toBeInTheDocument();
    expect(screen.getByText("View details")).toBeInTheDocument();
  });

  it("exposes the image alt text to assistive technology", () => {
    render(
      <ContentCard {...baseProps()} imageUrl="/img/agile.jpg" imageAlt="Agile Foundations cover" />,
    );
    const img = screen.getByAltText("Agile Foundations cover");
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
  });

  it("shows a decorative placeholder and no <img> when there is no image", () => {
    render(<ContentCard {...baseProps()} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("falls back to the placeholder (hides the <img>) when the image URL is broken", () => {
    render(<ContentCard {...baseProps()} imageUrl="/does-not-exist.jpg" imageAlt="cover" />);
    const img = screen.getByAltText("cover");
    expect(img.style.display).toBe(""); // visible until it errors
    fireEvent.error(img);
    expect(img.style.display).toBe("none"); // hidden → muted placeholder shows
  });

  it("renders an action with an href as a link pointing at the href", () => {
    render(<ContentCard {...baseProps()} />);
    const join = screen.getByRole("link", { name: "Join Platform" });
    expect(join).toHaveAttribute("href", "/login?redirect=%2Fcourses%2Fagile");
  });

  it("renders an action with a handler as a button and calls it on click", () => {
    const onClick = vi.fn();
    render(
      <ContentCard {...baseProps({ primaryAction: { label: "Register", onClick }, secondaryAction: undefined })} />,
    );
    const register = screen.getByRole("button", { name: "Register" });
    expect(register.tagName).toBe("BUTTON");
    fireEvent.click(register);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not wrap the whole card in a single role=link (no nested interactives)", () => {
    const { container } = render(<ContentCard {...baseProps()} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.getAttribute("role")).not.toBe("link");
    // The real interactive targets are the two action links, nothing else.
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["View details", "Join Platform"]);
  });

  it("DISCRIMINATING: the title becomes a link only when titleHref is set", () => {
    // Without titleHref the title is plain text — this guards the 'no giant link'
    // test above from passing vacuously, and proves titleHref actually adds a link.
    const { rerender } = render(<ContentCard {...baseProps({ titleHref: undefined })} />);
    expect(screen.queryByRole("link", { name: "Agile Foundations" })).not.toBeInTheDocument();

    rerender(<ContentCard {...baseProps({ titleHref: "/courses/agile" })} />);
    const titleLink = screen.getByRole("link", { name: "Agile Foundations" });
    expect(titleLink).toHaveAttribute("href", "/courses/agile");
  });

  it("applies the data-card hook and clamps the blurb to two lines", () => {
    const { container } = render(<ContentCard {...baseProps({ "data-card": "content-card" })} />);
    expect(container.querySelector('[data-card="content-card"]')).not.toBeNull();
    const blurb = screen.getByText("A short, purpose-built blurb for the card.");
    expect(blurb.className).toContain("line-clamp-2");
  });

  it("renders the status badge with a theme-aware tone surface (no hardcoded color)", () => {
    render(<ContentCard {...baseProps({ status: { label: "Live", tone: "primary" } })} />);
    const badge = screen.getByText("Live");
    // token-based class, not a hex/rgb literal
    expect(badge.className).toContain("bg-primary");
    expect(/#[0-9a-f]{3,6}|rgb\(/i.test(badge.className)).toBe(false);
  });

  it("lists chips as a labeled list for assistive tech", () => {
    render(<ContentCard {...baseProps()} />);
    const list = screen.getByRole("list", { name: "Categories" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });
});
