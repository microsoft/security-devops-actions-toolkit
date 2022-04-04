import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

export class MsdoInstaller {

    async install(cliVersion: string) {
        console.log('Installing Microsoft Security DevOps Cli...');

        if (process.env.MSDO_FILEPATH) {
            console.log(`MSDO CLI File Path overriden by %MSDO_FILEPATH%: ${process.env.MSDO_FILEPATH}`);
            return
        }

        if (process.env.MSDO_DIRECTORY) {
            console.log(`MSDO CLI Directory overriden by %MSDO_DIRECTORY%: ${process.env.MSDO_DIRECTORY}`);

            // Set the  file path
            let msdoFilePath = path.join(process.env.MSDO_DIRECTORY, 'guardian');
            core.debug(`msdoFilePath = ${msdoFilePath}`);

            process.env.MSDO_FILEPATH = msdoFilePath;
            return;
        }

        // initialize the _msdo directory
        let agentDirectory = path.resolve(path.join(process.env.GITHUB_WORKSPACE, '../../_msdo'));
        core.debug(`agentDirectory = ${agentDirectory}`);
        this.ensureDirectory(agentDirectory);

        let agentVersionsDirectory = path.join(agentDirectory, 'versions');
        core.debug(`agentVersionsDirectory = ${agentVersionsDirectory}`);
        this.ensureDirectory(agentVersionsDirectory);

        let msdoVersionsDirectory = path.join(agentVersionsDirectory, 'microsoft.security.devops.cli');
        core.debug(`msdoVersionsDirectory = ${msdoVersionsDirectory}`);

        if (this.isInstalled(msdoVersionsDirectory, cliVersion)) {
            return;
        }

        let failed = false;
        let attempts = 0;
        let maxAttempts = 2;

        do {
            failed = false;

            const msdoToolkitDirectory = path.resolve(__dirname);
            core.debug(`msdoToolkitDirectory = ${msdoToolkitDirectory}`);

            const msdoProjectFile = path.join(msdoToolkitDirectory, 'msdo-toolkit.proj');
            core.debug(`msdoProjectFile = ${msdoProjectFile}`);

            let args = [
                'restore',
                msdoProjectFile,
                `/p:MsdoPackageVersion=${cliVersion}`,
                '--packages',
                agentVersionsDirectory,
                '--source',
                'https://api.nuget.org/v3/index.json'
            ];

           try {
                await exec.exec('dotnet', args);
            } catch (error) {
                core.debug(error);
                failed = true;
                attempts += 1;
                if (attempts > maxAttempts) {
                    break;
                }
            }
        } while (failed);

        this.resolvePackageDirectory(msdoVersionsDirectory, cliVersion);
    }

