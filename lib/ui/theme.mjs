/**
 * mcp-testmate brand system. Define once, use everywhere — both the Ink
 * renderer and any future surface pull identity from here. The plain (CI)
 * renderer intentionally uses none of it: no ANSI, symbols only.
 */
export const theme = {
  colors: {
    primary: "#22d3ee", // cyan — identity, spinners, success-adjacent chrome
    accent: "#e879f9", // magenta — wordmark/headers ONLY, never body text
    success: "#4ade80",
    warning: "#facc15",
    breaking: "#f87171",
    info: "#22d3ee",
    dim: "gray",
  },
  gradient: ["#22d3ee", "#e879f9"], // wordmark: cyan → magenta
  symbols: {
    success: "✓",
    warning: "⚠",
    breaking: "✗",
    info: "●",
    bullet: "·",
    arrow: "→",
    pointer: "❯",
  },
  wordmark: "mcp-testmate",
  tagline: "Snapshot your tools. Catch schema drift. Know when it breaks.",
};

export const SEVERITY_ORDER = ["breaking", "warning", "info"];

export const severityStyle = {
  breaking: { symbol: theme.symbols.breaking, color: theme.colors.breaking, title: "BREAKING" },
  warning: { symbol: theme.symbols.warning, color: theme.colors.warning, title: "WARNING" },
  info: { symbol: theme.symbols.info, color: theme.colors.dim, title: "INFO" },
};
