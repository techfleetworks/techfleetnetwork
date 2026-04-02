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
import { ChevronRight, ChevronLeft } from "lucide-react";
import welcomeSlide1 from "@/assets/welcome-slide-1.png";
import welcomeSlide2 from "@/assets/welcome-slide-2.png";
import welcomeSlide3 from "@/assets/welcome-slide-3.png";
import welcomeSlide4 from "@/assets/welcome-slide-4.png";
import welcomeSlide5 from "@/assets/welcome-slide-5.png";

const WELCOME_KEY_PREFIX = "tf_welcome_shown_";

const slides = [
  {
    image: welcomeSlide1,
    title: "Welcome to Tech Fleet! 🎉",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <p className="text-base font-medium text-foreground">
          Hi there! We're so glad you're here.
        </p>
        <p>
          Tech Fleet is a nonprofit where people learn how to work well on teams. We believe everyone can be a leader — not by telling others what to do, but by helping each other grow.
        </p>
        <p>
          No matter where you are in your career — just starting out, switching paths, or already experienced — you belong here.
        </p>
      </div>
    ),
  },
  {
    image: welcomeSlide2,
    title: "What We Care About",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <div>
          <span className="font-semibold text-foreground">Service</span> — We help each other grow. Everyone has something to give, and we make sure every voice is heard.
        </div>
        <div>
          <span className="font-semibold text-foreground">Responsibility</span> — If you're ready to learn, you're welcome here. We all take care of each other.
        </div>
        <div>
          <span className="font-semibold text-foreground">Community</span> — Members help decide how things work here. We build real friendships and strong teams.
        </div>
        <div>
          <span className="font-semibold text-foreground">Always Getting Better</span> — Mistakes aren't failures — they're how we learn. We're always looking for ways to improve.
        </div>
      </div>
    ),
  },
  {
    image: welcomeSlide3,
    title: "Who We Help",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <p>
          We help two groups of people: <span className="font-semibold text-foreground">nonprofits</span> that need project work done, and <span className="font-semibold text-foreground">people like you</span> who want to build real skills by working on real teams.
        </p>
        <p>
          Along the way, you'll practice six important <span className="font-semibold text-foreground">Team Habits</span>:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Leading by helping others</li>
          <li>Making it safe to try new things</li>
          <li>Working step by step</li>
          <li>Taking ownership together</li>
          <li>Making decisions as a group</li>
          <li>Always learning and improving</li>
        </ul>
      </div>
    ),
  },
  {
    icon: Briefcase,
    title: "What You Can Do Here",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <div>
          <span className="font-semibold text-foreground">🛠️ Project Training</span>
          <p className="mt-1">Work on real projects for nonprofit clients. It's like an internship, but with more support and teamwork. Anyone can join — no experience needed!</p>
        </div>
        <div>
          <span className="font-semibold text-foreground">📚 Learning Labs</span>
          <p className="mt-1">Take classes and workshops to learn leadership skills. You'll work on hands-on projects and earn certificates when you finish.</p>
        </div>
        <div>
          <span className="font-semibold text-foreground">🤝 Community</span>
          <p className="mt-1">Meet other members, go to events, join group projects, and help each other out. This is your space to connect and grow.</p>
        </div>
      </div>
    ),
  },
  {
    icon: BookOpen,
    title: "Here's How to Get Started",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground text-left">
        <p className="text-base font-medium text-foreground">
          Just follow these 5 steps to get going:
        </p>
        <ol className="list-decimal pl-5 space-y-2">
          <li><span className="font-semibold text-foreground">Connect to Discord</span> — This is where our community hangs out</li>
          <li><span className="font-semibold text-foreground">Finish Your Onboarding</span> — Set up your profile and check out key info</li>
          <li><span className="font-semibold text-foreground">Learn About Agile</span> — Find out how teams work together step by step</li>
          <li><span className="font-semibold text-foreground">Join Project Training</span> — See how our team projects work</li>
          <li><span className="font-semibold text-foreground">Join Volunteer Teams</span> — Learn how to volunteer with us</li>
        </ol>
        <p>
          Once you finish these steps, you can apply to join a project and start making a difference!
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