    ensureDirectory(directory: string) : void {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory);
        }
    }

    isInstalled(
        versionsDirectory: string,
        cliVersion: string) : boolean {
        let installed = false;

        if (cliVersion.includes("*")) {
            core.debug(`MSDO CLI version contains a latest quantifier: ${cliVersion}. Continuing with install...`);
            return installed;
        }

        this.setVariablesWithVersion(versionsDirectory, cliVersion);
        
        if (fs.existsSync(process.env.MSDO_DIRECTORY)) {
            console.log(`MSDO CLI v${cliVersion} already installed.`);
            installed = true;
        }

        return installed;
    }

    resolvePackageDirectory(
        versionDirectory: string,
        cliVersion: string) : void {
        if (cliVersion.includes("*")) {
            // find the latest directory
            let packageDirectory = this.findLatestVersionDirectory(versionDirectory);
            this.setVariables(packageDirectory);
        } else {
            this.setVariablesWithVersion(versionDirectory, cliVersion);
        }

        if (!fs.existsSync(process.env.MSDO_DIRECTORY)) {
            throw `MSDO CLI v${cliVersion} was not found after installation.`
        }
    }

    findLatestVersionDirectory(versionsDirectory: string, isPreRelease: boolean = false) : string {

        let latestDirectory = null;
        let latestVersionParts = null;
        let latestIsPreRelease = false;
        let latestPreReleaseFlag = null;

        // Get all of the directories in the versions directory
        core.debug(`Searching for all version folders in: ${versionsDirectory}`);
        let dirs = this.getDirectories(versionsDirectory);

        // Evaluate each directory
        for (let dirIndex = 0; dirIndex < dirs.length; dirIndex++) {
            let dir = dirs[dirIndex];

            if (dir == null || dir == "") {
                core.debug(`Skipping null or empty directory: ${dir}`);
                continue;
            }

            core.debug(`Evaluating MSDO directory: ${dir}`);
            // If we reuse the same RegExp object, it will return null every other call
            const dirRegex = new RegExp(/^(\d+\.?){1,6}(\-\w+)?$/g);
            if (dirRegex.exec(dir) == null) {
                core.debug(`Skipping invalid version directory: ${dir}`);
                continue;
            }

            let fullVersionParts = dir.split("-");

            if (fullVersionParts == null || fullVersionParts.length < 0 || fullVersionParts.length > 2) {
                core.debug(`Skipping invalid version directory: ${dir}`);
            }

            let dirIsPreRelease = fullVersionParts.length > 1;

            if (!isPreRelease && dirIsPreRelease) {
                core.debug(`Skipping pre-release version directory: ${dir}`);
                continue;
            }

            let dirPreReleaseFlag = null;
            if (dirIsPreRelease) {
                dirPreReleaseFlag = fullVersionParts[1];
            }

            let versionNumbersString = fullVersionParts[0];

            let versionParts = dir.split(".");

            // If the latestDirectory isn't set yet, the folder is the latest directory
            let isLatest = latestDirectory == null || latestVersionParts == null;

            if (!isLatest) {
                // Evaluate the directory's version against the latest directory

                // Handle comparisions of separate level versions
                // Some packages exclude Patch or include Revisions up to two levels (Rev1 and Rev2)
                let maxVersionParts = versionParts.length;
                if (latestVersionParts.length > maxVersionParts) {
                    maxVersionParts = latestVersionParts.length;
                }

                for (let versionPartIndex = 0; versionPartIndex < versionParts.length; versionPartIndex++) {
                    let versionPart = 0;
                    let latestVersionPart = 0;

                    let isLastVersionPart = versionPartIndex == (maxVersionParts - 1);

                    if (versionPartIndex < versionParts.length) {
                        versionPart = parseInt(versionParts[versionPartIndex]);
                    }

                    if (versionPartIndex < latestVersionParts.length) {
                        latestVersionPart = parseInt(latestVersionParts[versionPartIndex]);
                    }

                    if (versionPart > latestVersionPart) {
                        isLatest = true;
                    } else if (versionPart == latestVersionPart) {
                        isLatest = isLastVersionPart
                            &&
                            (
                                (isPreRelease && latestIsPreRelease && dirPreReleaseFlag > latestPreReleaseFlag)
                                ||
                                (!isPreRelease && latestIsPreRelease)
                            );
                    } else {
                        // Current version is less than latest found
                        break;
                    }

                    if (isLatest) {
                        break;
                    }
                }
            }

            if (isLatest) {
                core.debug(`Setting latest version directory: ${dir}`);
                latestDirectory = path.join(versionsDirectory, dir);
                latestVersionParts = versionParts;
                latestIsPreRelease = dirIsPreRelease;
                latestPreReleaseFlag = dirPreReleaseFlag;
            }
        }

        core.debug(`latestDirectory = ${latestDirectory}`);

        return latestDirectory;
    }

    getDirectories(directory: string) : string[] {
        // read the directory for all paths
        // filter for directories
        return fs.readdirSync(directory).filter(p => this.isDirectory(directory, p));
    }

    isDirectory(directory: string, p: string) : boolean {
        // statSync follows symlinks
        return fs.statSync(path.join(directory, p)).isDirectory();
    }

    setVariablesWithVersion(versionDirectory: string, cliVersion: string) : void {
        let packageDirectory = path.join(versionDirectory, cliVersion)
        core.debug(`packageDirectory = ${packageDirectory}`);

        this.setVariables(packageDirectory);
    }

    setVariables(packageDirectory: string) : void {
        let msdoDirectory = path.join(packageDirectory, 'tools');
        core.debug(`msdoDirectory = ${msdoDirectory}`);

        let msdoFilePath = path.join(msdoDirectory, 'guardian');
        core.debug(`msdoFilePath = ${msdoFilePath}`);

        process.env.MSDO_DIRECTORY = msdoDirectory;
        process.env.MSDO_FILEPATH = msdoFilePath;
    }
}