# Design System Specification: The Luminous Interface

## 1. Overview & Creative North Star
**Creative North Star: "The Intelligent Atmosphere"**

This design system transcends the transactional nature of kiosks to create an environmental experience. We move away from "software on a screen" toward a "digital concierge" that feels integrated into the physical space. The aesthetic rejects the rigid, boxy constraints of traditional UI in favor of **Organic Layering**. 

By utilizing intentional asymmetry, expansive negative space, and a "depth-first" hierarchy, we create a signature look that is both authoritative and welcoming. The UI doesn't sit *on* the glass; it lives *within* it.

---

### 2. Colors & Surface Philosophy
Our palette is rooted in the depth of a midnight sky, using high-contrast "luminous" accents to guide the user’s eye.

#### The "No-Line" Rule
**Strict Mandate:** 1px solid borders are prohibited for sectioning or containment. 
Structure must be defined through **Background Color Shifts** and **Tonal Transitions**. For example, a `surface-container-low` action area should sit directly against a `surface` background. The eye should perceive change through value, not outlines.

#### Surface Hierarchy & Nesting
Treat the interface as a physical stack of semi-translucent materials.
- **Base Layer:** `surface` (#0b1326) – The foundation.
- **Secondary Sections:** `surface-container-low` (#131b2e) – For grouping related content.
- **High-Emphasis Cards:** `surface-container-high` (#222a3d) – For interactive modules.
- **The Glass & Gradient Rule:** For primary AI interactions or floating "Action Bars," use `surface-bright` at 60% opacity with a `24px` backdrop blur. Apply a subtle linear gradient from `primary_container` (#4f46e5) to `primary` (#c3c0ff) at 10% opacity to give the "glass" a signature indigo tint.

---

### 3. Typography
We utilize **Inter** to bridge the gap between technical precision and human accessibility.

*   **Display (Large/Medium):** Reserved for "Welcome" states and primary AI feedback. Use `-0.02em` letter spacing to create an editorial, high-end feel.
*   **Headline (Small/Medium):** The workhorse for section headers. Ensure `headline-lg` (2rem) is used for touch-point titles to maintain visibility from a standing distance.
*   **Body (Large):** All instructional text must use `body-lg` (1rem) as a minimum to ensure WCAG AAA compliance on kiosk hardware.
*   **The Hierarchy Rule:** Establish a 2:1 ratio between headlines and body text. Large, bold headlines convey authority; clean, spacious body text conveys reliability.

---

### 4. Elevation & Depth
Depth in this system is a functional tool for accessibility, not just an aesthetic choice.

*   **Tonal Layering:** Instead of drop shadows for everything, use the `surface-container` scale. A `surface-container-highest` element placed on `surface-dim` provides a "natural lift" that is easier for users with cognitive impairments to process than complex shadows.
*   **Ambient Shadows:** When an element must "float" (e.g., a modal or a primary FAB), use a wide-dispersion shadow: `0px 24px 48px rgba(0, 0, 0, 0.4)`. The shadow must never be pure black; it should be a deep indigo-tinted shadow to maintain the "Atmosphere" aesthetic.
*   **The Ghost Border Fallback:** If a boundary is strictly required for accessibility (e.g., high-contrast mode), use `outline-variant` (#464555) at **15% opacity**. 

---

### 5. Components

#### Buttons (The Physical Touchpoint)
*   **Primary:** Background: `primary_container` (#4f46e5). Text: `on_primary_container`. Shape: `xl` (3rem/48px) roundedness. 
*   **Accessibility:** Minimum height is **56px** for all kiosk buttons to accommodate all motor skill levels.
*   **Interaction:** On press, the button should scale down slightly (98%) and increase in brightness, providing tactile-style visual feedback.

#### AI Processing Chips
*   **Visual Style:** Use `secondary_fixed_dim` (#4edea3) with a subtle pulse animation.
*   **Layout:** Icons must be a minimum of `24px` with a `1rem` gap from the text label.

#### Inputs & Forms
*   **The Floating Field:** Input fields should not have a bottom line. They are containers (`surface-container-highest`) with `md` (1.5rem) corner radius.
*   **Focus State:** Instead of a thin blue line, a focused input should gain a 2px "inner glow" using the `primary` token (#c3c0ff).

#### Cards & Lists
*   **Constraint:** No dividers. Use the Spacing Scale `8` (2.75rem) to separate list items. 
*   **Visual Grouping:** Use a subtle background shift (`surface-container-low`) for the entire list area to differentiate it from the page background.

#### Accessibility Mode Toggles
*   **Persistent Element:** A high-visibility floating action button (FAB) in the bottom-left corner, using `tertiary_fixed` (#ffddb8) to ensure it is always findable for users needing assistance.

---

### 6. Do’s and Don’ts

#### Do:
*   **Do** use asymmetrical layouts. Place primary content on the left and supporting "AI Insights" in a floating glass container on the right.
*   **Do** use the `lg` (2rem) and `xl` (3rem) corner radius for large containers to soften the professional tone.
*   **Do** ensure a minimum contrast ratio of 7:1 for all instructional text.

#### Don’t:
*   **Don't** use 100% white (#FFFFFF). Use `on_surface` (#dae2fd) to reduce eye strain in low-light kiosk environments.
*   **Don't** use "Standard" 4px or 8px rounded corners. It looks like a generic web template; stick to the `16px+` scale.
*   **Don't** use scrollbars. Design the UI to be paginated or use large, "swipe-friendly" zones to prevent motor-skill frustration.