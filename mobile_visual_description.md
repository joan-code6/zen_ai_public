# Objective visual and file-text description (no interpretation)

This file records only directly observable UI text, layout elements, and file headings found in the repository and in the supplied screenshots. No interpretation or inferred meaning is included.

## Screenshots — image A (left / main view)
- Top-left corner: text "Zen AI" (appears as app title/logo).
- Directly below the top-left area: a search input with placeholder text "Search chats...".
- A large rounded button near the top-left: "+ New Chat".
- Left vertical navigation list contains items (visible labels):
  - "Email"
  - "Calendar"
  - "Notes"
  - "Files"
- A section label: "TODAY" above a vertical list of chat items. Several chat item labels/snippets visible including:
  - "-"
  - "sag mir wa..."
  - "analysiere ..."
  - "wie spä"
  - "_ _"
  - "write a ess..."
  - "hey! write ..."
- A section label: "PREVIOUS 7 DAYS" with additional chat items including:
  - "hey!"
  - "what is 1+1?"
  - "hey"
- Bottom-left shows a circular avatar with letter "B" and label lines:
  - "Bennet"
  - "test@web.de"

## Screenshots — image B (center / conversation view)
- Centered large heading text near top of conversation area: "Start a conversation, Bennet".
- A faint placeholder below the heading: "Type your message...".
- Above the input are horizontal suggestion chips with labels including:
  - "Explain quantum computing"
  - "Help me debug code"
  - "Write a story"
  - "Plan a trip"
- Conversation area shows a long message with a recipe. Visible lines and headings include:
  - A bulleted ingredient list lines such as "4 cups powdered sugar", "1 tsp vanilla extract"
  - A heading: "Instructions"
  - Numbered steps starting with "1.", "2.", "3.", etc.
  - Step lines include: "Preheat oven to 350°F (175°C). Grease and flour two 9-inch round cake pans.", "Mix dry ingredients: In a large bowl, whisk together flour, sugar, baking powder, and salt.", "Cream butter and sugar: Beat softened butter until fluffy, then add eggs one at a time. Mix in vanilla.", "Bake: Divide batter evenly between pans. Bake for 25-30 minutes, or until a toothpick inserted comes out clean. Cool completely.", "Make frosting: Beat butter until fluffy, then gradually add powdered sugar. Mix in strawberry puree and vanilla until smooth and pink.", "Assemble: Frost between layers and on top/sides. Decorate with fresh strawberry slices."
  - A tip line: "Tip: For extra strawberry flavor, add ¼ cup freeze-dried strawberry powder to the batter!"
  - A final line: "I searched your notes for any baking preferences or recipe history, but didn't find anything saved yet. Enjoy baking!"
- Below the message content is a small button or control labeled "Search Notes" (visible as a pill-shaped control).
- Bottom input area (fixed to bottom) contains:
  - A rounded pill text input with placeholder text "Ask anything..." (also seen: "Ask anything..." inside input area)
  - A small toolbar above/near the input showing toggles/labels: "GLM 5", "Web", "3 results", and "Image"
  - Small action icons to the right of the input (visible as icons): paperclip (attach), microphone (mic).
  - At lower-left of the input area a small model label visible in the second screenshot: "kimi-k2.5".

## Other visible UI items
- A small toast or notification at bottom-right with text: "Settings saved" and a checkmark icon.
- Thin vertical scrollbar visible on the right of the conversation area.

## Observed files and exact headings / lines (read from repository files)
- File: `AGENTS.md`
  - Visible heading: "## Design Thinking"
  - First paragraph lines include: "Before coding, understand the context and commit to a BOLD aesthetic direction:"
  - Bulleted items present: "**Purpose**: What problem does this interface solve? Who uses it?", "**Tone**: Pick an extreme: brutally minimal, maximalist chaos, ...", "**Constraints**: Technical requirements (framework, performance, accessibility).", "**Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?"
  - A section heading: "## Frontend Aesthetics Guidelines"
  - Under that, bullets such as: "**Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; ...", and "**Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency."
  - Further lines include: "## Were to look" and "## Working on the Backend" and a final "# AI Agents" section with agent rules.

- File: `c:\Users\benne\AppData\Roaming\Code\User\prompts\design.instructions.md`
  - File begins with an instruction block and heading: "## Design Thinking"
  - Contains text: "Before coding, understand the context and commit to a BOLD aesthetic direction:" followed by bullets matching the `AGENTS.md` content (Purpose, Tone, Constraints, Differentiation).
  - Contains a heading: "## Frontend Aesthetics Guidelines" and bullets for Typography, Color & Theme, Motion, Spatial Composition, Backgrounds & Visual Details.

