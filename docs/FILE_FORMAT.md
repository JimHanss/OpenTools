# OpenTools mind-map file format

OpenTools uses an editable JSON document format. The current normalized format
is `schemaVersion: 2` and is the only format written by **Export JSON**.

## Top-level shape

```json
{
  "schemaVersion": 2,
  "id": "map-id",
  "title": "Project plan",
  "rootNodeId": "root",
  "nodes": { "root": { "...": "topic record" } },
  "relationships": [],
  "boundaries": [],
  "summaries": [],
  "createdAt": "2026-07-15T00:00:00.000Z",
  "updatedAt": "2026-07-15T00:00:00.000Z"
}
```

`id`, topic IDs, timestamps, and record IDs are strings. Importing a file
creates a new local map and reassigns map and topic IDs; relationships,
boundaries, and summaries are remapped to those fresh topic IDs.

## Topic records

Each `nodes` entry is keyed by the same ID held in `node.id`.

```json
{
  "id": "topic-1",
  "parentId": "root",
  "childIds": [],
  "text": "Topic",
  "collapsed": false,
  "markers": [{ "kind": "priority", "value": "1" }],
  "notes": "Optional plain-text notes",
  "links": [{ "label": "Reference", "url": "https://example.com" }],
  "style": {
    "backgroundColor": "#ffffff",
    "borderColor": "#7c6ff2",
    "textColor": "#1e1b4b",
    "fontSize": 14,
    "fontWeight": "semibold",
    "fontStyle": "normal",
    "shape": "rounded-rectangle"
  }
}
```

Marker kinds are `priority`, `status`, and `icon`. A topic can have at most one
priority and one status marker, while it can have multiple icon markers.

## Tree invariants

The document must contain exactly one root topic. Its `parentId` is `null`; all
other topics have one existing parent and are present once in that parent's
`childIds`. Child ordering is meaningful. Cycles, missing references, duplicate
children, disconnected topics, and invalid roots are rejected during import and
export validation.

## Enhancement records

Relationships connect two different existing topics:

```json
{
  "id": "rel-1",
  "fromNodeId": "topic-1",
  "toNodeId": "topic-2",
  "label": "depends on"
}
```

Boundaries and summaries group one or more existing topics:

```json
{ "id": "boundary-1", "nodeIds": ["topic-1", "topic-2"], "label": "Scope" }
```

Record IDs must be unique within their respective collections. Each grouping
cannot repeat a topic ID. Relation/group data remains saved when topics are
collapsed; only its visible rendering is hidden if every referenced topic is not
currently visible.

## Version migration and compatibility

The parser accepts v1 and v2 documents. V1 marker strings are migrated into
structured v2 markers; missing v2 enhancement collections default to empty
arrays so earlier v2 exports continue to import. Files with a future schema
version, invalid field types, or invalid tree/enhancement references are safely
rejected and do not alter the existing library.

This is an internal OpenTools format. XMind, OPML, Markdown, and other external
mind-map formats are not part of the MVP compatibility contract.
