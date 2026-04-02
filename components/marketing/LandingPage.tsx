'use client';

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Users, DollarSign, Shield, Star, Check } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { CALENDLY_DEMO_URL } from "@/lib/constants/externalLinks";
import { HeroIcon } from "./icons/HeroIcon";
import { TrustedBySection } from "./TrustedBySection";

// Logo served from public directory

const features = [
  {
    icon: Users,
    title: "Alumni Network",
    description: "Connect with thousands of alumni across industries with our LinkedIn-style platform. Build meaningful relationships that last.",
    mobileDescription: "Connect with thousands of alumni across industries.",
    highlights: ["Alumni Pipeline", "Actively Hiring", "Chapter Directory"],
    color: "from-accent-500 to-brand-accent",
    bgColor: "bg-accent-50",
    delay: 0.1,
  },
  {
    icon: DollarSign,
    title: "Dues Management",
    description: "Streamlined payment processing and financial tracking for chapter operations. Automated reminders and comprehensive reporting keep everything on track.",
    mobileDescription: "Streamlined payment processing and financial tracking.",
    highlights: ["Payment Portal", "Financial Reports", "Automated Reminders"],
    color: "from-green-500 to-green-600",
    bgColor: "bg-green-50",
    delay: 0.2,
  },
  {
    icon: Shield,
    title: "Executive Admin",
    description: "Comprehensive administrative tools for chapter leadership and management. Role-based access ensures secure and efficient operations.",
    mobileDescription: "Comprehensive administrative tools for chapter leadership.",
    highlights: ["Role-based Access", "Task Management", "Chapter Analytics"],
    color: "from-purple-500 to-purple-600",
    bgColor: "bg-purple-50",
    delay: 0.3,
  },
  {
    icon: Check,
    title: "Event Coordination",
    description: "Organize and manage chapter events with ease. Track RSVPs, manage vendors, and keep everyone informed about what's happening.",
    mobileDescription: "Organize and manage chapter events with ease.",
    highlights: ["Event Planning", "Vendor Management", "RSVP Tracking"],
    color: "from-brand-primary to-brand-primary",
    bgColor: "bg-primary-50",
    delay: 0.4,
  },
];

const pricingPlans = [
  {
    name: "Free - The Network",
    price: "$0",
    period: "/ month",
    description: "For individuals",
    features: [
      "Build a verified alumni profile",
      "Grow your network",
      "Find and reconnect with alumni",
      "Message, connect, and engage",
      "Access career opportunities",
      "Maintain lifelong affiliation"
    ],
    buttonText: "Request Access",
    buttonAction: () => window.open(CALENDLY_DEMO_URL, '_blank'),
    popular: false,
  },
  {
    name: "Own the Chapter",
    price: "$299",
    period: "/ month",
    description: "For chapter leaders",
    features: [
      "Claim your chapter's digital home",
      "Member & alumni management",
      "Central system of record",
      "Events & communications tools",
      "Engagement insights & analytics",
      "Protect your chapter’s legacy"
    ],
    buttonText: "Book a demo",
    buttonAction: () => window.open(CALENDLY_DEMO_URL, '_blank'),
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Contact Us",
    period: "",
    description: "For national organizations",
    features: [
      "Own the network at scale",
      "All chapters, one system",
      "Alumni activation at scale",
      "Standardized infrastructure",
      "Membership analytics & insights",
      "Long-term institutional value"
    ],
    buttonText: "Contact Us",
    buttonAction: () => window.open(CALENDLY_DEMO_URL, '_blank'),
    popular: false,
  },
];

