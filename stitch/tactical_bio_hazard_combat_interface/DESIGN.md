---
name: Tactical Bio-Hazard Combat Interface
colors:
  surface: '#101417'
  surface-dim: '#101417'
  surface-bright: '#363a3d'
  surface-container-lowest: '#0b0f12'
  surface-container-low: '#181c1f'
  surface-container: '#1c2023'
  surface-container-high: '#262a2e'
  surface-container-highest: '#313539'
  on-surface: '#e0e3e7'
  on-surface-variant: '#b9cbb9'
  inverse-surface: '#e0e3e7'
  inverse-on-surface: '#2d3134'
  outline: '#849585'
  outline-variant: '#3b4b3d'
  surface-tint: '#00e478'
  primary: '#f1ffef'
  on-primary: '#003919'
  primary-container: '#00ff87'
  on-primary-container: '#007138'
  inverse-primary: '#006d36'
  secondary: '#ffb5a0'
  on-secondary: '#5f1500'
  secondary-container: '#d73b00'
  on-secondary-container: '#fffbff'
  tertiary: '#fffaf8'
  on-tertiary: '#472a00'
  tertiary-container: '#ffd8ad'
  on-tertiary-container: '#8a5700'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#60ff98'
  primary-fixed-dim: '#00e478'
  on-primary-fixed: '#00210c'
  on-primary-fixed-variant: '#005227'
  secondary-fixed: '#ffdbd1'
  secondary-fixed-dim: '#ffb5a0'
  on-secondary-fixed: '#3b0900'
  on-secondary-fixed-variant: '#862200'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#101417'
  on-background: '#e0e3e7'
  surface-variant: '#313539'
typography:
  display-command:
    fontFamily: Chivo
    fontSize: 3rem
    fontWeight: '900'
    lineHeight: 3rem
    letterSpacing: 0.05em
  display-command-mobile:
    fontFamily: Chivo
    fontSize: 2rem
    fontWeight: '900'
    lineHeight: 2.25rem
    letterSpacing: 0.04em
  headline-tactical:
    fontFamily: Chivo
    fontSize: 1.75rem
    fontWeight: '800'
    lineHeight: 2rem
    letterSpacing: 0.03em
  headline-tactical-mobile:
    fontFamily: Chivo
    fontSize: 1.375rem
    fontWeight: '800'
    lineHeight: 1.625rem
    letterSpacing: 0.03em
  subheader-sector:
    fontFamily: Chivo
    fontSize: 1.125rem
    fontWeight: '700'
    lineHeight: 1.375rem
    letterSpacing: 0.04em
  body-telemetry:
    fontFamily: Geist
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: 0em
  body-telemetry-condensed:
    fontFamily: Geist
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.125rem
    letterSpacing: 0.01em
  label-monospaced-caps:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: '700'
    lineHeight: 0.875rem
    letterSpacing: 0.12em
  metric-readout-lg:
    fontFamily: Chivo
    fontSize: 2.25rem
    fontWeight: '900'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  metric-readout-sm:
    fontFamily: Geist
    fontSize: 1rem
    fontWeight: '700'
    lineHeight: 1rem
    letterSpacing: 0.05em
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a high-stress, precision-engineered tactical HUD operating under extreme environmental failure. Rooted in brutalist military cybernetics, the visual language balances utilitarian weapon telemetry with raw emergency telecommunications. Every interface element exists to deliver vital combat status, threat vectors, and survival readouts instantaneously under high cognitive load.

The aesthetic fuses industrial weapon displays with an aggressive, terminal-based military OS. Sharp orthogonal framing, high-contrast toxic phosphors, micro-bracket accents, and raw monospaced data streams replace decorative ornamentation. The interface creates an atmosphere of hyper-vigilance: cold, methodical, unyielding, and primed for bio-contamination protocols.

## Colors

The chromatic architecture prioritizes rapid cognitive parse rates in low-light gameplay conditions:

- **Hazardous Primary (`#00FF87`):** Represents optimal status, vital HUD telemetry, verified ammunition reserves, and confirmed friendly assets. Radiates an uncalibrated, high-intensity toxic phosphor emission.
- **Combat Urgent Secondary (`#FF5722`):** Reserved for active target locks, direct biological threats, critical hull integrity drops, and lethal contamination breaches.
- **Biohazard Auxiliary (`#F59E0B`):** Denotes peripheral warnings, degraded tactical systems, inventory degradation, and secondary triage notices.
- **Tactical Neutrals (`#090D10`, `#111822`, `#182230`):** Heavy, light-absorbent charcoal and iron slates that eliminate peripheral visual noise. Surfaces are opaque and dense, functioning as terminal physical plating.
- **Signal Text (`#F2F5F8` / `#64748B`):** Stark cold-white readouts against suppressed steel grays ensure micro-labels and system counters remain distinct during rapid eye scans.

## Typography

The typographic hierarchy establishes immediate mechanical authority. 

