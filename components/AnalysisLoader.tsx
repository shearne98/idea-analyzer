"use client";

import { useEffect, useState } from "react";

const STATUS_MESSAGES = [
  "Clarifying the core pain...",
  "Pressure-testing assumptions...",
  "Looking for the smallest viable wedge...",
  "Checking founder fit...",
  "Stress-testing commercial potential...",
  "Designing a 7-day validation test...",
] as const;

export function AnalysisLoader() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % STATUS_MESSAGES.length);
    }, 2000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Analyzing idea. ${STATUS_MESSAGES[messageIndex]}`}
      className="mb-10 flex min-h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm shadow-slate-200/60"
    >
      <div className="flex max-w-md flex-col items-center">
        <svg
          className="analysis-bot"
          viewBox="0 0 180 150"
          role="img"
          aria-label="A small idea analyst robot moonwalking with a checklist and lightbulb"
        >
          <g className="analysis-bot-floor" aria-hidden="true">
            <path d="M25 137h31M8 137h10M124 137h31M162 137h10" />
          </g>
          <ellipse className="analysis-bot-shadow" cx="90" cy="137" rx="39" ry="7" />

          <g className="analysis-bot-bulb">
            <path d="M143 25a14 14 0 1 0-20 12c3 2 4 4 4 7h12c0-3 1-5 4-7a14 14 0 0 0 0-12Z" />
            <path d="M128 49h10M129 54h8" />
            <path className="analysis-bot-bulb-ray" d="M133 4v7M151 12l-5 5M115 12l5 5" />
          </g>

          <g className="analysis-bot-body">
            <g className="analysis-bot-leg analysis-bot-leg-left">
              <path className="analysis-bot-shin" d="M72 112v17" />
              <path className="analysis-bot-shoe" d="M72 129H57" />
            </g>
            <g className="analysis-bot-leg analysis-bot-leg-right">
              <path className="analysis-bot-shin" d="M106 112v17" />
              <path className="analysis-bot-shoe" d="M106 129h15" />
            </g>

            <g className="analysis-bot-arm analysis-bot-arm-left">
              <path d="M57 79 42 94" />
              <circle cx="39" cy="97" r="4" />
            </g>
            <g className="analysis-bot-arm analysis-bot-arm-right">
              <path d="m121 79 12 10" />
              <circle cx="136" cy="92" r="4" />
            </g>

            <rect className="analysis-bot-torso" x="58" y="70" width="62" height="48" rx="18" />
            <circle className="analysis-bot-status-light" cx="89" cy="94" r="6" />

            <path className="analysis-bot-antenna" d="M89 38V27" />
            <circle className="analysis-bot-antenna-light" cx="89" cy="23" r="5" />
            <rect className="analysis-bot-head" x="51" y="38" width="76" height="43" rx="17" />
            <rect className="analysis-bot-face" x="60" y="48" width="58" height="23" rx="10" />
            <g className="analysis-bot-eyes">
              <circle cx="78" cy="59.5" r="4" />
              <circle cx="100" cy="59.5" r="4" />
            </g>
          </g>

          <g className="analysis-bot-checklist">
            <rect x="20" y="45" width="31" height="42" rx="5" />
            <path d="m27 57 3 3 5-6M38 58h7M27 69l3 3 5-6M38 70h7" />
          </g>
        </svg>

        <p className="mt-7 text-lg font-semibold tracking-tight text-slate-900">Analyzing idea...</p>
        <p className="mt-2 min-h-6 text-sm leading-6 text-slate-500">{STATUS_MESSAGES[messageIndex]}</p>
      </div>
    </div>
  );
}
