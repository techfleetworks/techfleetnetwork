import { Link } from "react-router-dom";
import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazy-with-retry";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Display, PageTitle, SectionTitle, SubsectionTitle, Lede, Body } from "@/components/ui/typography";
import { useTheme } from "@/components/ThemeProvider";
import { PUBLIC_NAV_ITEMS } from "@/components/PublicNavItems";
import heroBg from "@/assets/bg_techfleet_network.svg";
// Stable public URLs (not Vite-hashed) so index.html <link rel="preload">
// can warm the browser cache before React mounts — eliminates hero pop-in.
const worldImage = "/hero/world.svg";
const sunImage = "/hero/sun.svg";


// Intrinsic dimensions reserve layout space from the very first paint so
// the image renders atomically in place (no CLS, no "snap").
const HERO_W = 514;
const HERO_H = 500;

const NetworkActivity = lazy(() =>
  import("@/components/NetworkActivity").then((m) => ({ default: m.NetworkActivity }))
);

// B13 — public-home discovery. The logged-out landing page gives a visitor a
// concrete path INTO the two public surfaces (Courses, Project Openings) rather
// than only "Get Started". The hrefs + icons are OWNED by PUBLIC_NAV_ITEMS (the
// single nav/policy source, A5/B8); this map adds only the richer landing-page
// copy, keyed by that href. A test holds this section to exactly the non-Home
// public nav hrefs, so a newly-public surface can't silently miss discovery.
const DISCOVERY_COPY: Record<string, { heading: string; blurb: string }> = {
  "/courses": {
    heading: "Browse free courses",
    blurb:
      "Start with the mindset and skills of empowered teams. Open any course and read what it covers — no account needed.",
  },
  "/project-openings": {
    heading: "See project openings",
    blurb:
      "Find a real cross-functional team working with a nonprofit client, and see which roles are open to join.",
  },
};

const DISCOVERY_ITEMS = PUBLIC_NAV_ITEMS.filter((item) => DISCOVERY_COPY[item.href]);

function NetworkActivityFallback() {
  return (
    <section aria-label="Loading network activity" className="py-12 sm:py-16" style={{ minHeight: 800 }}>
      <div className="container-app">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-8" />
        <div className="grid min-[560px]:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-elevated p-5 h-20 animate-pulse bg-muted/30" />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { resolvedTheme } = useTheme();
  const heroSrc = resolvedTheme === "light" ? sunImage : worldImage;
  const heroAlt =
    resolvedTheme === "light"
      ? "Illustration of a stylized sun, representing growth and energy"
      : "Illustration of a stylized world map, representing global community";
  return (
    <div>
      <SEO
        title="Tech Fleet — Professional Training Platform"
        description="Develop the skills and mindset for success. Practice with real teams and grow as a leader at Tech Fleet."
        canonicalPath="/"
      />
      {/* Hero Section */}
      <section className="relative overflow-hidden flex items-center min-h-[calc(100svh-5rem)]" aria-labelledby="hero-heading">
        {resolvedTheme === "dark" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
        )}

        <div className="container-app max-w-[1500px] pt-0 pb-8 sm:pb-12 lg:pb-16 w-full relative">

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Mobile/tablet: image above headline */}
            <div className="flex lg:hidden justify-center order-first">
              <img
                src={heroSrc}
                alt={heroAlt}
                width={HERO_W}
                height={HERO_H}
                className="w-full max-w-[260px] sm:max-w-[340px] md:max-w-[420px] h-auto object-contain"
                loading="eager"
                fetchPriority="high"
                decoding="sync"
              />
            </div>
            <div className="space-y-6 animate-fade-in">
              <Display id="hero-heading" className="leading-[1.1]">
                Welcome to the network for{" "}
                <span className="text-primary">empowered</span>{" "}
                team spaces
              </Display>
              <Lede className="max-w-lg text-[1rem]">
                No portfolio required. Practice teamwork with other members and real nonprofit clients.
              </Lede>
              <div className="flex flex-col lg:flex-row flex-wrap gap-3 pt-2">
                <Link to="/register" className="w-full lg:w-auto">
                  <Button variant="hero" size="xl">
                    Get Started
                  </Button>
                </Link>
                <a href="https://techfleet.org/overview" target="_blank" rel="noopener noreferrer" className="w-full lg:w-auto">
                  <Button variant="hero-outline" size="xl">
                    Training Overview
                  </Button>
                </a>
              </div>
            </div>
            {/* Desktop: image to the right of headline */}
            <div className="hidden lg:flex justify-center">
              <img
                src={heroSrc}
                alt={heroAlt}
                width={HERO_W}
                height={HERO_H}
                className="w-full h-auto object-contain"
                loading="eager"
                fetchPriority="high"
                decoding="sync"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Discovery Section (B13) — concrete entry points into the public surfaces */}
      <section className="border-t" aria-labelledby="discover-heading">
        <div className="container-app py-16 sm:py-20">
          <div className="w-full max-w-[700px] mb-9">
            <PageTitle id="discover-heading">
              Explore before you join, no account needed
            </PageTitle>
            <Body className="text-muted-foreground">
              See what's inside. Browse the free courses and the project teams looking for members, all without signing in.
            </Body>
          </div>

          <div className="grid min-[560px]:grid-cols-2 gap-6">
            {DISCOVERY_ITEMS.map((item) => {
              const copy = DISCOVERY_COPY[item.href];
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className="tf-card p-6 block group transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="h-6 w-6 text-primary shrink-0" aria-hidden="true" />
                    <SubsectionTitle className="group-hover:text-primary">{copy.heading}</SubsectionTitle>
                  </div>
                  <Body className="text-muted-foreground">{copy.blurb}</Body>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t bg-card" aria-labelledby="features-heading">
        <div className="container-app py-16 sm:py-20">
          <div className="w-full max-w-[700px] mb-9">
            <PageTitle id="features-heading">
              Get ready for the future of work with Tech Fleet
            </PageTitle>
            <Body className="text-muted-foreground">
              Tech Fleet's a nonprofit on a mission to build empowered team spaces in the world. We're changing the ways we work together. You, too, can be a part of it.
            </Body>
          </div>

          <div className="grid min-[560px]:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="tf-card p-6 transition-shadow duration-200"
                role="article"
              >
                <SubsectionTitle>{feature.title}</SubsectionTitle>
                <Body className="text-muted-foreground">{feature.description}</Body>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Network Activity Section — lazy loaded with reserved space */}
      <section className="border-t bg-muted/30" style={{ minHeight: 800 }}>
        <Suspense fallback={<NetworkActivityFallback />}>
          <NetworkActivity />
        </Suspense>
      </section>
    </div>
  );
}

const features = [
  {
    title: "Community Involvement",
    description: "Get resources, tools, and peer support from thousands of Tech Fleet community members.",
  },
  {
    title: "Growth Paths",
    description: "Focus on the skills, practices, and activities that matter to you for your growth.",
  },
  {
    title: "Guided Onboarding",
    description: "Get everything you need to decide how to start all in one place.",
  },
  {
    title: "Real Team Projects",
    description: "Train on agile teams with real nonprofit clients and practice building empowered team spaces together.",
  },
  {
    title: "Tiered Training",
    description: "Start with the basics, and move up from there as you practice empowered team.",
  },
  {
    title: "Track Accomplishments",
    description: "Keep track of what you've done and why it matters as you move through the Tech Fleet community.",
  },
];