- **Chivo** governs commanding HUD headers, mission-critical status indicators, sector alarms, and primary scalar numerical counters. Rendered in upper-case styles with tight tracking, it simulates militarized hardware stampings and high-impact digital cockpits.
- **Geist** delivers surgical precision for log dumps, weapon diagnostics, biological status, and modular data readouts. Its technical neutrality maintains pristine clarity down to 11px micro-labels.
- All functional labels (`label-monospaced-caps`) must be set to uppercase with wide tracking (`0.12em`) to emulate military terminal diagnostics and classified operational codenames.

## Layout & Spacing

The layout is structured around an impenetrable tactical grid designed for high-density combat information architecture:

- **12-Column Fluid Grid:** The operational frame divides cleanly into a 12-column matrix with zero-radius docking modules. Center viewport space is preserved for Three.js/WebGL render pipelines, while interface panels lock to peripheral screens edges.
- **Micro-Gutter Snapping:** Compact 1rem (16px) gutters on mobile expanding to 1.5rem (24px) on desktop enforce strict, mechanical panel separation.
- **Perimeter Edge Margins:** Safe zones use strict margins (1rem on touch devices, 2rem on desktop displays) creating physical "cockpit" frames housing perimeter telemetry, threat compasses, and survivor status pods.
- **Responsive Stacking:** Handheld viewports collapse tactical side-drawers into horizontal thumb-accessible edge dockers; all data tiles drop auxiliary telemetry and retain only primary metrics and bar status indicators.

## Elevation & Depth

This system rejects soft organic drop shadows, depth-of-field blurs, and curved skeuomorphism. Depth is produced via rigid mechanical layering, calibrated ambient phosphor blooms, and structural outlines:

- **Level 0 (Void Plane):** Raw canvas (`#090D10`) hosting the 3D WebGL viewport canvas. No panels, just unobstructed tactical rendering.
- **Level 1 (Docked Structural Chassis):** Base tactical panels (`#111822`) with hairline boundary borders (`1px solid rgba(255, 255, 255, 0.08)`).
- **Level 2 (Interactive Modules & Triage Cards):** Highlighted tactical containers (`#182230`) bordered by deliberate high-contrast outlines (`1px solid rgba(0, 255, 135, 0.3)`).
- **Phosphor Light Injection:** Active states emit concentrated, zero-blur neon halos via hard drop projections: `0 0 10px rgba(0, 255, 135, 0.45)`.
- **Warning Depth Overlays:** Emergency and biological hazards project direct, sharp warnings utilizing aggressive alert sweeps: `0 0 14px rgba(255, 87, 34, 0.55)`.
- **Target Crosshairs & Calibration Brackets:** Technical depth is heightened using 1px corner markers on corners (`L`-shaped crop ticks) rather than container drop shadows.

## Shapes

The shape system enforces pure, unyielding angularity:

- **Absolute Zero Radius (`0px`):** Every button, inventory cell, card, health track, and viewport frame has razor-sharp, 90-degree corners.
- **Chamfered 45-Degree Clip Cuts:** Critical system triggers, survivor portrait frames, and primary command cards leverage industrial chamfered cuts (diagonal corner clips) achieved through polygonal clipping paths (`polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)`).
- **Mechanical Slicing:** Dividers and progress meters utilize hard segmented geometric intervals—linear gauges are fragmented into distinct rectilinear blocks rather than smooth gradients.

## Components

### Action Triggers (Buttons)
- **Primary Engage:** Background fill in solid `#00FF87`, text in contrasting solid `#090D10` using `Chivo 800`. Chamfered top-right corner. On hover, invert to `#111822` surface with `#00FF87` border and intense phosphor glow.
- **Tactical Secondary:** Solid `#111822` background, 1px solid `rgba(255, 255, 255, 0.15)` border, text `#F2F5F8`. Active hover triggers a razor-thin `#00FF87` underline and toxic green font transition.
- **Emergency Abort / Fire:** `#FF5722` solid background, black text, with an alternating 45-degree yellow/black hazard stripe sub-strip.

### Telemetry Trackers (Health & Biohazard Bars)
- Segmented rectangular blocks with 2px empty gaps between cells.
- Standard health displays pure phosphor green (`#00FF87`). Depletion below 35% converts the remaining segments to pulsating emergency orange (`#FF5722`).
- Biohazard infection bars build from left to right using `#F59E0B` with an animated terminal scanline overlay.

### Combat Cards & Data Tiles
- Dark slate (`#111822`) containers framed with 1px hairline edges.
- Each container features tactical corner micro-ticks (`┌ ┐ └ ┘`) in `#00FF87`.
- Top-left edge features a persistent monospaced classification index (e.g., `[SYS.04 // SECTOR_BRAVO]`).

### Tactical Inputs & Toggles
- Inputs display as terminal fields with a persistent blinking square cursor, dark charcoal base, and a static `//` prefix. Focus activates a crisp 1px `#00FF87` outline.
- Checkboxes and toggles are solid square frames containing a sharp, filled inner block on active states; no soft curves or pill shapes.

### Chips & Tactical Badges
- Zero-radius badge elements styled as military asset tags. High-contrast monochromatic black backgrounds framed in warning colors with bold, tracked uppercase typography.