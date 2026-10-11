# Monad Runtime Demo

This deterministic Foundry application exposes three business journeys:

- `New User Purchase`
- `Settlement`
- `Auction`

The vulnerable and fixed contracts share the same application surface. Generic
local execution proves the contract calls work; Crucible's runtime evidence
suite separately evaluates Monad-specific conditions.
