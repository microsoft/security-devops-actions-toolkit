# Microsoft Security DevOps GitHub Actions Toolkit

A GitHub Actions javascript library for running the [Microsoft Security DevOps CLI](https://aka.ms/msdo-nuget).

## Leveraged By

* [Microsoft Security DevOps Action](https://github.com/microsoft/security-devops-action)
* [GitHub OSSAR Action](https://github.com/github/ossar-action)

## Related

* [Microsoft Security DevOps Task Library for Azure DevOps](https://github.com/microsoft/security-devops-azdevops-task-lib)

## Build

### Preqrequisities:

* Install [node.js](https://nodejs.org/en)

### Steps

1. Install node package dependencies
   ```
   npm install
   ```
1. Run the build script defined in the `package.json` file:
   ```
   npm run build
   ```

### Build Operations

The build:
1. Compiles the typescript in the `./src` directory
1. Outputs javascript to the `./dist` directory
1. Copies the `./package.json` file to the `./dist` folder

## Test

Run `npm test` to build the toolkit and exercise NuGet installation with local response fixtures. No remote feed or credentials are required.

## NuGet response encoding

NuGet metadata requests explicitly decline Brotli and accept identity, gzip, and deflate. Responses with unsupported content encodings, including unsolicited Brotli, are rejected before decompression. Gzip, zlib-wrapped deflate, and raw deflate remain supported; package downloads and authentication are unchanged.

This prevents this metadata path from invoking Node.js's native Brotli decoder for [CVE-2026-111497](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). It does not patch Node.js or other consumers. Consumers must adopt a reviewed release of the toolkit, and patched runner interpreters remain the preferred runtime remediation.

## Publish

This package is hosted on [this repo's package feed](https://github.com/microsoft/security-devops-azdevops-task-lib/pkgs/npm/security-devops-azdevops-task-lib).

To publish a build, please see ["Working with the npm registry"](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
