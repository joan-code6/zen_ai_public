import React from "react";

type SpinnerSize = "sm" | "md" | "lg";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  withBackdrop?: boolean;
}

const sizeStyles = {
  sm: "w-4 h-4 border-2",
  md: "w-8 h-8 border-3",
  lg: "w-12 h-12 border-4"
};

export default function LoadingSpinner({ size = "md", withBackdrop = false }: LoadingSpinnerProps) {
  const spinner = (
    <div className={`rounded-full border-t-transparent border-primary animate-spin ${sizeStyles[size]}`} />
  );

  if (withBackdrop) {
    return (
      <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
        {spinner}
      </div>
    );
  }

  return spinner;
}
