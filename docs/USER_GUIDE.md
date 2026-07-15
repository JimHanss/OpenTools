# OpenTools user guide

## Working with maps

The library is the starting screen. Create a map, open an existing map, rename
or duplicate it, and delete it only after confirmation. Changes to an open map
are saved locally in the browser automatically. The status in the editor header
shows `Saving`, `Saved locally`, or a recoverable save error.

## Create and edit topics

Select a topic with a click. Use `Ctrl` (or `Command` on macOS) while clicking
to add or remove topics from the selection. Double-click a topic or press `F2`
to edit its text.

| Action                           | Shortcut                                                      |
| -------------------------------- | ------------------------------------------------------------- |
| Add a sibling                    | `Enter`                                                       |
| Add a child                      | `Tab`                                                         |
| Edit selected topic              | `F2` or double-click                                          |
| Commit text edit                 | Click away, or `Ctrl`/`Command` + `Enter`                     |
| Cancel text edit                 | `Esc`                                                         |
| Delete selected topics           | `Delete` or `Backspace`                                       |
| Undo / redo                      | `Ctrl`/`Command` + `Z`, then `Ctrl`/`Command` + `Shift` + `Z` |
| Copy / cut / paste               | `Ctrl`/`Command` + `C` / `X` / `V`                            |
| Duplicate selected topic subtree | `Ctrl`/`Command` + `D`                                        |
| Select all topics                | `Ctrl`/`Command` + `A`                                        |

Keyboard commands are suppressed while typing in a form field or while an IME
composition is active. The root topic cannot be deleted or moved below another
topic.

## Arrange the canvas

Drag a topic onto another topic to make it a child, or above/below it to reorder
siblings. A highlighted preview indicates a valid destination. Invalid drops,
including a drop onto a descendant, are rejected without modifying the map.

Drag empty canvas space to pan. Use the mouse wheel or zoom controls to zoom,
then use **Fit** or **Center selected** to navigate. Collapse controls hide a
branch without deleting its data; searches expand the ancestors of the active
result when necessary.

The **Tidy all** toolbar button previews the number of sibling branches that
would be alphabetically reordered. It does not reparent topics. After applying
it, use Undo to restore the exact prior order.

## Topic details and structure tools

The topic inspector provides color/style presets, priority/status/icon markers,
notes, and safe `http`, `https`, or `mailto` links. Links only open after an
explicit click.

With two selected sibling or otherwise independent topics, the **Structure**
section can create, rename, or delete a directed relationship line. With two or
more selected top-level topics, it can add, rename, or delete a boundary and a
summary. These records are local to the map, participate in undo/redo, and are
included in SVG and PNG exports. If a grouped topic is hidden by collapse, its
relationship/group decoration is hidden too, while the saved data remains.

## Search

Use **Search topics** to find topic text without case sensitivity. The previous
and next buttons cycle through matches, select the active result, expand its
required ancestors, and center it on the canvas.

## Backup, import, and export

Use **Export JSON** for an editable backup. The resulting OpenTools JSON file
round-trips map content, styling, metadata, collapse state, relationships,
boundaries, summaries, and ordering. **Import JSON** always creates a separate
local copy with fresh internal IDs, so it never overwrites an existing map.

**Export SVG** produces a full-map vector image independent of the current zoom
or viewport. **Export PNG** rasterizes that complete SVG; if a browser canvas
cannot safely render the requested image size, OpenTools reports the issue and
downloads SVG instead.

Browser storage is local to the browser profile and device. Clearing browser
site data, using private browsing, changing profiles, or a browser storage
failure can remove or make maps unavailable. Export JSON regularly for durable
backups.
