import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import { MsdoInstaller } from './msdo-installer'

export class MsdoClient {
    cliVersion: string = '0.*';

    async setupEnvironment() {

        // prevent welcome message
        process.env.DOTNET_NOLOGO = 'true';

        console.log('------------------------------------------------------------------------------');

        if (!process.env.MSDO_FILEPATH) {
            let cliVersion = this.resolveCliVersion();
            let msdoInstaller = new MsdoInstaller();
            await msdoInstaller.install(cliVersion);
        }

        process.env.GDN_SETTINGS_FOLDERS = `Install=${process.env.MSDO_PACKAGES_DIRECTORY}`

        console.log('------------------------------------------------------------------------------');
    }

    resolveCliVersion() : string {
        let cliVersion = this.cliVersion;

        if (process.env.MSDO_VERSION) {
            cliVersion = process.env.MSDO_VERSION;
        }

        return cliVersion;
    }

    isNullOrWhiteSpace(value: string) : boolean {
        return !value || !value.trim();
    }

    getCliFilePath() : string {
        let cliFilePath: string = process.env.MSDO_FILEPATH;
        core.debug(`cliFilePath = ${cliFilePath}`);
        return cliFilePath;
    }

    async init() {
        try {
            let cliFilePath = this.getCliFilePath();
            await exec.exec(cliFilePath, ['init', '--force']);
        } catch (error) {
            core.debug(error);
        }
    }

    async run(inputArgs: string[], telemetryEnvironment: string = 'github') {
        let cliFilePath: string = null;
        let args: string[] = [];

        try {
            await this.setupEnvironment();
            await this.init();

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

            // Write it as a GitHub Action variable for follow up tasks to consume
            core.exportVariable('MSDO_SARIF_FILE', sarifFile);
            core.setOutput('sarifFile', sarifFile);

            args.push('--export-breaking-results-to-file');
            args.push(`${sarifFile}`);

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
}