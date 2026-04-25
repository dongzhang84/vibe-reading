# Vibe Reading — Technical Pipeline

## Type
Flowchart (4 stacked phase rows, each with 4 sequential steps + tech tags)

## Source
`docs/vibe-reading-implementation.md` (v2 question-driven)

## Reader need
"After seeing this diagram, the reader understands the entire technical
pipeline: which lib runs when, where each LLM call happens, what gets cached
where, and what the operational cost shape is per phase."

## Mermaid sketch

```mermaid
flowchart TD
  subgraph A["PHASE A — Intake (1×/book)"]
    A1[Upload PDF] --> A2[Parse]
    A2 --> A3[Intake AI]
    A3 --> A4[Persist]
  end

  subgraph B["PHASE B — Question (per Q)"]
    B1[Submit Q] --> B2[Build context]
    B2 --> B3[Relevance AI]
    B3 --> B4[Save matches]
  end

  subgraph C["PHASE C — Brief (per chapter, cached)"]
    C1[Click Brief] --> C2[/api/brief]
    C2 --> C3[Briefer AI]
    C3 --> C4[Render]
  end

  subgraph D["PHASE D — Read (per highlight, optional)"]
    D1[Click Read] --> D2[Show PDF]
    D2 -.->|on highlight| D3[Highlight]
    D3 --> D4[Asker AI]
  end
```

## Layout
- 680×730 viewBox
- 4 phase containers, h=130, gap=10
- Each container: eyebrow + right-corner punch (accent) on top row;
  4 step boxes (100w × 48h) connected with arrows; tech tag below each box
- Right-corner shows operational cost shape (LLM calls per N)
- Footer summarizes: all gpt-4o-mini, no embeddings, just pdfjs + 4 LLM types