- File: `admin/index.html`
  - HTML title element text: "Zen AI Admin"
  - Contains root div `<div id="root"></div>` and script reference `<script type="module" src="/src/main.tsx"></script>`.

## Notes about what is included here
- All entries above are literal, observed text and UI elements taken from the screenshots and from the repository files read while preparing this document.
- No interpretations, tone descriptions, emotional descriptors, or inferred meanings are included — only visible labels, headings, and text lines.

## Design & Layout Observations (for mobile adaptation)

The following lists concrete layout, spacing, and component characteristics visible in the screenshots and repository that are relevant when recreating the app on mobile. These are implementation-focused observations intended to preserve the visual structure and hierarchy.

- Global layout:
  - Two-panel composition on desktop: a left vertical navigation column and a central conversation column. Mobile should collapse the left column into a drawer or bottom navigation.
  - Conversation column is centered and constrained horizontally (content uses a readable line length rather than full-bleed). Preserve readable line width on mobile with generous side padding.

- Sidebar / navigation:
  - Sidebar width on desktop visually occupies roughly 220–260 px; items are stacked vertically.
  - Navigation includes a top search field then a primary CTA button (`+ New Chat`) followed by stacked menu items and a dense chat list.
  - Chat list shows compact rows (approx 44 px height per row visually) with small avatar, title/snippet, and time/snippet truncation.

- Header / hero area (conversation column):
  - Large centered heading text area: "Start a conversation, Bennet" located near the top of the conversation column with a small placeholder tagline below it.
  - Suggestion chips arranged horizontally beneath the heading; chips are pill-shaped and appear in a single row. On mobile they should be horizontally scrollable.

- Message content area:
  - Single-column message flow with large vertical rhythm between messages; long content wraps and shows numbered steps and bulleted lists.
  - Content uses comfortable line-height (visually ~1.4–1.6) and body text around 15–16 px on desktop; mobile should scale to preserve legibility (approx 16–18 sp).
  - The conversation pane shows a thin vertical scrollbar and a subtle background separation from the sidebar.

- Composer / input area:
  - Fixed input bar anchored to the bottom of the viewport. The text field is a rounded pill spanning most of the center column width.
  - Composer includes small action icons on the right (attach/paperclip and microphone) and an optional model label at the lower-left of the input area.
  - A compact toolbar of toggles (e.g., "GLM 5", "Web", "3 results", "Image") appears above or near the input — these should remain easily accessible on mobile (as a small toolbar or popover).

- Controls, shape & spacing:
  - Rounded corners are consistent across controls: chips, inputs, buttons use a soft pill radius (approx 10–16 px on desktop; scale down on mobile to 8–12 dp where appropriate).
  - Iconography uses thin-line icons at ~20–24 px on desktop; preserve consistent stroke-weight on mobile with 20–24 dp icons.
  - Touch-targets should be at least 44x44 dp on mobile; translate the dense desktop list into slightly larger tappable rows on mobile.

- Visual hierarchy & contrast:
  - Primary content (messages, headings) is bright/white on very dark backgrounds; secondary text (snippets, timestamps) is muted gray.
  - Important actions such as `+ New Chat` are visually distinct (pill button near top-left on desktop); on mobile make `New Chat` available as a prominent FAB or pinned control.

- Micro-interactions and motion cues:
  - Hover/pressed states are subtle: small brightness changes, slight scale on active press (approx 0.98). Mobile should use short, snappy animations (120–220ms) for presses and toggles.
  - Toast notifications appear bottom-right on desktop; on mobile they should appear above the input or center-bottom to avoid conflict with the composer.

- Component sizes (visually estimated, for dev reference):
  - Sidebar width (desktop): ~220–260 px
  - Chat row height: ~44 px
  - Avatar diameter: ~36 px
  - Main heading font-size (desktop): 22–28 px
  - Message body font-size (desktop): 15–16 px
  - Suggestion chip height: ~36 px, pill radius ~18 px
  - Composer height (desktop, including padding): ~64 px; mobile composer should be 56–64 dp high with comfortable padding.

## Implementation hints
- Preserve the centered constrained column for reading long responses; on mobile use side padding 16–20 dp and internal max content width to limit line length.
- Convert desktop sidebar to a mobile drawer or bottom navigation; keep search and `New Chat` easily reachable (top or as FAB).
- Keep suggestion chips visible and reachable — make them horizontally scrollable and ensure they do not obstruct the composer when the keyboard is open.
- Maintain consistent rounded radii and low-saturation accents to match the app's visual identity (export color and spacing tokens from these measurements).