export function LandingPage() {
  const [activeSection, setActiveSection] = useState("home");
  const { user } = useAuth();

  // Handle hash navigation on page load
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && ['features', 'pricing', 'about'].includes(hash)) {
      // Wait for page to render, then scroll to section
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
          setActiveSection(hash);
        }
      }, 100);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Use the shared header component */}
      <MarketingHeader activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* Hero Section */}
      <section id="home" className="relative pt-28 md:pt-32 pb-8 md:pb-12 overflow-hidden bg-white">
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="text-center">
            {/* Main Headline */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              className="mb-6"
            >
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-normal tracking-tight mb-6 instrument-serif-regular text-gray-900">
                The Alumni Network
                <br />
                for every organization.
              </h1>
            </motion.div>

            {/* Description */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="mb-10"
            >
              <p className="text-lg sm:text-xl md:text-2xl text-gray-600 leading-relaxed font-sans whitespace-normal md:whitespace-nowrap md:max-w-none">
                A shared social network where organizations own their alumni community.
              </p>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="flex flex-row items-center justify-center gap-4 mb-12 md:mb-16 px-4"
            >
              <Button
                size="lg"
                className="
                  bg-black 
                  hover:bg-gray-900 
                  text-white 
                  px-6 py-3 
                  text-base 
                  font-medium 
                  font-sans
                  rounded-xl
                  transition-all duration-200 
                  whitespace-nowrap 
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                "
                onClick={() => window.open(CALENDLY_DEMO_URL, '_blank')}
              >
                Request a Demo
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="
                  border border-black 
                  bg-white 
                  text-black 
                  hover:bg-gray-50 
                  hover:border-gray-800
                  px-6 py-3 
                  text-base 
                  font-medium 
                  font-sans
                  rounded-xl
                  transition-all duration-200 
                  whitespace-nowrap 
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                "
                onClick={() => window.location.href = '/sign-up'}
              >
                Join the Network
              </Button>
            </motion.div>

            {/* Trusted By Section - Inside Hero */}
            <div className="w-full mt-2 md:mt-4">
              <TrustedBySection />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - New */}
      <section id="features" className="pt-0 pb-16 md:pb-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {/* Two Cards with Screenshots */}
          <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-6 mb-8 md:mb-16">
            {/* Card 1: System of Record */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="flex flex-col items-center gap-8 w-full max-w-[363px]"
            >
              <div className="w-full rounded-lg shadow-lg overflow-hidden" style={{ width: '363px', height: '413px' }}>
                <Image
                  src="/screenshots/system-of-record.png"
                  alt="System of Record Dashboard"
                  width={363}
                  height={413}
                  className="w-full h-full object-cover"
                  priority
                />
              </div>
              <div className="flex flex-col items-center gap-2 w-full text-center">
                <h3 className="text-2xl font-semibold text-black text-center w-full font-sans" style={{ fontSize: '24px', lineHeight: '28.80px', fontWeight: 600 }}>
                  System of Record
                </h3>
                <p className="text-xs text-center w-full font-sans" style={{ fontSize: '12px', lineHeight: '17.40px', fontWeight: 500, color: 'rgba(0, 0, 0, 0.55)' }}>
                  One secure source of truth for members and communication.
                </p>
              </div>
            </motion.div>

            {/* Card 2: Unified Alumni Network */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true }}
              className="flex flex-col items-center gap-8 w-full max-w-[363px]"
            >
              <div className="w-full rounded-lg shadow-lg overflow-hidden" style={{ width: '363px', height: '413px' }}>
                <Image
                  src="/screenshots/unified-alumni-network.png"
                  alt="Unified Alumni Network Dashboard"
                  width={363}
                  height={413}
                  className="w-full h-full object-cover"
                  priority
                />
              </div>
              <div className="flex flex-col items-center gap-2 w-full text-center">
                <h3 className="text-2xl font-semibold text-black text-center w-full font-sans" style={{ fontSize: '24px', lineHeight: '28.80px', fontWeight: 600 }}>
                  Unified Alumni Network
                </h3>
                <p className="text-xs text-center w-full font-sans" style={{ fontSize: '12px', lineHeight: '17.40px', fontWeight: 500, color: 'rgba(0, 0, 0, 0.55)' }}>
                  Profiles, messaging, and networking in one place.
                </p>
              </div>
            </motion.div>
          </div>

          {/* Bottom Headline Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="text-center mb-12 md:mb-16"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-normal mb-6 instrument-serif-regular text-gray-900">
              Alumni Relationship Management At Scale
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed font-sans">
              Trailblaize turns out-dated spreadsheets and email lists into an interactive community.
            </p>
          </motion.div>

          {/* Testimonial Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            viewport={{ once: true }}
            className="flex justify-center"
          >
            <div className="w-full max-w-[800px] min-w-0 md:min-w-[640px] p-4 md:p-8 bg-white rounded-2xl outline outline-1 outline-offset-[-1px] outline-black/10 flex flex-col justify-end items-center gap-4 md:gap-6 overflow-hidden" style={{ boxShadow: '0px 6px 12px 0px rgba(0,0,0,0.03), 0px 4px 8px 0px rgba(0,0,0,0.02), -8px 12px 24px 0px rgba(0,0,0,0.08)' }}>
              <div className="self-stretch flex flex-col md:flex-row justify-center items-center gap-3 md:gap-4">
                <div className="flex-1 flex flex-col md:flex-row justify-center md:justify-start items-center md:items-start gap-3 md:gap-4 w-full">
                  <img
                    className="w-12 h-12 rounded-lg flex-shrink-0"
                    src="/screenshots/Artboard 21.png"
                    alt="Walker Cobb"
                  />
                  <div className="flex-1 flex flex-col justify-center md:justify-start items-center md:items-start gap-1 w-full">
                    <div className="self-stretch text-center md:text-left text-black text-sm md:text-base font-semibold font-sans leading-6">
                      Walker Cobb
                    </div>
                    <div className="self-stretch text-center md:text-left text-black/60 text-xs md:text-base font-medium font-sans leading-5 md:leading-6">
                      Graduate of the University of Mississippi
                    </div>
                  </div>
                </div>
                <img
                  className="w-10 h-6 md:w-12 md:h-8 flex-shrink-0"
                  src={"/screenshots/quote.png"}
                  alt="Decorative"
                />
              </div>
              <div className="w-full max-w-full md:max-w-[736px] text-center md:text-left text-black text-base md:text-lg font-medium font-sans leading-6 md:leading-7 px-2 md:px-0">
                Trailblaize turned our chapter email list into an interactive network. <br className="hidden md:block" />
                Members and alumni have landed jobs, internships, and even deal flow across generations of our fraternity, while staying connected to the chapter.
              </div>
            </div>
          </motion.div>
        </div>
      </section>



      {/* Pricing Section */}
      <section id="pricing" className="py-8 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-4 md:md-12"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-normal mb-6 instrument-serif-regular text-gray-900">
              Simple Pricing that Scales With Your Community.
            </h2>
            <p className="text-lg md:text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed font-sans">
              Joining Trailblaize is free. Groups pay to own, customize, and manage their space on the platform. Subscriptions are billed to admins and executive leaders.
            </p>
          </motion.div>

          {/* Pricing Cards */}
          {/* Mobile: Side-by-side Overlapping Cards */}
          <div className="md:hidden mb-0 px-4">
            <div className="flex items-center justify-center relative overflow-visible" style={{ minHeight: '450px' }}>
              {pricingPlans.map((plan, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="relative flex-shrink-0 group"
                  style={{
                    width: '80%',
                    marginLeft: index === 0 ? '0' : index === 1 ? '-60%' : '-60%',
                    zIndex: 30,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.zIndex = '40';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.zIndex = '30';
                  }}
                  onTouchStart={(e) => {
                    // Bring card to front on touch
                    e.currentTarget.style.zIndex = '40';
                  }}
                  onTouchEnd={(e) => {
                    // Keep card on top briefly, then reset
                    setTimeout(() => {
                      e.currentTarget.style.zIndex = '30';
                    }, 300);
                  }}
                >
                  <Card className={`h-full bg-white border cursor-pointer transition-all duration-300 ${plan.popular
                    ? "border-gray-300 shadow-lg"
                    : "border-gray-200 shadow-sm"
                    } group-hover:scale-105 group-hover:shadow-xl`}>
                    <CardContent className="p-4 h-full flex flex-col">
                      {/* Title */}
                      <div className="mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1 font-sans">
                          {plan.name}
                        </h3>
                        <p className="text-xs text-gray-600 font-sans">{plan.description}</p>
                      </div>

                      {/* Price */}
                      <div className="mb-4">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-gray-900 font-sans">{plan.price}</span>
                          {plan.period && (
                            <span className="text-sm text-gray-600 font-sans">{plan.period}</span>
                          )}
                        </div>
                      </div>

                      {/* Features */}
                      <div className="space-y-2 mb-6 flex-grow">
                        {plan.features.map((feature, idx) => (
                          <div key={idx} className="flex items-start space-x-2">
                            <Check className="h-4 w-4 flex-shrink-0 text-gray-600 mt-0.5" />
                            <span className="text-xs text-gray-700 font-sans leading-relaxed">{feature}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA Button */}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          plan.buttonAction();
                        }}
                        className={`
                          w-full
                          ${plan.popular
                            ? "bg-black hover:bg-gray-900 text-white rounded-xl"
                            : "bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 rounded-xl"
                          }
                          font-medium
                          shadow-sm hover:shadow-md
                          transition-all duration-200
                          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                          px-3 py-2
                          text-xs
                        `}
                      >
                        {plan.buttonText}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Desktop: Grid Layout (unchanged) */}
          <div className="hidden md:grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="relative"
              >
                <Card className={`h-full bg-white border ${plan.popular
                  ? "border-gray-300 shadow-lg"
                  : "border-gray-200 shadow-sm hover:shadow-md"
                  } transition-all duration-300 relative`}>
                  <CardContent className="p-6 md:p-8 h-full flex flex-col">
                    {/* Title */}
                    <div className="mb-4">
                      <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2 font-sans">
                        {plan.name}
                      </h3>
                      <p className="text-sm md:text-base text-gray-600 font-sans">{plan.description}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl md:text-4xl font-bold text-gray-900 font-sans">{plan.price}</span>
                        {plan.period && (
                          <span className="text-base md:text-lg text-gray-600 font-sans">{plan.period}</span>
                        )}
                      </div>
                    </div>

                    {/* Features */}
                    <div className="space-y-3 md:space-y-4 mb-8 flex-grow">
                      {plan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start space-x-3">
                          <Check className="h-5 w-5 flex-shrink-0 text-gray-600 mt-0.5" />
                          <span className="text-sm md:text-base text-gray-700 font-sans leading-relaxed">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA Button */}
                    <Button
                      onClick={plan.buttonAction}
                      className={`
                        w-full
                        ${plan.popular
                          ? "bg-black hover:bg-gray-900 text-white rounded-xl"
                          : "bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 rounded-xl"
                        }
                        font-medium
                        shadow-sm hover:shadow-md
                        transition-all duration-200
                        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                        px-4 py-3
                        text-sm md:text-base
                      `}
                    >
                      {plan.buttonText}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-normal mb-6 instrument-serif-regular text-gray-900">
              Ready To Join The Network?
            </h2>
            <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed font-sans">
              Build your alumni community, connect across generations, and start creating real opportunities.
            </p>
            <Button
              size="lg"
              variant="outline"
              className="
                border-2 border-slate-200 
                bg-white 
                text-slate-950 
                hover:bg-slate-50 
                hover:border-slate-700
                hover:text-slate-700
                px-24 py-3 
                text-base md:text-lg
                rounded-xl
                font-medium
                font-sans
                shadow-sm hover:shadow-md
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500
              "
              onClick={() => window.open(CALENDLY_DEMO_URL, '_blank')}
            >
              Book a Demo
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
