# Browser libraries

The UI loads these libraries from `/vendor/`. They are not shipped with the
skill: on first start the server downloads each one from jsDelivr (falling back
to unpkg), rejects it unless its size and SHA-256 match, and caches it per user
in `${XDG_CACHE_HOME:-~/.cache}/queue-manager/vendor/<package>@<version>/`. The
pinned list lives in `server/infrastructure/vendor-cache.mjs`; change a version
there together with its size and checksum, and update this table.

| File                 | Package         | Version | License    | Bytes     |
| -------------------- | --------------- | ------- | ---------- | --------- |
| `echarts.min.js`     | echarts         | 5.5.1   | Apache-2.0 | 1,030,855 |
| `cytoscape.min.js`   | cytoscape       | 3.30.2  | MIT        | 373,304   |
| `dagre.min.js`       | dagre           | 0.8.5   | MIT        | 283,803   |
| `cytoscape-dagre.js` | cytoscape-dagre | 2.5.0   | MIT        | 12,665    |
| `mermaid.min.js`     | mermaid         | 11.17.2 | MIT        | 3,572,661 |

## Offline machine

Download the files on a connected machine, for example
`https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js` (the path
inside each package is in `vendor-cache.mjs`), and copy each one to
`${XDG_CACHE_HOME:-~/.cache}/queue-manager/vendor/<package>@<version>/<file>`,
for example `mermaid@11.17.2/mermaid.min.js`. The server uses a copy only when
its SHA-256 matches:

```text
e84270bd0cd5bdf60fefc26d00c2a391cb2e81f4d26a7a9ee16185a54773a3cf  echarts.min.js
83e8c54a6bec655bfd81df07df605649c268af69aeca67a5ea2da54ea42dac81  cytoscape.min.js
62eb9787ccfdbdf4148d4d99d31dbf9ee4770eafee81e637d759b52aac22cd51  dagre.min.js
bf70fe402991dcbff33e05a7e4a5271c78020bb75e85d1c80ab7538e4157112e  cytoscape-dagre.js
581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8  mermaid.min.js
```

Check a copy with `sha256sum <file>` (Linux) or `shasum -a 256 <file>` (macOS).
