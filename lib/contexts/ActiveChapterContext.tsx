// lib/contexts/ActiveChapterContext.tsx
// TRA-661: Extended to track multi-membership state

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type MemberSpaceSummary = { id: string; name: string };

interface ActiveChapterContextType {
  activeChapterId: string | null;
  setActiveChapterId: (chapterId: string | null) => void;
  /** TRA-661: True when the user has memberships in more than one space */
  hasMultipleMemberships: boolean;
  setHasMultipleMemberships: (value: boolean) => void;
  /** Spaces the user can switch between (ids + names) for scoped UI labels */
  memberSpaces: MemberSpaceSummary[];
  setMemberSpaces: (spaces: MemberSpaceSummary[]) => void;
}

const ActiveChapterContext = createContext<ActiveChapterContextType | undefined>(undefined);

export const ActiveChapterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [hasMultipleMemberships, setHasMultipleMemberships] = useState(false);
  const [memberSpaces, setMemberSpaces] = useState<MemberSpaceSummary[]>([]);

  return (
    <ActiveChapterContext.Provider
      value={{
        activeChapterId,
        setActiveChapterId,
        hasMultipleMemberships,
        setHasMultipleMemberships,
        memberSpaces,
        setMemberSpaces,
      }}
    >
      {children}
    </ActiveChapterContext.Provider>
  );
};

export const useActiveChapter = (): ActiveChapterContextType => {
  const context = useContext(ActiveChapterContext);
  if (!context) {
    return {
      activeChapterId: null,
      setActiveChapterId: () => {},
      hasMultipleMemberships: false,
      setHasMultipleMemberships: () => {},
      memberSpaces: [],
      setMemberSpaces: () => {},
    };
  }
  return context;
};
