"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlumniPipeline } from "./AlumniPipeline";
import { ActivelyHiringPage } from "./ActivelyHiringPage";
import { MyChapterPage } from "@/components/mychapter/MyChapterPage";
import { Lock, ChevronDown, ChevronUp } from "lucide-react";
import { useProfile } from "@/lib/contexts/ProfileContext";
import {
  AlumniPipelineMobileHostsContext,
  type AlumniPipelineMobileHosts,
} from "@/lib/contexts/AlumniPipelineMobileHostsContext";
import { MobileBottomNavigation } from "@/components/features/dashboard/dashboards/ui/MobileBottomNavigation";
import { cn } from "@/lib/utils";

const pageTransition = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -20, scale: 1.02 },
};

const emptyMobileHosts: AlumniPipelineMobileHosts = {
  countLine: null,
  actions: null,
  profileSlot: null,
};

export function AlumniDashboard() {
  const { profile } = useProfile();
  const [active, setActive] = useState("pipeline");
  const [isMobileHeaderCollapsed, setIsMobileHeaderCollapsed] = useState(true);
  const [mobilePipelineHosts, setMobilePipelineHosts] =
    useState<AlumniPipelineMobileHosts>(emptyMobileHosts);

  const setCountLineHost = useCallback((el: HTMLElement | null) => {
    setMobilePipelineHosts((prev) => ({ ...prev, countLine: el }));
  }, []);
  const setActionsHost = useCallback((el: HTMLElement | null) => {
    setMobilePipelineHosts((prev) => ({ ...prev, actions: el }));
  }, []);
  const setProfileSlotHost = useCallback((el: HTMLElement | null) => {
    setMobilePipelineHosts((prev) => ({ ...prev, profileSlot: el }));
  }, []);
  
  // Function to get the correct label based on user role
  const getChapterLabel = () => {
    return profile?.role === 'alumni' ? "Active Members" : "My Chapter";
  };
  
  const tabs = [
    { id: "pipeline", label: "Alumni Pipeline", component: AlumniPipeline },
    { id: "chapter", label: getChapterLabel(), component: MyChapterPage },
    { 
      id: "hiring", 
      label: "Actively Hiring", 
      component: ActivelyHiringPage,
      disabled: true
    }
  ];

  const handleTabClick = (tabId: string, disabled: boolean = false) => {
    if (disabled) {
      // Actively Hiring - Feature coming soon!
      return;
    }
    setActive(tabId);
  };

  const toggleMobileHeader = () => {
    setIsMobileHeaderCollapsed(!isMobileHeaderCollapsed);
  };

  return (
    <AlumniPipelineMobileHostsContext.Provider value={mobilePipelineHosts}>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-accent-50/20">
      {/* Mobile Header with Collapse Functionality */}
      <div className="sm:hidden bg-white/95 backdrop-blur-lg border-b border-gray-200 shadow-sm">
        <div className="px-4 py-3">
          {/* Collapsible Header */}
          {active === "pipeline" || active === "chapter" ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-1">
                  <p className="text-sm font-medium text-gray-700">
                    {active === "pipeline"
                      ? "Alumni Pipeline"
                      : profile?.role === "alumni"
                        ? "Active Members"
                        : "My Chapter"}
                  </p>
                  <div
                    ref={setCountLineHost}
                    className="mt-0.5 min-h-[1.125rem] text-xs text-gray-500"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  <div
                    ref={setActionsHost}
                    className="flex shrink-0 items-center gap-1.5"
                  />
                  <button
                    type="button"
                    onClick={toggleMobileHeader}
                    className="p-1 rounded-md hover:bg-gray-100 transition-colors shrink-0"
                    aria-expanded={!isMobileHeaderCollapsed}
                    aria-label={isMobileHeaderCollapsed ? "Expand section" : "Collapse section"}
                  >
                    {isMobileHeaderCollapsed ? (
                      <ChevronDown
                        className="h-4 w-4 text-gray-600"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <ChevronUp
                        className="h-4 w-4 text-gray-600"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </button>
                </div>
              </div>
              <div ref={setProfileSlotHost} className="mt-2 min-h-0" />
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">
                  <span className="sm:hidden">
                    {active === "hiring" && "Hiring"}
                  </span>
                  <span className="hidden sm:inline">
                    {tabs.find((t) => t.id === active)?.label}
                  </span>
                </span>
                {tabs.find((t) => t.id === active)?.disabled && (
                  <Lock className="h-3 w-3 text-gray-400" />
                )}
              </div>
              <button
                type="button"
                onClick={toggleMobileHeader}
                className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                aria-expanded={!isMobileHeaderCollapsed}
                aria-label={isMobileHeaderCollapsed ? "Expand section" : "Collapse section"}
              >
                {isMobileHeaderCollapsed ? (
                  <ChevronDown
                    className="h-4 w-4 text-gray-600"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <ChevronUp
                    className="h-4 w-4 text-gray-600"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </button>
            </div>
          )}
          
          {/* Collapsible Tabs */}
          <AnimatePresence>
            {!isMobileHeaderCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex space-x-2 pt-3 pb-2 pl-2">
                  {tabs.filter(t => t.id !== "hiring").map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTabClick(t.id, t.disabled)}
                      disabled={t.disabled}
                      className={cn(
                        'text-sm font-medium px-3 py-2 rounded-full transition-all duration-200 flex items-center shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200',
                        t.disabled 
                          ? "opacity-60 cursor-not-allowed text-gray-400 bg-gray-50 border border-gray-200" 
                          : active === t.id 
                            ? "bg-white border-2 border-black text-slate-950 font-medium hover:bg-gray-50 hover:shadow-md" 
                            : "bg-white border border-black text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm"
                        )}
                    >
                      {/* Mobile: Short text, Desktop: Full text */}
                      <span className="sm:hidden">
                        {t.id === "pipeline" && "Pipeline"}
                        {t.id === "chapter" && (profile?.role === 'alumni' ? "Members" : "My Chapter")}
                        {t.id === "hiring" && "Hiring"}
                      </span>
                      <span className="hidden sm:inline">{t.label}</span>
                      {t.disabled && (
                        <Lock className="h-3 w-3 ml-1.5 text-gray-400" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop Tabs - Updated with pill styling */}
      <div className="hidden sm:block bg-white/95 backdrop-blur-lg border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4 flex space-x-2">
          {tabs.filter(t => t.id !== "hiring").map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabClick(t.id, t.disabled)}
              disabled={t.disabled}
              className={cn(
                'text-sm font-medium px-4 py-2 rounded-full transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-200',
                t.disabled 
                  ? "opacity-60 cursor-not-allowed text-gray-400 bg-gray-50 border border-gray-200" 
                  : active === t.id 
                    ? "bg-white border-2 border-black text-slate-950 font-medium hover:bg-gray-50 hover:shadow-md" 
                    : "bg-white border border-black text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm"
                )}
            >
              {t.label}
              {t.disabled && (
                <Lock className="h-3 w-3 ml-2 text-gray-400 inline" />
              )}
            </button>
          ))}
        </div>
      </div>
      
      {/* Content Area */}
      <div className="flex-1 pb-20 sm:pb-0"> {/* Add pb-20 for mobile, remove on desktop */}
        <AnimatePresence mode="wait">
          {tabs.map(
            (t) =>
              t.id === active && (
                <motion.div key={t.id} variants={pageTransition} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.4 }}>
                  <t.component />
                </motion.div>
              )
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNavigation />
    </div>
    </AlumniPipelineMobileHostsContext.Provider>
  );
} 