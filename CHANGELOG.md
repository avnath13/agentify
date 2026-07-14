# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository scaffolding: license, contributing guide, code of conduct, CI.
- Vendored diagram engine from Archify v2.10.0 (MIT): five renderers (architecture, workflow, sequence, dataflow, lifecycle), JSON schemas, standalone validators, CLI, post-render checks, and full test suite.

### Changed

- Renamed the CLI binary from `archify.mjs` to `agentify.mjs`.
- Replaced all em dashes across vendored files with colons or hyphens (project style rule; goldens re-rendered accordingly).
- Moved the validator freshness test scratch directory to the OS temp dir to fix a parallel test race present upstream.
