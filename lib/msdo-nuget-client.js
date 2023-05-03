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
exports.install = void 0;
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const core = __importStar(require("@actions/core"));
const AdmZip = require("adm-zip");
const common = __importStar(require("./msdo-common"));
function install(serviceIndexUrl, packageName, packageVersion, outputDirectory, accessToken = null) {
    return __awaiter(this, void 0, void 0, function* () {
        let response = yield getInstallationStatus(packageName, packageVersion, outputDirectory);
        if (response.inCache) {
            core.debug(`Package already installed: ${packageName} ${packageVersion}`);
        }
        else {
            let requestOptions = resolveRequestOptions(accessToken);
            core.debug(`Fetching service index for: ${serviceIndexUrl}`);
            let serviceIndex = yield requestJson(serviceIndexUrl, requestOptions);
            let resolvedVersion = packageVersion;
            if (common.isLatest(packageVersion)) {
                core.debug(`Resolving package name and version: ${packageName} ${packageVersion}`);
                resolvedVersion = yield resolveVersion(serviceIndex, requestOptions, packageName, packageVersion);
                response = yield getInstallationStatus(packageName, resolvedVersion, outputDirectory, true);
            }
            if (response.inCache) {
                core.debug(`Resolved package already installed: ${packageName} ${resolvedVersion}`);
            }
            else {
                core.debug(`Downloading package to: ${outputDirectory}`);
                let packagePath = yield downloadPackage(serviceIndex, requestOptions, packageName, resolvedVersion, outputDirectory);
                core.debug(`Extracting package: ${packagePath}`);
                yield extractPackage(packagePath);
                response['success'] = true;
                response['resolvedVersion'] = resolvedVersion;
                response['packageFolder'] = common.removeExtension(packagePath);
                response['packagePath'] = packagePath;
                if (common.isLatest(packageVersion)) {
                    core.exportVariable(getLatestEnviromentVariable(packageName, common.isLatestPreRelease(packageVersion)), resolvedVersion);
                }
            }
        }
        return response;
    });
}
exports.install = install;
function getLatestEnviromentVariable(packageName, isPreRelease) {
    let suffix = isPreRelease ? '_LATESTPRERELEASEVERSION' : '_LATESTVERSION';
    return `MSDO_${packageName.replace(/\./g, '').replace('-', '')}${suffix}`.toUpperCase();
}
function getInstallationStatus(packageName, packageVersion, outputDirectory, force = false) {
    return __awaiter(this, void 0, void 0, function* () {
        let response = {
            success: false,
            inCache: false,
            packageName: packageName,
            packageVersion: packageVersion
        };
        let checkInstall = true;
        if (!force) {
            const isLatest = common.isLatest(packageVersion);
            checkInstall = !isLatest;
            if (isLatest) {
                const isLatestPreRelease = common.isLatestPreRelease(packageVersion);
                const latestEnviromentVariable = getLatestEnviromentVariable(packageName, isLatestPreRelease);
                let cachedVersion = process.env[latestEnviromentVariable];
                if (!common.isNullOrWhiteSpace(cachedVersion)) {
                    packageVersion = cachedVersion;
                    checkInstall = true;
                }
            }
        }
        if (checkInstall) {
            const packagePath = getNuGetPackageFilePath(packageName, packageVersion, outputDirectory);
            const packageFolder = common.removeExtension(packagePath);
            const packageFolderExists = yield common.directoryExists(packageFolder);
            if (packageFolderExists) {
                response['success'] = true;
                response['inCache'] = true;
                response['resolvedVersion'] = packageVersion;
                response['packageFolder'] = packageFolder;
                response['packagePath'] = packagePath;
            }
        }
        return response;
    });
}
function resolveVersion(serviceIndex, requestOptions, packageName, packageVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        let resolvedVersion = packageVersion;
        if (common.isLatest(packageVersion)) {
            let serviceResponse = findService(serviceIndex, 'RegistrationsBaseUrl', ['3.6.0', '3.0.0-beta']);
            let serviceOptions = {
                packageName: packageName,
                packageVersion: packageVersion
            };
            resolvedVersion = yield callService(serviceResponse, requestOptions, serviceOptions, _resolveVersion);
        }
        core.debug(`resolvedVersion = ${resolvedVersion}`);
        return resolvedVersion;
    });
}
function _resolveVersion(service, requestOptions, serviceOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        let packageName = serviceOptions['packageName'];
        let packageVersion = serviceOptions['packageVersion'];
        let resolvedVersion = null;
        let searchQueryServiceUrlWithQuery = `${service['@id']}${packageName.toLowerCase()}/index.json`;
        let result = yield requestJson(searchQueryServiceUrlWithQuery, requestOptions);
        const findPreRelease = common.isLatestPreRelease(packageVersion);
        for (let packageGroup of result['items']) {
            for (let packageInfo of packageGroup['items']) {
                let catalogEntry = packageInfo['catalogEntry'];
                if (catalogEntry['listed'] != true) {
                    continue;
                }
                if (!findPreRelease && common.isPreRelease(catalogEntry['version'])) {
                    continue;
                }
                resolvedVersion = catalogEntry['version'];
                break;
            }
            if (resolvedVersion != null) {
                break;
            }
        }
        if (resolvedVersion == null) {
            throw new Error(`Package not found: ${packageName}`);
        }
        return resolvedVersion;
    });
}
function rampedDeployment(datetime, rampMinutes) {
    let ramped = false;
    let curDate = new Date();
    let diff = curDate.getTime() - datetime.getTime();
    datetime.setMinutes;
    return Math.random() > diff;
}
function downloadPackage(serviceIndex, requestOptions, packageName, resolvedVersion, outputDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        let serviceResponse = findService(serviceIndex, 'PackageBaseAddress', ['3.0.0']);
        let serviceOptions = {
            packageName: packageName,
            resolvedVersion: resolvedVersion,
            outputDirectory: outputDirectory
        };
        return yield callService(serviceResponse, requestOptions, serviceOptions, _downloadPackage);
    });
}
function _downloadPackage(service, requestOptions, serviceOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        const packageName = serviceOptions['packageName'];
        const resolvedVersion = serviceOptions['resolvedVersion'];
        const outputDirectory = serviceOptions['outputDirectory'];
        const packageNameLower = packageName.toLowerCase();
        const resolvedVersionLower = resolvedVersion.toLowerCase();
        const packageUrl = `${service['@id']}${packageNameLower}/${resolvedVersionLower}/${packageNameLower}.${resolvedVersionLower}.nupkg`;
        const destinationPath = getNuGetPackageFilePath(packageName, resolvedVersion, outputDirectory);
        yield downloadFile(packageUrl, requestOptions, destinationPath);
        if (!fs.existsSync(destinationPath)) {
            throw new Error(`The package could not be found after download: ${destinationPath}`);
        }
        return destinationPath;
    });
}
function getNuGetPackageFilePath(packageName, packageVersion, outputDirectory) {
    return path.join(outputDirectory, `${packageName}.${packageVersion}.nupkg`);
}
function extractPackage(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        let packageDirectory = common.removeExtension(filePath);
        let zip = new AdmZip(filePath);
        zip.extractAllTo(packageDirectory, true);
        yield enableOnLinux(packageDirectory);
    });
}
function findService(serviceIndex, serviceName, knownServiceVersions) {
    const response = {
        known: [],
        unknown: []
    };
    for (const service of serviceIndex["resources"]) {
        const serviceParts = service['@type'].split('/');
        if (serviceParts === undefined || serviceParts.length !== 2) {
            continue;
        }
        const _serviceName = serviceParts[0];
        const _serviceVersion = serviceParts[1];
        if (_serviceName === serviceName) {
            const serviceResponse = {
                '@id': service['@id'],
                '@type': service['@type'],
                'name': _serviceName,
                'version': _serviceVersion
            };
            if (knownServiceVersions.indexOf(_serviceVersion) > -1) {
                response.known.push(serviceResponse);
            }
            else {
                response.unknown.push(serviceResponse);
            }
        }
    }
    if (response.known.length === 0 && response.unknown.length === 0) {
        throw new Error(`Could not find service: ${serviceName}`);
    }
    return response;
}
function callService(serviceResponse, requestOptions, serviceOptions, serviceCall, serviceVersionCalls = null) {
    return __awaiter(this, void 0, void 0, function* () {
        let response;
        let services = serviceResponse.known;
        let isKnown = true;
        if (services === undefined || services.length === 0) {
            services = serviceResponse.unknown;
            isKnown = false;
        }
        let firstError;
        let i = 0;
        do {
            try {
                const service = services[i];
                let _serviceCall = serviceCall;
                if (serviceVersionCalls != null && serviceVersionCalls[service['version']] !== undefined) {
                    _serviceCall = serviceVersionCalls[service['version']];
                }
                response = yield _serviceCall(service, requestOptions, serviceOptions);
                break;
            }
            catch (error) {
                core.debug(`Failed to call service: ${error.message}`);
                if (firstError === undefined) {
                    firstError = error;
                }
                i += 1;
                if (i == services.length) {
                    if (isKnown) {
                        isKnown = false;
                        core.debug('Attempting to call unknown service type versions...');
                        services = serviceResponse.unknown;
                        if (services === undefined || services.length === 0) {
                            throw firstError;
                        }
                        i = 0;
                    }
                    else {
                        throw firstError;
                    }
                }
            }
        } while (true);
        return response;
    });
}
function resolveRequestOptions(accessToken) {
    let options = {
        method: 'GET',
        timeout: 2500,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (!common.isNullOrWhiteSpace(accessToken)) {
        options['auth'] = `:${accessToken}`;
    }
    return options;
}
function requestJson(url, options) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            core.debug(`${options['method'].toUpperCase()} ${url}`);
            const req = https.request(url, options, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to call: ${url}. Status code: ${res.statusCode}`));
                    return;
                }
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk.toString();
                });
                res.on('end', () => {
                    let jsonData;
                    try {
                        jsonData = JSON.parse(data);
                    }
                    catch (error) {
                        reject(new Error(`Failed to parse JSON: ${data}`));
                        return;
                    }
                    resolve(jsonData);
                });
            });
            req.on('error', (error) => {
                reject(new Error(`Error calling url: ${error}`));
            });
            req.end();
        });
    });
}
function downloadFile(url, options, destinationPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            try {
                const req = https.request(url, options, (res) => __awaiter(this, void 0, void 0, function* () {
                    if (res.statusCode === 303) {
                        let redirectUrl = res.headers['location'];
                        options['auth'] = null;
                        yield downloadFile(redirectUrl, options, destinationPath);
                        resolve();
                        return;
                    }
                    if (res.statusCode !== 200) {
                        reject(new Error(`Failed to download file: ${url}. Status code: ${res.statusCode}`));
                        return;
                    }
                    const file = fs.createWriteStream(destinationPath);
                    res.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }));
                req.on('error', (error) => {
                    reject(new Error(`Error downloading url: ${error}`));
                });
                req.end();
            }
            catch (error) {
                if (error.Message.contains("Error dwonloading url")) {
                    reject(error);
                }
                else {
                    reject(new Error(`Error downloading url: ${error}`));
                }
            }
        });
    });
}
function enableOnLinux(folderPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            if (process.platform != 'linux') {
                resolve();
                return;
            }
            const entries = fs.readdirSync(folderPath);
            const tasks = entries.map((entry) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const entryPath = path.join(folderPath, entry);
                    const stats = fs.statSync(entryPath);
                    if (stats.isFile()) {
                        try {
                            fs.chmodSync(entryPath, 0o755);
                            core.debug(`0o755 permission set for: ${entryPath}`);
                        }
                        catch (error) {
                            core.debug(`Error setting executable permission: ${error.message}`);
                        }
                    }
                    else if (stats.isDirectory()) {
                        yield enableOnLinux(entryPath);
                    }
                }
                catch (error) {
                    reject(new Error(`Error getting file stats: ${error.message}`));
                }
            }));
            yield Promise.all(tasks);
            resolve();
        }));
    });
}
