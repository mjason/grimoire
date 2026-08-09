import { Chart } from "./Chart";
import { DataTable } from "./DataTable";
import { Callout } from "./Callout";
import { Tabs, Tab } from "./Tabs";
import { Steps, Step, Card, CardGrid, Badge, Kbd } from "./Layout";
import { Pre, H2, H3, H4, A, Table } from "./elements";
import { Mermaid } from "./Mermaid";
import { WikiLink } from "./WikiLink";
import { Graph, GraphView } from "./GraphView";
import { Backlinks, Connections, Links } from "./Connections";
import { CardBody, CardTile, Cards } from "./Cards";

/**
 * Built-in components + the HTML element overrides (a, pre, h2…, table) handed
 * to every MDX note. User components from the project's `components/` directory
 * are loaded at runtime and merged on top (so they can override these).
 */
export const builtinComponents: Record<string, any> = {
  // HTML element overrides
  a: A,
  pre: Pre,
  h2: H2,
  h3: H3,
  h4: H4,
  table: Table,
  mermaid: Mermaid, // ```mermaid fenced blocks (via rehypeMermaid)
  wikilink: WikiLink, // [[wiki links]] (via remarkWikiLink)
  // Built-in rich components
  Mermaid,
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
  // Knowledge graph + card notes
  WikiLink,
  Graph,
  GraphView,
  Backlinks,
  Links,
  Connections,
  Cards,
  CardTile,
  CardBody,
};
