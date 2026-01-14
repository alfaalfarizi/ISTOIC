/**
 * Authentication Styles
 * Uses CSS variables for consistency with main ISTOIC theme
 */
export const authStyles = {
  // Card & Container Styles
  card: "backdrop-blur-2xl border border-[color:var(--border)]/50 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] rounded-[32px] p-8 shadow-2xl relative overflow-hidden",
  
  // Typography Styles
  title: "text-xl font-black text-[var(--text)] uppercase tracking-tight",
  subtitle: "text-[10px] text-[var(--text-muted)] font-mono mt-1 uppercase tracking-[0.2em]",
  label: "text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1",
  
  // Input Styles
  input:
    "w-full bg-[var(--surface-2)] border border-[color:var(--border)]/60 rounded-2xl px-5 py-4 text-sm font-semibold text-[var(--text)] focus:border-[color:var(--accent)]/80 focus:ring-2 focus:ring-[color:var(--accent)]/20 outline-none transition-all placeholder:text-[var(--text-muted)]/50",
  inputIconWrap:
    "w-full bg-[var(--surface-2)] border border-[color:var(--border)]/60 rounded-2xl px-5 py-4 pl-12 text-sm font-semibold text-[var(--text)] focus:border-[color:var(--accent)]/80 focus:ring-2 focus:ring-[color:var(--accent)]/20 outline-none transition-all placeholder:text-[var(--text-muted)]/50",
  inputError: "border-[color:var(--danger)]/60 focus:border-[color:var(--danger)] focus:ring-[color:var(--danger)]/20",
  
  // Button Styles
  buttonPrimary:
    "w-full py-4 bg-gradient-to-r from-[var(--accent)] to-[color:var(--accent-2)] hover:shadow-[0_10px_30px_-8px_var(--accent-rgb)]/40 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-70",
  buttonSecondary:
    "w-full py-4 bg-[var(--success)] hover:bg-[var(--success)]/90 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-70",
  buttonGhost:
    "w-full py-3 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] uppercase tracking-widest flex items-center justify-center gap-2 transition-colors",
  linkMuted: "text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors",
  
  // Alert Styles
  alertError:
    "p-3 bg-[var(--danger)]/10 border border-[color:var(--danger)]/30 rounded-xl text-[var(--danger)] text-xs font-bold text-center mb-4 flex items-center justify-center gap-2",
  alertInfo:
    "p-3 bg-[var(--info)]/10 border border-[color:var(--info)]/30 rounded-xl text-[var(--info)] text-xs font-bold text-center mb-4",
  alertSuccess:
    "p-3 bg-[var(--success)]/10 border border-[color:var(--success)]/30 rounded-xl text-[var(--success)] text-xs font-bold text-center mb-4",
};
