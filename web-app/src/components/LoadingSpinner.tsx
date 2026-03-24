import React from "react";
import Lottie from "lottie-react";
import lottieZenIcon from "@/assets/Zen AI Icon.json";

type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  withBackdrop?: boolean;
  className?: string;
}

const sizeStyles = {
  xs: "w-3.5 h-3.5",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-8 h-8",
  xl: "w-10 h-10",
  "2xl": "w-12 h-12"
};

export default function LoadingSpinner({ size = "md", withBackdrop = false, className }: LoadingSpinnerProps) {
  const wrapperClass = `lottie-spinner ${sizeStyles[size]}${className ? ` ${className}` : ""}`;
  const spinner = (
    <div className={wrapperClass} aria-hidden="true">
      <Lottie animationData={lottieZenIcon} loop autoplay className="w-full h-full" />
    </div>
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
