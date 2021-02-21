import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { MscaInstaller } from './msca-installer'

export class MscaClient {
    cliVersion: string = '0.*';

    async setupEnvironment() {

        // prevent welcome message
        process.env.DOTNET_NOLOGO = 'true';

        console.log('------------------------------------------------------------------------------');

        if (!process.env.MSCA_FILEPATH) {
            let cliVersion = this.resolveCliVersion();
            let mscaInstaller = new MscaInstaller();
            await mscaInstaller.install(cliVersion);
        }

        console.log('------------------------------------------------------------------------------');
    }

    resolveCliVersion() : string {
        let cliVersion = this.cliVersion;

        if (process.env.MSCA_VERSION) {
            cliVersion = process.env.MSCA_VERSION;
        }

        return cliVersion;
    }

    isNullOrWhiteSpace(value: string) : boolean {
        return !value || !value.trim();
    }

    getCliFilePath() : string {
        let cliFilePath: string = process.env.MSCA_FILEPATH;
        core.debug(`cliFilePath = ${cliFilePath}`);
        return cliFilePath;
    }

    async init() {
        try {
            let cliFilePath = this.getCliFilePath();
            await exec.exec(cliFilePath, ['init', '--force']);
        }
        catch (error) {
            core.debug(error);
        }
    }

    async run(inputArgs: string[]) {
        let cliFilePath: string = null;
        let args: string[] = [];

        try {
            await this.setupEnvironment();
            await this.init();

            cliFilePath = process.env.MSCA_FILEPATH;
            core.debug(`cliFilePath = ${cliFilePath}`);

            if (inputArgs != null)
            {
                for (let i = 0; i < inputArgs.length; i++)
                {
                    args.push(inputArgs[i]);
                }
            }

            args.push('--not-break-on-detections');

            if (core.isDebug()) {
                args.push('--logger-level');
                args.push('trace');
            }

            let sarifFile : string = path.join(process.env.GITHUB_WORKSPACE, '.gdn', 'msca.sarif');
            core.debug(`sarifFile = ${sarifFile}`);

            // Write it as a GitHub Action variable for follow up tasks to consume
            core.exportVariable('MSCA_SARIF_FILE', sarifFile);
            core.setOutput('sarifFile', sarifFile);

            args.push('--export-breaking-results-to-file');
            args.push(`${sarifFile}`);
        } catch (error) {
            error('Exception occurred while initializing MSCA:');
            error(error);
            core.setFailed(error);
            return;
        }

        try {
            core.debug('Running Microsoft Security Code Analysis...');

            await exec.exec(cliFilePath, args);

            // TODO: process exit codes
        } catch (error) {
            error(error);
            core.setFailed(error);
            return;
        }
    }
}