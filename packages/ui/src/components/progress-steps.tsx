'use client';

import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export interface ProgressStep {
  id: string;
  label: string;
}

export interface ProgressStepsProps {
  steps: ProgressStep[];
  currentStep: string;
  className?: string;
}

export function ProgressSteps({ steps, currentStep, className }: ProgressStepsProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div
      aria-live="polite"
      className={cn('flex flex-col gap-2', className)}
    >
      {steps.map((step, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-3 text-sm transition-colors duration-200',
              isComplete && 'text-success',
              isCurrent && 'text-primary font-medium',
              !isComplete && !isCurrent && 'text-text-muted',
            )}
          >
            {/* Step indicator */}
            <div
              className={cn(
                'flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold shrink-0',
                isComplete && 'bg-success/20 text-success',
                isCurrent && 'bg-primary/20 text-primary',
                !isComplete && !isCurrent && 'bg-text-muted/15 text-text-muted',
              )}
            >
              {isComplete ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>

            {/* Label */}
            <span className={cn(isCurrent && 'animate-fade-in-up')}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
