'use client'

import { Hero } from "@/components/hero";
import { ProblemSection } from "@/components/sections/problem";
import { ProductSection } from "@/components/sections/product";
import { HowItWorksSection } from "@/components/sections/how-it-works";
import { WhyNowSection } from "@/components/sections/why-now";
import { CTASection } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";
import { ScrollProgress } from "@/components/scroll-progress";
import { Leva } from "leva";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <Hero />
      <ProblemSection />
      <ProductSection />
      <HowItWorksSection />
      <WhyNowSection />
      <CTASection />
      <Footer />
      <Leva hidden />
    </>
  );
}
