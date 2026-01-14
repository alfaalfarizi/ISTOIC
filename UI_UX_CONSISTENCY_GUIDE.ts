/**
 * UI/UX Consistency Guidelines for ISTOIC
 * Unified design system across all components and features
 */

/**
 * COLOR SYSTEM
 * All components use CSS variables for consistency
 */

// Core CSS Variables (defined in styles)
const CSS_COLORS = {
  // Backgrounds
  bg: 'var(--bg)',
  'bg-elevated': 'var(--bg-elevated)',
  
  // Surfaces
  surface: 'var(--surface)',
  'surface-2': 'var(--surface-2)',
  
  // Accents
  accent: 'var(--accent)',
  'accent-2': 'var(--accent-2)',
  
  // Text Colors
  text: 'var(--text)',
  'text-muted': 'var(--text-muted)',
  'text-invert': 'var(--text-invert)',
  
  // Status Colors
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  focus: 'var(--focus)',
  
  // Borders
  border: 'var(--border)',
};

/**
 * COMPONENT PATTERNS
 * Consistent styling patterns for common component types
 */

const COMPONENT_PATTERNS = {
  // Card Container
  card: `
    backdrop-blur-2xl 
    border border-[color:var(--border)]/50
    bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)]
    rounded-[24px] md:rounded-[32px]
    p-6 md:p-8
    shadow-sm hover:shadow-lg
    transition-all duration-300
  `,
  
  // Input Field
  input: `
    w-full
    bg-[var(--surface-2)]
    border border-[color:var(--border)]/60
    rounded-xl md:rounded-2xl
    px-4 md:px-5 py-3 md:py-4
    text-sm font-semibold
    text-[var(--text)]
    placeholder:text-[var(--text-muted)]/50
    focus:border-[color:var(--accent)]/80
    focus:ring-2 focus:ring-[color:var(--accent)]/20
    focus:outline-none
    transition-all duration-200
  `,
  
  // Primary Button
  buttonPrimary: `
    px-6 py-3 md:py-4
    bg-gradient-to-r from-[var(--accent)] to-[color:var(--accent-2)]
    hover:shadow-[0_10px_30px_-8px_var(--accent-rgb)]/40
    text-white font-black
    uppercase text-xs md:text-sm
    tracking-widest
    rounded-xl md:rounded-2xl
    transition-all duration-300
    active:scale-95
    disabled:opacity-70 disabled:cursor-not-allowed
  `,
  
  // Secondary Button
  buttonSecondary: `
    px-6 py-3 md:py-4
    bg-[var(--accent-2)]
    hover:bg-[var(--accent-2)]/90
    text-white font-black
    uppercase text-xs md:text-sm
    tracking-widest
    rounded-xl md:rounded-2xl
    transition-all duration-300
    active:scale-95
  `,
  
  // Ghost Button (Text Only)
  buttonGhost: `
    px-6 py-3
    text-[var(--text-muted)]
    hover:text-[var(--accent)]
    font-bold
    uppercase text-xs
    tracking-widest
    transition-colors duration-200
  `,
  
  // Navigation Item
  navItem: `
    flex items-center gap-3
    px-4 py-3 md:py-3.5
    rounded-xl md:rounded-[18px]
    text-[var(--text-muted)]
    hover:text-[var(--text)]
    hover:bg-[var(--surface-2)]/60
    transition-all duration-300
    cursor-pointer
    font-semibold text-sm
  `,
  
  // Alert Box
  alertError: `
    p-3 md:p-4
    bg-[var(--danger)]/10
    border border-[color:var(--danger)]/30
    rounded-lg md:rounded-xl
    text-[var(--danger)]
    text-xs md:text-sm
    font-bold
    flex items-center justify-center gap-2
  `,
  
  alertSuccess: `
    p-3 md:p-4
    bg-[var(--success)]/10
    border border-[color:var(--success)]/30
    rounded-lg md:rounded-xl
    text-[var(--success)]
    text-xs md:text-sm
    font-bold
  `,
};

/**
 * TYPOGRAPHY SYSTEM
 */

const TYPOGRAPHY = {
  pageTitle: 'text-2xl md:text-3xl lg:text-4xl font-black text-[var(--text)]',
  sectionTitle: 'text-lg md:text-xl font-bold text-[var(--text)]',
  cardTitle: 'text-base md:text-lg font-bold text-[var(--text)]',
  bodyText: 'text-sm md:text-base text-[var(--text)]',
  caption: 'text-xs md:text-sm text-[var(--text-muted)]',
  label: 'text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]',
};

