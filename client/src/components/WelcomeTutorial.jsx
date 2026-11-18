import React, { useState, useEffect } from 'react';
import { Users, MessageSquare, Calendar, Rocket } from 'lucide-react';

const STORAGE_KEY = 'welcome-tutorial-seen';

const steps = [
  {
    icon: Rocket,
    title: 'Welcome to Flinders Collab!',
    description: 'Your all-in-one platform for university teamwork. Let\u2019s show you around.',
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    icon: Users,
    title: 'Create or Join Rooms',
    description: 'Create team rooms for your courses or join existing ones with an invite code.',
    gradient: 'from-indigo-500 to-violet-600',
  },
  {
    icon: MessageSquare,
    title: 'Chat, Share & Collaborate',
    description: 'Chat with your team, share files, and schedule events \u2014 all in one place.',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    icon: Calendar,
    title: 'Get Started',
    description: 'Create your first room or join one with an invite code. You\u2019re all set!',
    gradient: 'from-purple-500 to-pink-600',
  },
];

export default function WelcomeTutorial() {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const interactiveActive = window.__interactiveTutorialState?.phase !== undefined
      && window.__interactiveTutorialState?.phase !== 'idle';
    if (interactiveActive) return;
    setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setVisible(false);
  };

  const goNext = () => {
    if (current === steps.length - 1) {
      dismiss();
      return;
    }
    setAnimating(true);
    setTimeout(() => {
      setCurrent((prev) => prev + 1);
      setAnimating(false);
    }, 200);
  };

  if (!visible) return null;

  const step = steps[current];
  const Icon = step.icon;
  const isLast = current === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[99997] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`relative mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl transition-all duration-200 ${
          animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Gradient header */}
        <div className={`flex items-center justify-center rounded-t-2xl bg-gradient-to-r ${step.gradient} py-10`}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <Icon className="h-8 w-8 text-white" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-5 pb-4 text-center">
          <h2 className="text-lg font-bold text-slate-900">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.description}</p>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-1.5 pb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? 'w-6 bg-indigo-500' : 'w-1.5 bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
          <button
            onClick={dismiss}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={goNext}
            className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition-all active:scale-95"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
