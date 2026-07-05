import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import Gradient from "ink-gradient";
import { theme } from "./theme.mjs";

export const h = React.createElement;

/** Gradient wordmark + tagline. Shown ONLY on init and --help. */
export function Wordmark() {
  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(Gradient, { colors: theme.gradient }, h(Text, { bold: true }, theme.wordmark)),
    h(Text, { dimColor: true }, theme.tagline)
  );
}

/** Animated progress line: ◐ Connecting to server… */
export function Phase({ label }) {
  return h(
    Text,
    null,
    h(Text, { color: theme.colors.primary }, h(Spinner, { type: "dots" })),
    ` ${label}`
  );
}

/** Inverse-video capability chips: [ tools ] [ resources ] */
export function Chips({ items }) {
  if (items.length === 0) return h(Text, { dimColor: true }, "none declared");
  const chips = [];
  items.forEach((item, i) => {
    if (i > 0) chips.push(h(Text, { key: `sp-${i}` }, " "));
    chips.push(
      h(Text, { key: item, backgroundColor: theme.colors.primary, color: "black" }, ` ${item} `)
    );
  });
  return h(Text, null, ...chips);
}

const toneColor = {
  breaking: theme.colors.breaking,
  warning: theme.colors.warning,
  success: theme.colors.success,
};

/** The quotable one-line verdict. */
export function Verdict({ verdict }) {
  return h(
    Text,
    { bold: true, color: toneColor[verdict.tone] },
    `${verdict.symbol} ${verdict.text}`
  );
}

/** Branded error block: what failed, likely cause, exact fix. Never a stack. */
export function ErrorBlock({ error }) {
  return h(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: theme.colors.breaking,
      paddingX: 1,
      alignSelf: "flex-start",
    },
    h(Text, { bold: true, color: theme.colors.breaking }, `${theme.symbols.breaking} ${error.message}`),
    error.likely && h(Text, { dimColor: true }, `likely: ${error.likely}`),
    error.fix &&
      h(Text, null, h(Text, { dimColor: true }, "try:    "), h(Text, { color: theme.colors.primary }, error.fix))
  );
}
