import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as common from './msdo-common';
import * as nuget from './msdo-nuget-client';

export class MsdoInstaller {

    async install(cliVersion: string) {
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

        let packageName = 'microsoft.security.devops.cli';

        // initialize the _msdo directory
        let agentDirectory = path.resolve(path.join(process.env.GITHUB_WORKSPACE, '../../_msdo'));
        core.debug(`agentDirectory = ${agentDirectory}`);
        common.ensureDirectory(agentDirectory);

        let agentPackagesDirectory = process.env.MSDO_PACKAGES_DIRECTORY;
        if (!agentPackagesDirectory) {
            agentPackagesDirectory = path.join(agentDirectory, 'packages');
            core.debug(`agentPackagesDirectory = ${agentPackagesDirectory}`);
            common.ensureDirectory(agentPackagesDirectory);
            process.env.MSDO_PACKAGES_DIRECTORY = agentPackagesDirectory;
        }

        let agentVersionsDirectory = path.join(agentDirectory, 'versions');
        core.debug(`agentVersionsDirectory = ${agentVersionsDirectory}`);
        common.ensureDirectory(agentVersionsDirectory);

        let msdoVersionsDirectory = path.join(agentVersionsDirectory, packageName);
        core.debug(`msdoVersionsDirectory = ${msdoVersionsDirectory}`);

        if (this.isInstalled(msdoVersionsDirectory, packageName, cliVersion)) {
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
                    msdoVersionsDirectory);
            } catch (error) {
                core.debug(error);
                failed = true;
                attempts += 1;
                if (attempts > maxAttempts) {
                    break;
                }
            }
        } while (failed);

        if (response.success) {
            if (response.inCache == true) {
                console.log(`${packageName} version ${response.resolvedVersion} already installed`);
            } else {
                console.log(`Installed ${packageName} version ${response.resolvedVersion}`);
            }
        } else {
            throw new Error('Failed to install the MSDO CLI nuget package.');
        }
    
        this.setVariables(msdoVersionsDirectory, packageName, response.resolvedVersion, true);
    }

    isInstalled(
        versionsDirectory: string,
        packageName: string, 
        cliVersion: string) : boolean {

        let installed = false;

        if (common.isLatest(cliVersion)) {
            core.debug(`MSDO CLI version contains a latest quantifier: ${cliVersion}. Continuing with install...`);
            return installed;
        }
        
        installed = this.setVariables(versionsDirectory, packageName, cliVersion);
            
        if (installed) {
            console.log(`MSDO CLI v${cliVersion} already installed.`);
        }
        
        return installed;
    }

    setVariables(
        versionsDirectory: string, 
        packageName: string, 
        cliVersion: string, 
        validate: boolean = false) : boolean {

        let packageDirectory = path.join(versionsDirectory, `${packageName}.${cliVersion}`);
        core.debug(`packageDirectory = ${packageDirectory}`);

        let msdoDirectory = path.join(packageDirectory, 'tools');
        core.debug(`msdoDirectory = ${msdoDirectory}`);

        let msdoFilePath = path.join(msdoDirectory, 'guardian');
        core.debug(`msdoFilePath = ${msdoFilePath}`);

        process.env.MSDO_DIRECTORY = msdoDirectory;
        process.env.MSDO_FILEPATH = msdoFilePath;

        let exists = fs.existsSync(process.env.MSDO_FILEPATH);

        if (validate && !exists) {
            throw new Error(`MSDO CLI v${cliVersion} was not found after installation. Expected location: ${msdoFilePath}`);
        }

        return exists;
    }
}