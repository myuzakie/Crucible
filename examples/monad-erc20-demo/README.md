# Monad ERC-20 demo target

This directory is the first consumer-like target for Crucible.

- `Token.sol` is the correct implementation.
- `BuggyToken.sol` intentionally emits mint events without updating balances.

## Contract checks

From the repository root:

```bash
forge build --root examples/monad-erc20-demo
forge test --root examples/monad-erc20-demo
```

The generated `out/` directory is local build output and is ignored by Git.
