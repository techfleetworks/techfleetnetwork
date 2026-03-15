import { Rocket, ArrowRight, Users, BookOpen, GraduationCap, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { NetworkActivity } from "@/components/NetworkActivity";
import heroImage from "@/assets/hero-space.png";

export default function LandingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden" aria-labelledby="hero-heading">
        <div className="container-app py-16 sm:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 animate-fade-in">
              <h1 id="hero-heading" className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                Develop the skills and mindset for{" "}
                <span className="text-primary">success</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-lg">
                No portfolio required. Practice with real teams. Work as a leader in service to others' growth.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to="/register">
                  <Button variant="hero" size="xl">
                    <Rocket className="h-5 w-5 mr-2" />
                    Join Onboarding
                  </Button>
                </Link>
                <Link to="/training">
                  <Button variant="hero-outline" size="xl">
                    Training Overview
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="hidden lg:flex justify-center">
              <img
                src={heroImage}
                alt="Illustration of an astronaut floating in space near planets, representing the journey of learning and growth"
                className="w-full max-w-md"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t bg-card" aria-labelledby="features-heading">
        <div className="container-app py-16 sm:py-20">
          <div className="text-center mb-12">
            <h2 id="features-heading" className="text-3xl font-bold text-foreground">
              Your professional development journey
            </h2>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
              A structured, step-by-step path from onboarding to full community participation and professional growth.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="card-elevated p-6 hover:shadow-md transition-shadow duration-200"
                role="article"
              >
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t" aria-labelledby="cta-heading">
        <div className="container-app py-16 sm:py-20 text-center">
          <h2 id="cta-heading" className="text-3xl font-bold text-foreground mb-4">
            Ready to start your journey?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join the Tech Fleet community and begin building your skills with real teams and real projects.
          </p>
          <Link to="/register">
            <Button variant="hero" size="xl">
              Get Started
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

const features = [
  {
    icon: Rocket,
    title: "Guided Onboarding",
    description: "Complete structured steps from profile setup through handbooks, quizzes, and observer phases.",
  },
  {
    icon: GraduationCap,
    title: "Tiered Training",
    description: "Access courses from self-paced Tier 0 through one-on-one coaching in Tier 2.",
  },
  {
    icon: Users,
    title: "Real Team Projects",
    description: "Apply for and join real projects after completing your observer phase.",
  },
  {
    icon: BookOpen,
    title: "Growth Paths",
    description: "Follow personalized learning paths based on your skills, goals, and completed activities.",
  },
  {
    icon: Shield,
    title: "Track Accomplishments",
    description: "Earn badges, certificates, and build a shareable public profile of your achievements.",
  },
  {
    icon: Users,
    title: "Community Support",
    description: "AI chatbot, Discord integration, and mentorship throughout your journey.",
  },
];
