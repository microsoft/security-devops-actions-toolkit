import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as common from './msdo-common';
import * as installer from './msdo-installer';

/**
 * The default version of Guardian to install if no version is specified.
 */
const cliVersionDefault: string = 'Latest';

/**
 * Sets up the environment for the Guardian run.
 * Sets pipeline variables.
 * Resolves the version of Guardian to install.
 * Installs Guardian
 * 
 * @param taskFolder The folder of the task that is using the Guardian Pipeline
 */
async function setupEnvironment(): Promise<void> {
    
    console.log('------------------------------------------------------------------------------');

    if (!process.env.MSDO_FILEPATH) {
        let cliVersion = resolveCliVersion();
        await installer.install(cliVersion);
    }

    process.env.GDN_SETTINGS_FOLDERS = `Install=${process.env.MSDO_PACKAGES_DIRECTORY}`

    console.log('------------------------------------------------------------------------------');
}

/**
 * Resolves the version of Guardian to install.
 * 
 * @returns The version of Guardian to install
 */
function resolveCliVersion(): string {
    let cliVersion = cliVersionDefault;

    if (process.env.MSDO_VERSION) {
        cliVersion = process.env.MSDO_VERSION;
    }

    if (cliVersion.includes('*')) {
        // Before manual nuget installs, "1.*" was acceptable.
        // As this is no longer supported, and it functionally meant "Latest",
        // default that value back to Latest
        cliVersion = 'Latest';
    }

    return cliVersion;
}

/**
 * Gets the path to the MSDO CLI
 * 
 * @returns The path to the MSDO CLI
 */
function getCliFilePath() : string {
    let cliFilePath: string = process.env.MSDO_FILEPATH;
    core.debug(`cliFilePath = ${cliFilePath}`);
    return cliFilePath;
}

/**
 * Runs "guardian init" to ensure the Guardian CLI is initialized.
 */
async function init() {
    try {
        let cliFilePath = getCliFilePath();
        await exec.exec(cliFilePath, ['init', '--force']);
    } catch (error) {
        core.debug(error);
    }
}

/**
 * Runs "guardian run" with the input CLI arguments
 * @param inputArgs - The CLI arguments to pass to "guardian run"
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 */
export async function run(inputArgs: string[], telemetryEnvironment: string = 'github') {
    let cliFilePath: string = null;
    let args: string[] = [];

    try {
        await setupEnvironment();
        await init();

        cliFilePath = process.env.MSDO_FILEPATH;
        core.debug(`cliFilePath = ${cliFilePath}`);

        if (inputArgs != null) {
            for (let i = 0; i < inputArgs.length; i++) {
                args.push(inputArgs[i]);
            }
        }

        args.push('--not-break-on-detections');

        if (core.isDebug()) {
            args.push('--logger-level');
            args.push('trace');
        }

        let sarifFile : string = path.join(process.env.GITHUB_WORKSPACE, '.gdn', 'msdo.sarif');
        core.debug(`sarifFile = ${sarifFile}`);

        // Write it as a environment variable for follow up tasks to consume
        core.exportVariable('MSDO_SARIF_FILE', sarifFile);
        core.setOutput('sarifFile', sarifFile);

        args.push('--export-breaking-results-to-file');
        args.push(sarifFile);

        args.push('--telemetry-environment');
        args.push(telemetryEnvironment);

    } catch (error) {
        core.error('Exception occurred while initializing MSDO:');
        core.error(error);
        core.setFailed(error);
        return;
    }

    try {
        core.debug('Running Microsoft Security DevOps...');

        await exec.exec(cliFilePath, args);

        // TODO: process exit codes
    } catch (error) {
        core.setFailed(error);
        return;
    }
}