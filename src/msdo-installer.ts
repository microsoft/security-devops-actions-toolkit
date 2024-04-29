import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as common from './msdo-common';
import * as nuget from './msdo-nuget-client';

/**
 * Installs the Microsoft Security DevOps (MSDO) CLI 
 * 
 * @param cliVersion - The version of the MSDO CLI to install. Also accepts 'latest' or 'latestprerelease' values.
 */
export async function install(cliVersion: string) {
    console.log(`Installing Microsoft Security DevOps Cli version: ${cliVersion}`);

    if (process.env.MSDO_FILEPATH) {
        console.log(`MSDO CLI File Path overriden by %MSDO_FILEPATH%: ${process.env.MSDO_FILEPATH}`);
        return
    }

    if (process.env.MSDO_DIRECTORY) {
        console.log(`MSDO CLI Directory overriden by %MSDO_DIRECTORY%: ${process.env.MSDO_DIRECTORY}`);

        // Set the file path
        let msdoFilePath = path.join(process.env.MSDO_DIRECTORY, 'guardian');
        core.debug(`msdoFilePath = ${msdoFilePath}`);

        process.env.MSDO_FILEPATH = msdoFilePath;
        return;
    }

    let packageName = resolvePackageName();

    let agentDirectory = path.resolve(path.join(process.env.GITHUB_WORKSPACE, '../../_msdo'));
    let agentVersionsDirectory = path.join(agentDirectory, 'versions');
    core.debug(`agentVersionsDirectory = ${agentVersionsDirectory}`);
    common.ensureDirectory(agentVersionsDirectory);

    if (isInstalled(agentVersionsDirectory, packageName, cliVersion)) {
        return;
    }

    let failed = false;
    let attempts = 0;
    let maxAttempts = 2;

    let serviceIndexUrl = "https://api.nuget.org/v3/index.json";
    let response: nuget.InstallNuGetPackageResponse;

    do {
        failed = false;

        try {
            response = await nuget.install(
                serviceIndexUrl,
                packageName,
                cliVersion,
                agentVersionsDirectory);
        } catch (error) {
            core.debug(error);
            failed = true;
            attempts += 1;
            if (attempts > maxAttempts) {
                break;
            }
        }
    } while (failed);

    if (response && response.success) {
        if (response.inCache == true) {
            console.log(`${packageName} version ${response.resolvedVersion} already installed`);
        } else {
            console.log(`Installed ${packageName} version ${response.resolvedVersion}`);
        }
    } else {
        throw new Error('Failed to install the MSDO CLI nuget package.');
    }

    setVariables(agentVersionsDirectory, packageName, response.resolvedVersion, true);
}

/**
 * Resolves the name of the Guardian CLI package to install based on the current platform
 * 
 * @returns the name of the Guardian CLI package to install
 */
function resolvePackageName(): string {
    let packageName: string;
    if (process.env.MSDO_DOTNETDEPENDENTPACKAGE) {
        packageName = 'Microsoft.Security.Devops.Cli';
    } else if (process.platform == 'win32') {
        packageName = 'Microsoft.Security.Devops.Cli.win-x64';
    } else if (process.platform == 'linux') {
        if (process.arch == 'arm64') {
            packageName = 'Microsoft.Security.Devops.Cli.linux-arm64';
        } else {
            packageName = 'Microsoft.Security.Devops.Cli.linux-x64';
        }
    } else {
        packageName = 'Microsoft.Security.Devops.Cli';
    }
    core.debug(`packageName = ${packageName}`);
    return packageName;
}

/**
 * Checks if the Guardian CLI is already installed
 * 
 * @param gdnPackagesDirectory - The directory where the Guardian CLI packages are installed
 * @param packageName - The name of the Guardian CLI package to install
 * @param cliVersion - The version of the Guardian CLI to install
 * @returns true if the Guardian CLI is already installed, false otherwise
 */
function isInstalled(
    packagesDirectory: string,
    packageName: string, 
    cliVersion: string) : boolean {
    let installed = false;

    if (common.isLatest(cliVersion)) {
        core.debug(`MSDO CLI version contains a latest quantifier: ${cliVersion}. Continuing with install...`);
        return installed;
    }
    
    installed = setVariables(packagesDirectory, packageName, cliVersion);
        
    if (installed) {
        console.log(`MSDO CLI v${cliVersion} already installed.`);
    }
    
    return installed;
}

/**
 * Sets the GDN_DIRECTORY and GDN_FILEPATH environment variables
 * 
 * @param gdnPackagesDirectory - The directory where the Guardian CLI packages are installed
 * @param packageName - The name of the Guardian CLI package to install
 * @param cliVersion - The version of the Guardian CLI to install
 */
function setVariables(
    packagesDirectory: string, 
    packageName: string, 
    cliVersion: string, 
    validate: boolean = false) : boolean {

    let packageDirectory = path.join(packagesDirectory, `${packageName}.${cliVersion}`);
    core.debug(`packageDirectory = ${packageDirectory}`);

    let msdoDirectory = path.join(packageDirectory, 'tools');
    core.debug(`msdoDirectory = ${msdoDirectory}`);

    let msdoFilePath = path.join(msdoDirectory, 'guardian');
    core.debug(`msdoFilePath = ${msdoFilePath}`);

    process.env.MSDO_DIRECTORY = msdoDirectory;
    process.env.MSDO_FILEPATH = msdoFilePath;
    process.env.MSDO_INSTALLEDVERSION = cliVersion;

    let exists = fs.existsSync(process.env.MSDO_FILEPATH);

    if (validate && !exists) {
        throw new Error(`MSDO CLI v${cliVersion} was not found after installation. Expected location: ${msdoFilePath}`);
    }

    return exists;
}