/**
 * SPACING SYSTEM
 * Consistent gap/margin values
 */

const SPACING = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '2.5rem', // 40px
};

/**
 * COMPONENT IMPLEMENTATION CHECKLIST
 */

const CONSISTENCY_CHECKLIST = {
  colors: [
    '✅ Use CSS variables (var(--color)) not hardcoded colors',
    '✅ Use -rgb variants for opacity (var(--accent-rgb))',
    '✅ Use consistent accent colors across theme',
    '✅ Dark mode support automatically via CSS variables',
  ],
  
  typography: [
    '✅ Use Plus Jakarta Sans as primary font',
    '✅ Font weights: 400 (normal), 600 (semibold), 700 (bold), 900 (black)',
    '✅ Use uppercase tracking-widest for labels',
    '✅ Use text-[10px] or text-xs for captions',
  ],
  
  spacing: [
    '✅ Use consistent gap values from spacing system',
    '✅ Use responsive padding (p-6 md:p-8)',
    '✅ Use consistent border radius (rounded-xl, rounded-2xl, rounded-[24px])',
    '✅ Never hardcode pixel values for spacing',
  ],
  
  components: [
    '✅ Use reusable component patterns',
    '✅ Apply consistent border colors (border-[color:var(--border)]/60)',
    '✅ Use consistent shadow styles',
    '✅ Add focus states for accessibility',
    '✅ Use transition-all for smooth animations',
  ],
  
  responsive: [
    '✅ Mobile first approach',
    '✅ Use md: prefix for tablet+ changes',
    '✅ Use lg: prefix for desktop+ changes',
    '✅ Test on mobile, tablet, and desktop viewports',
  ],
};

/**
 * BEFORE & AFTER EXAMPLES
 */

// BEFORE (Inconsistent)
const BEFORE = `
<div className="bg-[#0a0a0b] text-white p-8 rounded-[32px] border border-white/10">
  <h1 className="text-xl font-black text-white">Title</h1>
  <input className="bg-[#121214] text-white border border-white/10 p-4" />
  <button className="bg-emerald-600 text-white py-4 rounded-2xl">Click Me</button>
</div>
`;

// AFTER (Consistent)
const AFTER = `
<div className="backdrop-blur-2xl border border-[color:var(--border)]/50 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] rounded-[32px] p-8 shadow-sm hover:shadow-lg">
  <h1 className="text-xl font-black text-[var(--text)]">Title</h1>
  <input className="w-full bg-[var(--surface-2)] border border-[color:var(--border)]/60 text-[var(--text)] placeholder:text-[var(--text-muted)]/50 focus:border-[color:var(--accent)]/80 focus:ring-2 focus:ring-[color:var(--accent)]/20 rounded-2xl px-5 py-4" />
  <button className="px-6 py-4 bg-gradient-to-r from-[var(--accent)] to-[color:var(--accent-2)] hover:shadow-[0_10px_30px_-8px_var(--accent-rgb)]/40 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all active:scale-95">Click Me</button>
</div>
`;

/**
 * FILES UPDATED FOR CONSISTENCY
 */

const UPDATED_FILES = {
  'features/auth/authStyles.ts': 'Core auth styling with CSS variables',
  'features/auth/AuthView.tsx': 'Main auth flow UI',
  'features/auth/SystemLauncher.tsx': 'System selection screen',
  'components/NeuralHUD.tsx': 'Floating HUD component',
  'components/MobileNav.tsx': 'Mobile navigation (already consistent)',
  'components/Sidebar.tsx': 'Desktop sidebar (already consistent)',
};

/**
 * MIGRATION GUIDE
 * How to update existing components
 */

const MIGRATION_STEPS = [
  '1. Replace hardcoded colors with CSS variables',
  '2. Use gradient backgrounds with from-/to- prefixes',
  '3. Add consistent border styling with border-[color:var(--border)]',
  '4. Use responsive sizing (md: prefix for medium+ screens)',
  '5. Add focus/hover states using transition-all',
  '6. Test light/dark mode switching',
  '7. Verify mobile, tablet, and desktop layouts',
];

export {
  CSS_COLORS,
  COMPONENT_PATTERNS,
  TYPOGRAPHY,
  SPACING,
  CONSISTENCY_CHECKLIST,
  UPDATED_FILES,
  MIGRATION_STEPS,
};
