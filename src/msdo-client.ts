import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as common from './msdo-common';
import * as installer from './msdo-installer';
import AdmZip = require('adm-zip');

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
    let debugDrop = common.parseBool(process.env.GDN_DEBUG_DROP);

    const gdnTaskLibFolder = path.resolve(__dirname);
    core.debug(`gdnTaskLibFolder = ${gdnTaskLibFolder}`);

    const nodeModulesFolder = path.dirname(path.dirname(gdnTaskLibFolder));
    core.debug(`nodeModulesFolder = ${nodeModulesFolder}`);

    const taskFolder = path.dirname(nodeModulesFolder);
    core.debug(`taskFolder = ${taskFolder}`); 

    const debugFolder = path.join(taskFolder, 'debug');
    core.debug(`debugFolder = ${debugFolder}`);

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

        if (common.isVersionGreaterThanOrEqualTo(process.env.MSDO_INSTALLEDVERSION, '0.183.0')) {
            // Export all SARIF results to a file
            args.push('--export-file');
        } else {
            // This still exists, but the behavior was corrected in 0.183.0
            // This defaults to only exporting breaking results, as the name implies
            args.push('--export-breaking-results-to-file');
        }
        
        args.push(sarifFile);

        args.push('--telemetry-environment');
        args.push(telemetryEnvironment);

        // Include the debug drop option on the command line if applicable.
        core.debug(`GdnDebugDrop = ${debugDrop}`);
        if (debugDrop)
        {
            args.push('--debug-drop');
            args.push('--debug-drop-path');
            args.push(debugFolder);
            const debugFolderEnvVarName = `GDN_DEBUGDROPPATH`;

            core.debug(`Debug Drop enabled. ${debugFolderEnvVarName}: ${debugFolder}`);
            process.env[debugFolderEnvVarName] = debugFolder;
        }

    } catch (error) {
        core.error('Exception occurred while initializing MSDO:');
        core.error(error);
        core.setFailed(error);
        return;
    }

    try {
        core.debug('Running Microsoft Security DevOps...');

        // Ensure debug folder starts clean
        cleanupDirectory(debugFolder);
        await exec.exec(cliFilePath, args);

        // Package up debug drop if applicable.
        let debugStagingDir = '';
        core.debug(`GdnDebugDrop = ${debugDrop}`);
        if (debugDrop) {
            if (fs.existsSync(debugFolder)) {
                core.debug("Creating debug drop archive...");
                let zippedOutput = getZippedFolder(debugFolder);

                const instanceDirectory = process.env.GITHUB_WORKSPACE;
                debugStagingDir = path.join(instanceDirectory, '.gdn', 'debugdrop');
                if (!fs.existsSync(debugStagingDir)) {
                    core.debug(`Creating missing folder: ${debugStagingDir}`);
                    fs.mkdirSync(debugStagingDir);
                }

                let debugDropArtifact = path.join(debugStagingDir, `MSDO_debug.zip`);
                let dupeCount = 1;
                while (fs.existsSync(debugDropArtifact)) {
                    core.debug(`Debug Drop with the name ${debugDropArtifact} already exists, updating name to avoid collision...`);
                    dupeCount += 1;
                    debugDropArtifact = path.join(debugStagingDir, `MSDO_debug_${dupeCount}.zip`);
                }
                fs.copyFileSync(zippedOutput, debugDropArtifact);
                core.debug(`Finished creating: ${debugDropArtifact}`);

                core.debug(`DebugDrop = ${debugStagingDir}`);

                // Write it as a environment variable for follow up tasks to consume
                core.exportVariable('MSDO_DEBUG_DROP_FOLDER', debugStagingDir);
                core.setOutput('debugDrop', debugStagingDir);

                core.debug(`Cleaning up: ${debugFolder}`);
                cleanupDirectory(debugFolder);
                core.debug(`Successfully cleaned up debug dump.`);
            }
        }

        // TODO: process exit codes
    } catch (error) {
        core.setFailed(error);
        return;
    }
}

function getZippedFolder(dir): string {
    core.debug(`Zipping up folder: ${dir}`)
    let allPaths = getFilePathsRecursively(dir);
    const zip = new AdmZip();
    for (let filePath of allPaths) {
        core.debug(`Adding file to archive: ${filePath}`);
        zip.addLocalFile(filePath);
    }

    let destPath = `${dir}.zip`;
    core.debug(`Writing to file: ${destPath}`)
    zip.writeZip(destPath);
    if (fs.existsSync(destPath)) {
        core.debug(`Successfully wrote file: ${destPath}`)
    } else {
        core.debug(`Something went wrong! File does not exist: ${destPath}`)
    }
    return destPath;
}

// Returns a flat array of absolute paths to all files contained in the dir
function getFilePathsRecursively(dir) {
    core.debug(`Searching for files under dir: ${dir}`)
    var files = [];
    let fileList = fs.readdirSync(dir);
    var remaining = fileList.length;
    if (!remaining) return files;

    for (let file of fileList) {
        file = path.resolve(dir, file);
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            let f = getFilePathsRecursively(file);
            files = files.concat(f);
        } else {
            files.push(file);
        }
        if (!--remaining) {
            return files;
        }
    }
}

function cleanupDirectory(dir) {
    if (!fs.existsSync(dir)) return;

    let items = fs.readdirSync(dir);

    for (let item of items) {
        item = path.resolve(dir, item)
        let stat = fs.statSync(item);
        if (stat && stat.isDirectory()) {
            cleanupDirectory(item)
        } else {
            fs.unlinkSync(item);
        }
    }

    fs.rmdirSync(dir);
}