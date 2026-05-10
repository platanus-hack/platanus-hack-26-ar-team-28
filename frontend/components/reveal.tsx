"use client";

/* eslint-disable react-hooks/refs */

import {
  createElement,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

type RevealProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  delay?: number;
  intensity?: "soft" | "standard" | "strong";
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function Reveal<T extends ElementType = "div">({
  as,
  children,
  className,
  delay = 0,
  intensity = "standard",
  ...props
}: RevealProps<T>) {
  const Component = (as ?? "div") as ElementType;
  const nodeRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const style = {
    "--reveal-delay": `${delay}ms`,
    ...(props as { style?: CSSProperties }).style,
  } as CSSProperties;

  useEffect(() => {
    const node = nodeRef.current;
    let frame = 0;

    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        frame = window.requestAnimationFrame(() => {
          setVisible(true);
        });
        observer.disconnect();
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -12% 0px",
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return createElement(
    Component,
    {
      ...(props as object),
      ref: (node: HTMLElement | null) => {
        nodeRef.current = node;
      },
      "data-visible": visible ? "true" : "false",
      "data-intensity": intensity,
      className: cn("reveal", className),
      style,
    },
    children,
  );
}
