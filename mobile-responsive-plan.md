# Prompt for Claude Code: Helix Mobile Responsive UI Fix

You are tasked with bringing the Helix web application up to modern mobile-responsive standards. Follow these strict token-efficiency guidelines to complete the work:
1. **Minimize Context:** Only read and modify the specific files mentioned below. Do not scan unrelated directories or search broadly.
2. **Execute Directly:** Implement the fixes immediately using targeted edits rather than rewriting entire files when possible.
3. **Adhere to `ui-ux-pro-max`:** Enforce minimum `44x44px` touch targets for interactive elements and ensure `16px` minimum text size for inputs to prevent iOS auto-zoom.

Please execute the following 5 tasks systematically:

### Task 1: Viewport & Base Styles
- **Files:** `app/layout.tsx` and `styles/globals.css`
- **Action:** In `layout.tsx`, ensure the viewport is explicitly defined (export a `viewport` object with `width: 'device-width', initialScale: 1, maximumScale: 1`). In `globals.css`, verify that the base typography ensures inputs and body text don't fall below `16px` on mobile.

### Task 2: Responsive Sidebar & Navigation
- **Files:** `components/layout/Sidebar.tsx` and `components/layout/TopBar.tsx`
- **Action:** The Sidebar currently has a fixed width of `205px`. Update it so that on mobile screens (`max-width: 768px`), it acts as a hidden sliding drawer or overlay. Add a hamburger menu toggle button in `TopBar.tsx` (visible only on mobile) to control this sidebar. Ensure this button has a `44x44px` minimum touch area.

### Task 3: TopBar Mobile Optimization
- **File:** `components/layout/TopBar.tsx`
- **Action:** The TopBar overflows on small screens due to secondary actions (Export, Share, History). Refactor the TopBar so these non-essential buttons are grouped into a single overflow dropdown menu ("...") exclusively on mobile screens. 

### Task 4: Refactor Dashboard Grid
- **File:** `app/(app)/dashboard/page.tsx`
- **Action:** Locate the `gridTemplateColumns: '24px 1fr 120px 80px 32px'` rule. Convert this into a responsive grid. On mobile devices (`< 768px`), hide the "Last edited" (`120px`) and "Type" (`80px`) columns entirely, collapsing the grid to just the icon, title, and actions (e.g., `24px 1fr 32px`).

### Task 5: Mobile-Friendly Editor
- **File:** `components/editor/Editor.tsx`
- **Action:** The editor container uses hardcoded inline padding (`padding: '44px 60px'`). Refactor this inline style (either using CSS classes or window dimension hooks) so that mobile devices use constrained padding (e.g., `16px 16px`) and desktop devices use the original `44px 60px`. This will fix the forced horizontal scroll.

**Completion Criteria:**
When you finish, the webapp must render without horizontal overflow on mobile screens. Perform a final verification step to ensure none of the newly added mobile touch targets shrink below 44px.
