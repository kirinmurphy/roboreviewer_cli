# Agent Instructions

These rules apply across this repository.

## File Structure

- Prefer `AGENTS.md` at the repository root for persistent agent instructions.
- Place primary exported functions at the top of a file.
- Keep small ancillary helpers below the primary export.
- If helper logic grows large enough to compete with the main export, move it into its own file.

## Function Design

- Functions should not become too large.
- If a function has many branches or mixes orchestration with business logic, extract pure helpers.
- Parent functions should focus mainly on orchestration, IO, and state transitions.
- Put data-shaping and decision logic into smaller pure functions whenever practical.
- Prefer a parameter object, options object, or named-parameter-style object argument over long positional parameter lists.
- When a function needs several inputs, especially values of similar types, pass a single object with named properties instead of multiple positional arguments.

## Constants

- Always use constants instead of magic strings for repeated workflow values, statuses, tool IDs, command names, and other shared literals.
- If a string is used once and is purely user-facing prose, it does not need a constant.
- Keep app-level output-impacting internal configuration values in a top-level internal config module instead of scattering them across adapters, formatters, and helpers.
- Use that internal config for things like output taxonomies, report section titles, supported content types, and other values that shape user-visible behavior or structured output expectations.

## General

- Preserve the current dependency posture unless there is a clear reason to add more tooling.
- Keep repository behavior deterministic where possible.
- Favor explicit state transitions over implicit coupling.
