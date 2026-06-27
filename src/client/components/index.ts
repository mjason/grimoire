import { userComponents } from "../generated/manifest";
import { Chart } from "./Chart";
import { DataTable } from "./DataTable";
import { Callout } from "./Callout";
import { Tabs, Tab } from "./Tabs";
import { Steps, Step, Card, CardGrid, Badge, Kbd } from "./Layout";
import { Pre, H2, H3, H4, A, Table } from "./elements";

/**
 * The component map handed to every MDX note via <MDXProvider>.
 *
 * Order matters: built-in components first, then user components from
 * `components/`, so authors can override or extend anything they like.
 * Lowercase keys (a, h2, pre, table) override the default HTML elements that
 * markdown produces.
 */
export const mdxComponents: Record<string, any> = {
  // HTML element overrides
  a: A,
  pre: Pre,
  h2: H2,
  h3: H3,
  h4: H4,
  table: Table,
  // Built-in rich components
  Chart,
  DataTable,
  Callout,
  Tabs,
  Tab,
  Steps,
  Step,
  Card,
  CardGrid,
  Badge,
  Kbd,
  // User components (components/) — registered last so they win on conflicts.
  ...userComponents,
};
