"use client";

import { createContext, useContext } from "react";

/** Portal targets inside AlumniDashboard mobile header (pipeline tab only). */
export interface AlumniPipelineMobileHosts {
  countLine: HTMLElement | null;
  actions: HTMLElement | null;
  profileSlot: HTMLElement | null;
}

export const AlumniPipelineMobileHostsContext = createContext<
  AlumniPipelineMobileHosts | undefined
>(undefined);

export function useAlumniPipelineMobileHosts() {
  return useContext(AlumniPipelineMobileHostsContext);
}
