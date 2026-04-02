import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket, Users, BookOpen, Briefcase, Heart, ChevronRight, ChevronLeft } from "lucide-react";

const WELCOME_KEY_PREFIX = "tf_welcome_shown_";

const slides = [
  {
    icon: Rocket,
    title: "Welcome to Tech Fleet!",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <p className="text-base font-medium text-foreground">
          We're building a world where everyone can lead through service, teams are empowered to make decisions together, and people grow without judgment.
        </p>
        <p>
          Tech Fleet is a 501(c)(3) nonprofit dedicated to building environments of empowered teams. We envision a world where people can work together with shared power and autonomy.
        </p>
        <p>
          Whether you're a new graduate, a career changer, or a senior contributor — there's a place for you here.
        </p>
      </div>
    ),
  },
  {
    icon: Heart,
    title: "Our Values",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <div>
          <span className="font-semibold text-foreground">Service</span> — We amplify voices of those unseen and unheard in the work world. Everyone plays a part in each other's growth.
        </div>
        <div>
          <span className="font-semibold text-foreground">Responsibility</span> — Anyone willing to commit and come with a learner's mind is welcome. Steward leadership is at our heart.
        </div>
        <div>
          <span className="font-semibold text-foreground">Community</span> — Members lead, design, and vote on our operations. We practice working together and developing strong connections.
        </div>
        <div>
          <span className="font-semibold text-foreground">Continuous Improvement</span> — We look for opportunities to learn and grow, instead of seeing mistakes as failures.
        </div>
      </div>
    ),
  },
  {
    icon: Users,
    title: "Who We Serve",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <p>
          We serve nonprofit organizations who need real-world project work done by passionate teams, and individuals who want to grow as leaders through hands-on practice.
        </p>
        <p>
          Our members practice seven <span className="font-semibold text-foreground">Team Practices</span> — the beliefs and behaviors of empowered teamwork:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Service Leadership</li>
          <li>Psychological Safety</li>
          <li>Agility</li>
          <li>Ownership</li>
          <li>Decision Making</li>
          <li>Continuous Improvement</li>
        </ul>
      </div>
    ),
  },
  {
    icon: Briefcase,
    title: "Our Programs",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <div>
          <span className="font-semibold text-foreground">🛠️ Project Training Program</span>
          <p className="mt-1">Real-world experience working on projects for nonprofit clients, like an internship with more support and teamwork focus. Open to everyone regardless of experience level.</p>
        </div>
        <div>
          <span className="font-semibold text-foreground">📚 Learning Labs Program</span>
          <p className="mt-1">Classes, workshops, and coaching for modern leadership skills. Hands-on learning focused on real-world scenarios with certificates of completion.</p>
        </div>
        <div>
          <span className="font-semibold text-foreground">🤝 Community Collaboration Program</span>
          <p className="mt-1">Events, peer support, networking, and collaborative group work. A place to connect, learn, and grow together.</p>
        </div>
      </div>
    ),
  },
  {
    icon: BookOpen,
    title: "How to Get Started",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <p className="text-base font-medium text-foreground">
          Your onboarding journey has 5 steps:
        </p>
        <ol className="list-decimal pl-5 space-y-2">
          <li><span className="font-semibold text-foreground">Connect to Discord</span> — Join our community workspace</li>
          <li><span className="font-semibold text-foreground">Complete Onboarding Steps</span> — Set up your profile and review key materials</li>
          <li><span className="font-semibold text-foreground">Build an Agile Mindset</span> — Learn agile philosophies and scrum methods</li>
          <li><span className="font-semibold text-foreground">Join Project Training Teams</span> — Learn how apprenticeship training works</li>
          <li><span className="font-semibold text-foreground">Join Volunteer Teams</span> — Discover how to volunteer at Tech Fleet</li>
        </ol>
        <p>
          Complete these steps to unlock project applications and start making an impact!
        </p>
      </div>
    ),
  },
];

export function WelcomeDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!user) return;
    const key = WELCOME_KEY_PREFIX + user.id;
    const shown = localStorage.getItem(key);
    if (!shown) {
      setOpen(true);
    }
  }, [user]);

  const handleClose = () => {
    if (!user) return;
    localStorage.setItem(WELCOME_KEY_PREFIX + user.id, "true");
    setOpen(false);
    setCurrentSlide(0);
  };

  const slide = slides[currentSlide];
  const SlideIcon = slide.icon;
  const isLast = currentSlide === slides.length - 1;
  const isFirst = currentSlide === 0;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" aria-labelledby="welcome-title" aria-describedby="welcome-desc">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-2">
            <SlideIcon className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle id="welcome-title" className="text-xl">{slide.title}</DialogTitle>
          <DialogDescription id="welcome-desc" className="sr-only">
            Welcome information about Tech Fleet
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">{slide.content}</div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 pt-1" role="tablist" aria-label="Slide indicators">
          {slides.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === currentSlide}
              aria-label={`Slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === currentSlide ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"}`}
              onClick={() => setCurrentSlide(i)}
            />
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          {!isFirst && (
            <Button variant="outline" className="flex-1" onClick={() => setCurrentSlide((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {isLast ? (
            <Button className="flex-1" onClick={handleClose}>
              Let's Get Started! <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => setCurrentSlide((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>

        {!isLast && (
          <button
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            Skip introduction
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
