import { Link } from "react-router-dom";
import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazy-with-retry";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { Display, PageTitle, SectionTitle, SubsectionTitle, Lede, Body } from "@/components/ui/typography";
import { useTheme } from "@/components/ThemeProvider";
import worldImage from "@/assets/world.svg";
import sunImage from "@/assets/sun.svg";

const NetworkActivity = lazy(() =>
  import("@/components/NetworkActivity").then((m) => ({ default: m.NetworkActivity }))
);

function NetworkActivityFallback() {
  return (
    <section aria-label="Loading network activity" className="py-12 sm:py-16" style={{ minHeight: 800 }}>
      <div className="container-app">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-8" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <div className="container-app max-w-[1500px] pt-0 pb-8 sm:pb-12 lg:pb-16 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 animate-fade-in">
              <Display id="hero-heading" className="leading-[1.1]">
                Develop the skills and mindset for{" "}
                <span className="text-primary">success</span>
              </Display>
              <Lede className="max-w-lg text-[1rem]">
                No portfolio required. Practice with real teams. Work as a leader in service to others' growth.
              </Lede>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to="/register">
                  <Button variant="hero" size="xl">
                    Get Started
                  </Button>
                </Link>
                <a href="https://techfleet.org/overview" target="_blank" rel="noopener noreferrer">
                  <Button variant="hero-outline" size="xl">
                    Training Overview
                  </Button>
                </a>
              </div>
            </div>
            <div className="hidden lg:flex justify-center">
              <img
                src={heroSrc}
                alt={heroAlt}
                className="w-full h-auto object-contain"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </div>
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

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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