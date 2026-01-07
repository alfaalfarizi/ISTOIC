import { getMemoryLayer } from "./brain/memory";
import { getReasoningLayer } from "./brain/reasoning";
import { getPlanningLayer } from "./brain/planning";
import { Note } from "../types";

export const HANISAH_BRAIN = {
  // Fix: Accept Note[] | string for notes parameter to avoid type mismatch in kernels
  getSystemInstruction: async (persona: 'hanisah' | 'stoic' = 'hanisah', query: string = '', notes: Note[] | string = []) => {
    // Check for manual override
    const localOverride = localStorage.getItem(`${persona}_system_prompt`);
    if (localOverride) return localOverride;

    const reasoning = getReasoningLayer(persona);
    const planning = getPlanningLayer(persona);
    // Fix: Pass notes (which can be Note[] | string) to getMemoryLayer
    const memory = await getMemoryLayer(query, notes);

    return `
${reasoning}
${memory}
${planning}

[FINAL_DIRECTIVE]
Synthesize the layers above to provide the most efficient and persona-aligned response.
`;
  },

  getMechanicInstruction: () => {
      return `
[ROLE: SYSTEM_MECHANIC_PRIME]
Autonomous Maintenance System for IStoicAI Titanium.
Objective: 100% Node Efficiency.
Output: JSON or Technical Logs only.
`;
  }
};