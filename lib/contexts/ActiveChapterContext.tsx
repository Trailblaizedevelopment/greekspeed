// lib/contexts/ActiveChapterContext.tsx
// TRA-661: Extended to track multi-membership state
// TRA-664: Module-level stable no-ops prevent useEffect dependency churn
//          when the hook is called outside ActiveChapterProvider.

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

const NOOP_SET_CHAPTER_ID = (_chapterId: string | null) => {};
const NOOP_SET_BOOLEAN = (_value: boolean) => {};
const NOOP_SET_SPACES = (_spaces: MemberSpaceSummary[]) => {};
const EMPTY_SPACES: MemberSpaceSummary[] = [];

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
      setActiveChapterId: NOOP_SET_CHAPTER_ID,
      hasMultipleMemberships: false,
      setHasMultipleMemberships: NOOP_SET_BOOLEAN,
      memberSpaces: EMPTY_SPACES,
      setMemberSpaces: NOOP_SET_SPACES,
    };
  }
  return context;
};
