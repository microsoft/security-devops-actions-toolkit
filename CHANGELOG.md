# security-devops-azdevops-task-lib change log
All notable changes to this project will be documented in this file.1

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## v1.7.0 - 06/09/2023

### Added
- The `msdo-nuget-client.ts` javascript nuget client

### Changed
- Install the MSDO nuget package via javascript
  - Removes a dependency on dotnet to leverage restore to install the platform cross-platform
- Upgraded dependencies
  - azure-pipelines-task-lib to v4.3.1
  - azure-pipelines-tool-lib to v2.0.4
  - typescript to v5.1.3