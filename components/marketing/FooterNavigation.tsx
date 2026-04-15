'use client';

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Instagram, Linkedin, Twitter } from "lucide-react";

export function FooterNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  const scrollToSection = (sectionId: string) => {
    if (pathname === '/') {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      router.push(`/#${sectionId}`);
    }
  };

  return (
    <div className="flex items-center gap-6">
      <button 
        onClick={() => scrollToSection('features')}
        className="text-sm text-gray-600 hover:text-gray-900 font-sans transition-colors"
      >
        Features
      </button>
      <button 
        onClick={() => scrollToSection('pricing')}
        className="text-sm text-gray-600 hover:text-gray-900 font-sans transition-colors"
      >
        Pricing
      </button>
    </div>
  );
}

export function FooterSocialLinks() {
  return (
    <div className="flex items-center gap-4 mb-6 md:mb-0">
      <a 
        href="https://www.instagram.com/trailblaizeus/" 
        target="_blank" 
        rel="noopener noreferrer"
        className="transition-colors"
        style={{ color: 'rgba(0, 0, 0, 0.45)' }}
        aria-label="Instagram"
      >
        <Instagram className="w-5 h-5" />
      </a>
      <a 
        href="https://www.linkedin.com/company/trailblaize-us/" 
        target="_blank" 
        rel="noopener noreferrer"
        className="transition-colors"
        style={{ color: 'rgba(0, 0, 0, 0.45)' }}
        aria-label="LinkedIn"
      >
        <Linkedin className="w-5 h-5" />
      </a>
      <a 
        href="https://x.com/TrailblaizeUS" 
        target="_blank" 
        rel="noopener noreferrer"
        className="transition-colors"
        style={{ color: 'rgba(0, 0, 0, 0.45)' }}
        aria-label="Twitter"
      >
        <Twitter className="w-5 h-5" />
      </a>
    </div>
  );
}