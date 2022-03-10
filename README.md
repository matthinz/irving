# 🕷 irving

This is the _beginnings_ of a web spider meant to be used to inventory websites for large organizations. The behavior of the spider is defined in Javascript. Spidered content is stored in a local sqlite database, and some rough tools are provided to index and analyze it.

## Using

0. Create a `src/config.ts` that defines your spidering rules
1. Build: `npm run build`
2. Run:
  * `node dist/index.js spider` to start spidering
  * `node dist/index.js index` to start indexing
  * `node dist/index.js report` to generate some reports

## TODO

- General improvements
  - [ ] Wire up command-line option handling (i.e. allow configuration via the command line)
  - [ ] Don't assume everybody's HTTPS
- Spidering improvements
  - [ ] Limit the max # of URLs allowed per-domain
  - [ ] Index during spidering rather than after
  - [ ] UI: Estimate spider duration based on rate of change of queue length
  - [ ] Automatically adjust queue for breadth rather than depth
- Indexing improvements
  - [ ] Reindex _only_ unidentified platforms
  - [ ] Allow importing classification rules from other packages
  - [ ] Tag HTTP2 vs HTTP
- Reporting improvements
  - [ ] Report on redirect behavior
