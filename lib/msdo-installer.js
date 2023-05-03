"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MsdoInstaller = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const core = __importStar(require("@actions/core"));
const common = __importStar(require("./msdo-common"));
const nuget = __importStar(require("./msdo-nuget-client"));
class MsdoInstaller {
    install(cliVersion) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Installing Microsoft Security DevOps Cli version: ${cliVersion}`);
            if (process.env.MSDO_FILEPATH) {
                console.log(`MSDO CLI File Path overriden by %MSDO_FILEPATH%: ${process.env.MSDO_FILEPATH}`);
                return;
            }
            if (process.env.MSDO_DIRECTORY) {
                console.log(`MSDO CLI Directory overriden by %MSDO_DIRECTORY%: ${process.env.MSDO_DIRECTORY}`);
                let msdoFilePath = path.join(process.env.MSDO_DIRECTORY, 'guardian');
                core.debug(`msdoFilePath = ${msdoFilePath}`);
                process.env.MSDO_FILEPATH = msdoFilePath;
                return;
            }
            let packageName = 'microsoft.security.devops.cli';
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
            let response;
            do {
                failed = false;
                try {
                    response = yield nuget.install(serviceIndexUrl, packageName, cliVersion, msdoVersionsDirectory);
                }
                catch (error) {
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
                }
                else {
                    console.log(`Installed ${packageName} version ${response.resolvedVersion}`);
                }
            }
            else {
                throw new Error('Failed to install the MSDO CLI nuget package.');
            }
            this.setVariables(msdoVersionsDirectory, packageName, response.resolvedVersion, true);
        });
    }
    isInstalled(versionsDirectory, packageName, cliVersion) {
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
    setVariables(versionsDirectory, packageName, cliVersion, validate = false) {
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
exports.MsdoInstaller = MsdoInstaller;
