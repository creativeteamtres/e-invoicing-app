# Phase 2 — App Foundation and Design System

**Status:** Foundation implemented  
**Scope:** Frontend shell and representative dashboard screen only; invoice/business logic and backend are not connected.

## What is in place

- Independent browser frontend shell with a workspace sidebar, responsive navigation, page header, dashboard layout, overview cards, recent invoice table, activity feed, and compliance setup panel.
- Shared visual tokens and UI patterns in `styles.css`: color, spacing, typography, buttons, cards, status badges, notifications, and responsive breakpoints.
- Accessible labels on icon-only controls, semantic navigation/table structure, a live status region for feedback, and reduced-motion handling.
- Simple interaction scaffolding in `app.js`: mobile navigation, dismissible setup notice, navigation state, and honest placeholder messages for features that belong to later phases.
- No framework or UI package was assumed because the project had no frontend framework configured. The current prototype is dependency-free HTML/CSS/JS; choose the long-term framework before building Phase 3 features.

## Registry note

The shadcn MCP is available, but the project has no `components.json` and no registry configured. The MCP audit checklist was reviewed. This phase uses a small custom design system rather than importing registry components. Configure the frontend stack and registry before adopting shadcn components in a later implementation phase.

## Known boundaries

- All invoice values and activity are illustrative static data, not customer data.
- Buttons for later-phase workflows show a clear placeholder message; there is no invoice creation, persistence, authentication, compliance validation, delivery, or real archive in this phase.
- This visual shell is not a legal compliance claim.

## Phase 2 acceptance

- A coherent desktop dashboard shell and responsive mobile navigation are present.
- Core UI patterns are consistent and reusable by later screens.
- No backend coupling or framework choice was introduced.
- Placeholder actions make the implementation boundary clear.

## Next

**Phase 3 — Authentication and organization setup:** decide/establish the application framework and backend contract, then implement sign-in, organization profile, team roles, and tenant-aware session boundaries.
