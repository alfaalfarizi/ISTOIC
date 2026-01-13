export const authStyles = {
  card: "backdrop-blur-2xl border border-[var(--border-base)] bg-[var(--bg-card)]/80 rounded-[32px] p-8 shadow-2xl relative overflow-hidden",
  title: "text-xl font-black text-[var(--text-main)] uppercase tracking-tight",
  subtitle: "text-[10px] text-[var(--text-muted)] font-mono mt-1 uppercase tracking-[0.2em]",
  label: "text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest ml-1",
  input:
    "w-full bg-[var(--bg-surface)] border border-[var(--border-base)] rounded-2xl px-5 py-4 text-sm font-semibold text-[var(--text-main)] focus:border-emerald-500 outline-none transition-all placeholder:text-[var(--text-muted)]",
  inputIconWrap:
    "w-full bg-[var(--bg-surface)] border border-[var(--border-base)] rounded-2xl px-5 py-4 pl-12 text-sm font-semibold text-[var(--text-main)] focus:border-emerald-500 outline-none transition-all placeholder:text-[var(--text-muted)]",
  inputError: "border-red-500/50 focus:border-red-500",
  buttonPrimary:
    "w-full py-4 bg-white text-black hover:bg-neutral-200 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-70",
  buttonSecondary:
    "w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-70",
  buttonGhost:
    "w-full py-3 text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] uppercase tracking-widest flex items-center justify-center gap-2",
  linkMuted: "text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]",
  alertError:
    "p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold text-center mb-4 flex items-center justify-center gap-2",
  alertInfo:
    "p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-xs font-bold text-center mb-4",
  alertSuccess:
    "p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold text-center mb-4",
};
