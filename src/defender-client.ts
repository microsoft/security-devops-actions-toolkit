import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as common from './msdo-common';
import * as installer from './defender-installer';

/**
 * The default version of Defender CLI to install if no version is specified.
 */
const cliVersionDefault: string = 'latest';

/**
 * Sets up the environment for the Defender CLI run.
 * Sets environment variables.
 * Resolves the version of Defender CLI to install.
 * Installs Defender CLI
 */
async function setupEnvironment(): Promise<void> {
    
    console.log('------------------------------------------------------------------------------');

    // Initialize the _defender directory
    const githubWorkspace = process.env.GITHUB_WORKSPACE || process.cwd();
    let defenderDirectory = path.join(githubWorkspace, '_defender');
    core.debug(`defenderDirectory = ${defenderDirectory}`);
    common.ensureDirectory(defenderDirectory);

    let defenderPackagesDirectory = process.env.DEFENDER_PACKAGES_DIRECTORY;
    if (!defenderPackagesDirectory) {
        defenderPackagesDirectory = path.join(defenderDirectory, 'packages');
        core.debug(`defenderPackagesDirectory = ${defenderPackagesDirectory}`);
        common.ensureDirectory(defenderPackagesDirectory);
        process.env.DEFENDER_PACKAGES_DIRECTORY = defenderPackagesDirectory;
    }

    if (!process.env.DEFENDER_FILEPATH) {
        let cliVersion = resolveCliVersion();
        await installer.install(cliVersion);
    }

    console.log('------------------------------------------------------------------------------');
}

/**
 * Resolves the version of Defender CLI to install.
 * 
 * @returns The version of Defender CLI to install
 */
function resolveCliVersion(): string {
    let cliVersion = cliVersionDefault;
    
    core.info(`Initial CLI version (default): ${cliVersion}`);

    if (process.env.DEFENDER_VERSION) {
        cliVersion = process.env.DEFENDER_VERSION;
        core.info(`Using DEFENDER_VERSION: ${cliVersion}`);
    }

    if (cliVersion.includes('*')) {
        core.info(`Version contains '*', switching to Latest`);
        cliVersion = cliVersionDefault;
    }

    return cliVersion;
}

/**
 * Gets the path to the Defender CLI
 * 
 * @returns The path to the Defender CLI
 */
function getCliFilePath(): string {
    let cliFilePath: string = process.env.DEFENDER_FILEPATH;
    core.debug(`cliFilePath = ${cliFilePath}`);
    return cliFilePath;
}

/**
 * Runs a Defender scan with the specified scan type and target
 * @param scanType - The type of scan to perform (e.g., "fs", "image")
 * @param target - The target to scan (directory path or image name)
 * @param policy - The policy to use for scanning (default: "mdc")
 * @param outputPath - The output SARIF file path
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 * @param additionalArgs - Optional additional CLI arguments to append to the command
 */
async function scan(
    scanType: string,
    target: string,
    policy: string = 'mdc',
    outputPath?: string,
    successfulExitCodes: number[] = null,
    additionalArgs: string[] = []
): Promise<void> {
    
    if (!outputPath) {
        const githubWorkspace = process.env.GITHUB_WORKSPACE || process.cwd();
        outputPath = path.join(githubWorkspace, 'defender.sarif');
    }

    let args = [
        'scan',
        scanType,
        target,
        '--defender-policy', policy,
        '--defender-output', outputPath
    ];

    // Append additional arguments if provided
    if (additionalArgs && additionalArgs.length > 0) {
        args = args.concat(additionalArgs);
        core.debug(`Appending additional arguments: ${additionalArgs.join(' ')}`);
    }

    await runDefenderCli(args, successfulExitCodes, outputPath);
}

/**
 * Runs the Defender CLI with the specified arguments for directory scanning
 * @param directoryPath - The directory path to scan
 * @param policy - The policy to use for scanning (default: "mdc")
 * @param outputPath - The output SARIF file path
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 * @param additionalArgs - Optional additional CLI arguments to append to the command
 */
export async function scanDirectory(
    directoryPath: string, 
    policy: string = 'mdc',
    outputPath?: string,
    successfulExitCodes: number[] = null,
    additionalArgs: string[] = []
): Promise<void> {
    await scan('fs', directoryPath, policy, outputPath, successfulExitCodes, additionalArgs);
}

/**
 * Runs the Defender CLI with the specified arguments for container image scanning
 * @param imageName - The container image name to scan
 * @param policy - The policy to use for scanning (default: "mdc")
 * @param outputPath - The output SARIF file path
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 * @param additionalArgs - Optional additional CLI arguments to append to the command
 */
export async function scanImage(
    imageName: string, 
    policy: string = 'mdc',
    outputPath?: string,
    successfulExitCodes: number[] = null,
    additionalArgs: string[] = []
): Promise<void> {
    await scan('image', imageName, policy, outputPath, successfulExitCodes, additionalArgs);
}

/**
 * Runs the Defender CLI with the specified arguments
 * @param inputArgs - The CLI arguments to pass to the Defender CLI
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 * @param outputPath - The output SARIF file path (for setting as output variable)
 */
async function runDefenderCli(
    inputArgs: string[], 
    successfulExitCodes: number[] = null,
    outputPath?: string
): Promise<void> {
    
    try {
        
        if (successfulExitCodes == null) {
            successfulExitCodes = [0];
        }
        
        await setupEnvironment();
        
        let cliFilePath = getCliFilePath();

        if (core.isDebug()) {
            // Add verbose logging if debug is enabled
            inputArgs.push('--defender-debug');
        }

        core.info('Running Microsoft Defender CLI...');
        core.debug(`Command: ${cliFilePath} ${inputArgs.join(' ')}`);

        // Execute the Defender CLI
        let exitCode = await exec.exec(cliFilePath, inputArgs, {
            ignoreReturnCode: true
        });

        // Check if the exit code is successful
        let success = false;
        for (let i = 0; i < successfulExitCodes.length; i++) {
            if (exitCode == successfulExitCodes[i]) {
                success = true;
                break;
            }
        }

        if (!success) {
            throw new Error(`Defender CLI exited with an error exit code: ${exitCode}`);
        }

        // Set the output SARIF file path
        if (outputPath) {
            core.debug(`sarifFile = ${outputPath}`);
            core.exportVariable('DEFENDER_SARIF_FILE', outputPath);
            core.setOutput('sarifFile', outputPath);
        }

    } catch (error) {
        core.error('Exception occurred while running Defender CLI:');
        core.error(error);
        core.setFailed(error);
        throw error;
    }
}
