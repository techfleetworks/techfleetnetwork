import { useState } from "react";
import { CheckCircle2, Circle, Play, BookOpen, Users, User, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  icon: React.ElementType;
  action: string;
}

export default function FirstStepsPage() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "profile",
      title: "Set Up Profile",
      description: "Fill in your name, bio, and professional background.",
      completed: false,
      icon: User,
      action: "/profile-setup",
    },
    {
      id: "onboarding-class",
      title: "Complete Onboarding Class",
      description: "Watch the onboarding video and complete the intro module.",
      completed: false,
      icon: Play,
      action: "#",
    },
    {
      id: "service-leadership",
      title: "Sign Up for Service Leadership Class",
      description: "Register for the next available service leadership session.",
      completed: false,
      icon: Users,
      action: "#",
    },
    {
      id: "user-guide",
      title: "Read or Watch the User Guide",
      description: "Review the getting started guide (minimum engagement required).",
      completed: false,
      icon: BookOpen,
      action: "#",
    },
  ]);

  const completedCount = tasks.filter((t) => t.completed).length;
  const allComplete = completedCount === tasks.length;
  const progress = (completedCount / tasks.length) * 100;

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  return (
    <div className="container-app py-8 sm:py-12 max-w-3xl">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">First Steps</h1>
        <p className="text-muted-foreground mt-1">
          Complete all four tasks below to unlock Second Steps. You can do them in any order.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">{completedCount} of {tasks.length} tasks completed</span>
          <span className="font-medium text-foreground">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="First Steps progress">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <div
              key={task.id}
              className={`card-elevated p-5 transition-all duration-200 ${
                task.completed ? "border-success/30 bg-success/5" : ""
              }`}
            >
              <div className="flex items-start gap-4">
                <button
                  onClick={() => toggleTask(task.id)}
                  className="flex-shrink-0 mt-0.5"
                  aria-label={`Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`}
                >
                  {task.completed ? (
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  ) : (
                    <Circle className="h-6 w-6 text-muted-foreground hover:text-primary transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold ${task.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {task.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{task.description}</p>
                </div>
                {task.action !== "#" ? (
                  <Link to={task.action}>
                    <Button variant="outline" size="sm" disabled={task.completed}>
                      <Icon className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled={task.completed}>
                    <Icon className="h-4 w-4 mr-1" />
                    Start
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion message */}
      {allComplete && (
        <div className="mt-8 card-elevated border-success/50 bg-success/5 p-6 text-center animate-fade-in">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h2 className="text-xl font-bold text-foreground mb-2">🎉 First Steps Complete!</h2>
          <p className="text-muted-foreground mb-4">You've unlocked the Second Steps phase.</p>
          <Link to="/journey/second-steps">
            <Button>Continue to Second Steps</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
