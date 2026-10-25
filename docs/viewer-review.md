# Initial reader-task review

Review date: 2026-10-25. Scope: the original three-document cohort in the local reference viewer, compiled IR v0.2 and browser interaction checks. This is a technical walkthrough and interface assessment; it does not replace reader feedback or establish editorial correctness.

## Tasks and evidence

| Document | Reader task | Observed result |
| --- | --- | --- |
| 0001 | Read the letter and inspect interventions, entity evidence and commentary | Envelope/letter order and direct text are preserved. Keyboard activation exposes overlapping evidence. The interpretation retains its prose, high certainty, three responsible contributors and pinned source provenance. Source-range navigation now marks the selected passage. |
| 0040 | Understand the envelope/letter/poem structure and connect text with images | The nested envelope, letter and both poem occurrences are preserved in IR order. The repeated poems now have distinct occurrence labels. Page anchors expose associated image resources. The browser check compares every part’s direct rendered text to its IR text. |
| 0078 | Explore a photograph without treating it as an empty transcription | No textual content is fabricated. Participant descriptions distinguish left side, right side and photographer; setting/date and image resource are present. Missing authority names remain explicit. The real image was decoded after correcting the retired service paths. |

The source cohort contains 31 annotations in 0001, 718 in 0040 and none in 0078. It has four, six and one image resources respectively. The zero-annotation photograph still has meaningful participants and setting through relations. That supports keeping Document distinct from a textual AST.

## Presentation fixes made

1. **Repeated part labels were ambiguous.** Both poem navigation items were simply “poem.” The viewer now labels repeated kinds by occurrence in explicit document order, e.g. “poem 1 of 2” and “poem 2 of 2.” Labels do not assert titles, separate intellectual works or separate physical objects. Reordered storage arrays give the same labels.
2. **Passage navigation was too coarse.** “Go to” previously scrolled to the containing part. It now highlights the exact source range across inline segments and page-event boundaries and moves keyboard focus to that passage. Zero-width ranges fall back to identifying the containing part; no textual position is invented. The same behavior works for references into another supplied document while retaining the selected record’s inspector.

3. **Browser Back left the reader.** User feedback identified that internal navigation created no history entries. Document/record views, overlapping-evidence choices and part jumps now use native history with opaque-ID URL fragments. Back/Forward restore the previous views, and demo links survive reload. Uploaded files remain in memory and must be reopened after reload.

These changes use existing IDs, order, part ownership and UTF-16 ranges. They do not alter TEI, compiled IR, editorial filtering or source selectors.

## Remaining findings

| Finding | Category | Next action |
| --- | --- | --- |
| The annotation dropdown in 0040 mixes 718 structural, editorial and language records. | Presentation | Consider a kind/part filter after the human walkthrough. Keep zero-width and structural records discoverable; do not discard them to simplify the display. |
| Selecting text evidence replaces a page image in the shared inspector. Sustained text/image comparison takes repeated navigation. | Presentation | Evaluate a separately retained image pane or selected-page state. This needs no new IR fields: anchors already identify image resources. |
| Canonical entity labels are absent without authority indexes. Generic entity labels are difficult to distinguish outside their role/occurrence context. | Missing supplied data | Review with explicit authority inputs before considering identity/name inference. Keep occurrence labels distinct from canonical labels. |
| Image service identities are not distinguished from display renditions, and uploaded JSON does not carry the demo’s preview/source-link mappings. | IR/artifact portability candidate | Test a second real edition’s image conventions before choosing a service/rendition contract. The build adapter is an explicit demo accommodation, not a portable solution. |
| Dates can be verbose because display labels preserve timestamp intervals. | Presentation | Improve formatting only with explicit precision/interval handling; retain access to original values and avoid timezone conversion guesses. |
| Diplomatic text plus ranges cannot establish revision sequence or a final reading. | Deliberate scope limit | Keep filtering policies explicit. Additional revision models need independent source evidence. |

## Assessment

The current reader provides no evidence requiring a richer content tree or a new IR version. Ordered parts, text ranges, independent mentions/entities and explicit relations cover the tested tasks. Image service/rendition portability remains a concrete unresolved modeling boundary. Working images in this demo do not resolve that boundary for arbitrary editions.

Before expanding viewer features, a human walkthrough should judge whether the editorial marks are understandable, whether nested parts communicate the compound object, and whether the photograph feels complete. Use 0001’s Kassner commentary, both poem occurrences in 0040 and 0078’s three participant roles as checkpoints.

After that feedback, the next architecture validation should use a small, independently licensed real edition with a contrasting apparatus/witness or stand-off structure. The synthetic fixture establishes configurability only; the Auden cohort alone cannot establish generality. Record source revision, licensing and evidence before vendoring another corpus, and compile the smallest representative sample before extending mappings.

## Verification

Typecheck and all 196 unit/integration tests pass. The browser regression covers native Back/Forward and reload restoration, exact passage highlighting, distinguishable poem occurrences, commentary/attribution access, source links, image success/failure, JSON upload validation and mobile layout, with no XML requests or browser runtime exceptions. Image-success simulation and live upstream checks remain separately identified in the viewer notes.
