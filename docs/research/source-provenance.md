# Source Provenance

These revisions were inspected during the Prime Superpowers design and plan
reviews.

| Source | Canonical repository | Revision used |
|---|---|---|
| Prime Agent | `https://github.com/PrimeIntellect-ai/prime-agent.git` | `bc0fa7606abb3b7af0f765319518d255e6ae553d` |
| Superpowers | `https://github.com/obra/superpowers.git` | `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (`v6.3.0`) |
| Prime RL | `https://github.com/PrimeIntellect-ai/prime-rl.git` | `0c58f007bcbebd2751a5a5c51da1948c02663d27` |
| Verifiers | `https://github.com/PrimeIntellect-ai/verifiers.git` | `eba9a7f6a213f01998d90e6dac5272f5ac667243` |
| Prime Environments | `https://github.com/PrimeIntellect-ai/prime-envs.git` | `26dafdc9582576975ec576f893be7319028daf51` |

## Prime Agent 0.8.1 Release Artifact

The inspected main release artifact was:

```text
https://github.com/PrimeIntellect-ai/prime-agent/releases/download/v0.8.1/prime-agent-0.8.1.tgz
```

Observed SHA-256 values:

```text
46c24db1782dd31adc35d5c6cbcc75564faba6ced3bf2ccf03d836ee77134475  prime-agent-0.8.1.tgz
1300cc08c354b807d1ad5288ca23ec859f40361b1cd8a0f71d09d867523dfcbb  extracted/package/package.json
ce555727eb6f1be855ce177242156836da3b789c11a8edf2b69f90a28c975fe9  extracted/package/postinstall.cjs
```

The downloaded tarball and extracted package are intentionally not committed.
Retrieve and verify them from the canonical release when repeating the
analysis.

## Reproducing the Source Trees

```bash
git clone https://github.com/PrimeIntellect-ai/prime-agent.git
git -C prime-agent checkout bc0fa7606abb3b7af0f765319518d255e6ae553d

git clone https://github.com/obra/superpowers.git
git -C superpowers checkout b36e0829c6d0140e93cfef2ca599b1b07d4a7797

git clone https://github.com/PrimeIntellect-ai/prime-rl.git
git -C prime-rl checkout 0c58f007bcbebd2751a5a5c51da1948c02663d27

git clone https://github.com/PrimeIntellect-ai/verifiers.git
git -C verifiers checkout eba9a7f6a213f01998d90e6dac5272f5ac667243

git clone https://github.com/PrimeIntellect-ai/prime-envs.git
git -C prime-envs checkout 26dafdc9582576975ec576f893be7319028daf51
```
