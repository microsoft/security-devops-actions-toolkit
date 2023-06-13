import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as core from '@actions/core';
import AdmZip = require('adm-zip');
import * as common from './msdo-common';

/**
 * The default number of times to retry downloading a file.
 */
const _defaultFileDownloadRetries = 2;

/**
 * The default delay in milliseconds between file download retries.
 */
const _defaultFileDownloadRetryDelayMs = 1000;

/**
 * Information about an installed nuget package
 */
export interface InstallNuGetPackageResponse {
    success: boolean,
    inCache?: boolean,
    packageName: string,
    packageVersion: string,
    resolvedVersion?: string,
    packageFolder?: string,
    packagePath?: string
}

/**
 * The response type when finding a service from the Service Index
 * This format is used by callService() to attempt to use all service endpoints,
 * known and unknown, to ensure service resiliency
 */
export interface FindServiceResponse {
    known: NuGetServiceResource[],
    unknown: NuGetServiceResource[]
}

/**
 * An extended format of the Service Index's resource object,
 * splitting out the name and version from @type for easier processing
 */
export interface NuGetServiceResource {
    '@id': string,
    '@type': string,
    'name': string,
    'version': string
}

/**
 * Installs a NuGet package from a NuGet server starting at the service index url.
 * 
 * @param serviceIndexUrl - The url to the service index of the NuGet server to install from
 * @param packageName - The name of the package to install
 * @param packageVersion - The version of the package to install, accepts exact values or "Latest" and "LatestPreRelease" respectively.
 * @param outputDirectory - The directory to install the package to
 * @param accessToken - (optional) The access token to use when authenticating to the NuGet server
 * @returns An object with information about the installed package.
 */
export async function install(
    serviceIndexUrl: string,
    packageName: string,
    packageVersion: string,
    outputDirectory: string,
    accessToken: string = null): Promise<InstallNuGetPackageResponse> {

    let response = await getInstallationStatus(packageName, packageVersion, outputDirectory);
    
    if (response.inCache) {
        core.debug(`Package already installed: ${packageName} ${packageVersion}`);
    } else {
        let requestOptions = resolveRequestOptions(accessToken);
        
        core.debug(`Fetching service index for: ${serviceIndexUrl}`);
        let serviceIndex = await requestJson(serviceIndexUrl, requestOptions);

        let resolvedVersion = packageVersion;
        if (common.isLatest(packageVersion)) {
            core.debug(`Resolving package name and version: ${packageName} ${packageVersion}`);
            resolvedVersion = await resolveVersion(serviceIndex, requestOptions, packageName, packageVersion);
            response = await getInstallationStatus(packageName, resolvedVersion, outputDirectory, true);
        }

        if (response.inCache) {
            core.debug(`Resolved package already installed: ${packageName} ${resolvedVersion}`);
        } else {
            core.debug(`Downloading package to: ${outputDirectory}`);
            let packagePath = await downloadPackage(serviceIndex, requestOptions, packageName, resolvedVersion, outputDirectory);

            // extract the package
            core.debug(`Extracting package: ${packagePath}`);
            await extractPackage(packagePath);

            response['success'] = true;
            response['resolvedVersion'] = resolvedVersion;
            response['packageFolder'] = common.removeExtension(packagePath);
            response['packagePath'] = packagePath;
            
            // set an environment variable to the resolved version
            if (common.isLatest(packageVersion)) {
                core.exportVariable(getLatestEnviromentVariable(packageName, common.isLatestPreRelease(packageVersion)), resolvedVersion);
            }
        }
    }

    return response;
}

/**
 * Generates a unique environment variable for a nuget package name for it's latest version
 * 
 * @param packageName - The name of the package to generate an environment variable for
 * @returns The environment variable name
 */
function getLatestEnviromentVariable(packageName: string, isPreRelease: boolean): string {
    let suffix = isPreRelease ? '_LATESTPRERELEASEVERSION' : '_LATESTVERSION';
    return `MSDO_${packageName.replace(/\./g, '').replace('-', '')}${suffix}`.toUpperCase();
}

/**
 * Checks if a NuGet package is installed.
 * 
 * @param packageName - The name of the package to check
 * @param packageVersion - The version of the package to check
 * @param outputDirectory - The directory to check for the package
 * @returns An object with information about the installed package.
 */
async function getInstallationStatus(
    packageName: string,
    packageVersion: string,
    outputDirectory: string,
    force: boolean = false): Promise<InstallNuGetPackageResponse> {
    let response = {
        success: false,
        inCache: false,
        packageName: packageName,
        packageVersion: packageVersion
    };

    let checkInstall = true;

    if (!force) {
        // If latest, see if it's already been installed in a previous build step
        const isLatest = common.isLatest(packageVersion);

        // Only check if an exact version is installed
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
        const packageFolderExists = await common.directoryExists(packageFolder);
        if (packageFolderExists) {
            response['success'] = true;
            response['inCache'] = true;
            response['resolvedVersion'] = packageVersion;
            response['packageFolder'] = packageFolder;
            response['packagePath'] = packagePath;
        }
    }

    return response;
}

/**
 * Top level service call to resolve a package version from a NuGet server.
 * 
 * @param serviceIndex - The response from calling the index.json entry point of a NuGet server
 * @param requestOptions - The request options to use when calling the NuGet server, including authentication
 * @param packageName - The name of the package to resolve
 * @param packageVersion - The version of the package to resolve, accepts exact values or "Latest" and "LatestPreRelease" respectively.
 * @returns If an exact version is requested, it will be returned. If the requested version is undefined, null, 'latest' or 'latest-prerelease', it calls the NuGet Server's SearchQueryService to find a real version.
 */
async function resolveVersion(
    serviceIndex: Object,
    requestOptions: Object,
    packageName: string,
    packageVersion: string): Promise<string> {

    let resolvedVersion = packageVersion;

    if (common.isLatest(packageVersion)) {
        let serviceResponse: FindServiceResponse = findService(serviceIndex, 'RegistrationsBaseUrl', ['3.6.0', '3.0.0-beta']);
        let serviceOptions = {
            packageName: packageName,
            packageVersion: packageVersion
        };
        resolvedVersion = await callService(serviceResponse, requestOptions, serviceOptions, _resolveVersion);
    }

    core.debug(`resolvedVersion = ${resolvedVersion}`);
    return resolvedVersion;
}

/**
 * Business logic to call a single SearchQueryService endpoint to resolve a package version.
 * 
 * @param service - The service to call
 * @param serviceOptions - Input options boxed in an object to be wrapped around multiple calls for service resiliency
 * @returns The resolved version of the package.
 */
async function _resolveVersion(
    service: NuGetServiceResource,
    requestOptions: Object,
    serviceOptions: Object): Promise<any> {
    // unbox input parmaeters
    let packageName = serviceOptions['packageName'];
    let packageVersion = serviceOptions['packageVersion'];

    let resolvedVersion = null;

    let searchQueryServiceUrlWithQuery = `${service['@id']}${packageName.toLowerCase()}/index.json`;

    let result = await requestJson(searchQueryServiceUrlWithQuery, requestOptions);
    const findPreRelease = common.isLatestPreRelease(packageVersion);

    for (let packageGroup of result['items']) {
        for (let packageInfo of packageGroup['items']) {
            let catalogEntry = packageInfo['catalogEntry'];
            if (catalogEntry['listed'] != true) {
                // skip delisted packages
                continue;
            }

            if (!findPreRelease && common.isPreRelease(catalogEntry['version'])) {
                // skip prerelease packages if we're looking for a stable version
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
}

function rampedDeployment(
    datetime: Date,
    rampMinutes: number): boolean {
    let ramped = false;

    let curDate = new Date();

    let diff = curDate.getTime() - datetime.getTime();

    datetime.setMinutes
    
    
    return Math.random() > diff;
}

/**
 * Top level service call to download a package from a NuGet server.
 * 
 * @param serviceIndex - The response from calling the index.json entry point of a NuGet server
 * @param requestOptions  - The request options to use when calling the NuGet server, including authentication
 * @param packageName - The name of the package to download
 * @param resolvedVersion - The version of the package to download
 * @param outputDirectory - The directory to download the package to
 * @returns The path to the downloaded package
 */
async function downloadPackage(
    serviceIndex: Object,
    requestOptions: Object,
    packageName: string,
    resolvedVersion: string,
    outputDirectory: string): Promise<string> {

    let serviceResponse: FindServiceResponse = findService(serviceIndex, 'PackageBaseAddress', ['3.0.0']);
    let serviceOptions = {
        packageName: packageName,
        resolvedVersion: resolvedVersion,
        outputDirectory: outputDirectory
    };
    return await callService(serviceResponse, requestOptions, serviceOptions, _downloadPackage);
}

/**
 * Business logic to call download a package from a NuGet server.
 * 
 * @param service - The service to call
 * @param serviceOptions - Input options boxed in an object to be wrapped around multiple calls for service resiliency
 * @returns The path to the downloaded package
 */
async function _downloadPackage(
    service: NuGetServiceResource,
    requestOptions: Object,
    serviceOptions: Object): Promise<any> {
    // unbox input parameters
    const packageName = serviceOptions['packageName'];
    const resolvedVersion = serviceOptions['resolvedVersion'];
    const outputDirectory = serviceOptions['outputDirectory'];

    const packageNameLower = packageName.toLowerCase();
    const resolvedVersionLower = resolvedVersion.toLowerCase();
    const packageUrl = `${service['@id']}${packageNameLower}/${resolvedVersionLower}/${packageNameLower}.${resolvedVersionLower}.nupkg`;

    const destinationPath = getNuGetPackageFilePath(packageName, resolvedVersion, outputDirectory);

    await downloadFile(packageUrl, requestOptions, destinationPath);

    // if the package is not found, throw an error
    if (!fs.existsSync(destinationPath)) {
        throw new Error(`The package could not be found after download: ${destinationPath}`);
    }

    return destinationPath;
}

/**
 * Given a package name and version, returns the path to the downloaded package.
 * 
 * @param packageName - The name of the package to download
 * @param packageVersion - The version of the package to download
 * @param outputDirectory - The directory to download the package to
 * @returns A path to the downloaded package
 */
function getNuGetPackageFilePath(
    packageName: string,
    packageVersion: string,
    outputDirectory: string): string {
    return path.join(outputDirectory, `${packageName}.${packageVersion}.nupkg`);
}

/**
 * Extracts the input file path to a directory matching the file name without the extension.
 * 
 * @param filePath - The path to the package to extract
 */
async function extractPackage(filePath: string): Promise<void> {
    let packageDirectory = common.removeExtension(filePath);
    let zip = new AdmZip(filePath);
    zip.extractAllTo(packageDirectory, true);
    await enableOnLinux(packageDirectory);
}

/**
 * Given the input service index response of a NuGet server, find all services of the given service name.
 * 
 * @param serviceIndex - The response from calling the index.json entry point of a NuGet server
 * @param serviceName - The name of the service to find
 * @param knownServiceVersions - Versions of the service we know about
 */
function findService(
    serviceIndex: Object,
    serviceName: string,
    knownServiceVersions: string[]): FindServiceResponse {

    // initialize the response
    const response: FindServiceResponse = {
        known: [],
        unknown: []
    };
    
    for (const service of serviceIndex["resources"]) {
        const serviceParts = service['@type'].split('/');
        
        if (serviceParts === undefined || serviceParts.length !== 2) {
            // skip this service
            continue;
        }

        const _serviceName = serviceParts[0];
        const _serviceVersion = serviceParts[1];
        
        if (_serviceName === serviceName) {
            // create the service response
            // splitting out name and version for later processing
            // it will either be added to known or unknown
            const serviceResponse = {
                '@id': service['@id'],
                '@type': service['@type'],
                'name': _serviceName,
                'version': _serviceVersion
            };

            // see if we know about this version
            if (knownServiceVersions.indexOf(_serviceVersion) > -1) {
                response.known.push(serviceResponse);
            } else {
                response.unknown.push(serviceResponse);
            }
        }
    }

    if (response.known.length === 0 && response.unknown.length === 0) {
        throw new Error(`Could not find service: ${serviceName}`);
    }

    return response;
}

/**
 * Interface for the business logic calls to services to be called by the
 * callService wrapper function to ensure service resiliency.
 */
interface ServiceVersionCalls {
    [version: string]: (service: NuGetServiceResource, requestOptions: Object, serviceOptions: Object) => Promise<any>;
}

/**
 * Calls all known service versions until one succeeds.
 * If none of those succeeds, it attempts to call all unknown service versions.
 * This is to provide service resiliency, allowing the server to make version updates
 * without breaking the client code.
 * It also provides prioritization of known versions over unknown versions.
 * 
 * @param serviceResponse - The response from calling the findService function
 * @param requestOptions - The request options to use when calling the NuGet server, including authentication
 * @param serviceOptions - Input options boxed in an object to be wrapped around multiple calls for service resiliency
 * @param serviceCall - The business logic call to the service
 * @param serviceVersionCalls - The business logic calls to the service for each known version
 * @returns 
 */
async function callService(
    serviceResponse: FindServiceResponse,
    requestOptions: Object,
    serviceOptions: Object,
    serviceCall: (service: NuGetServiceResource, requestOptions: Object, serviceOptions: Object) => Promise<any>,
    serviceVersionCalls: ServiceVersionCalls = null): Promise<any> {

    let response: any;

    let services = serviceResponse.known;
    let isKnown = true;
    if (services === undefined || services.length === 0) {
        services = serviceResponse.unknown;
        isKnown = false;
    }
    let firstError: Error;

    let i = 0;

    // try each known service until we find one that works
    // then try each unknown service until we find one that works
    do {
        try {
            const service = services[i];

            let _serviceCall: (service: NuGetServiceResource, requestOptions: Object, serviceOptions: Object) => Promise<any> = serviceCall;
            if (serviceVersionCalls != null && serviceVersionCalls[service['version']] !== undefined) {
                _serviceCall = serviceVersionCalls[service['version']];
            }

            response = await _serviceCall(service, requestOptions, serviceOptions);
            break;
        } catch (error) {
            core.debug(`Failed to call service: ${error.message}`);

            if (firstError === undefined) {
                firstError = error;
            }

            i += 1;

            if (i == services.length) {
                if (isKnown) {
                    isKnown = false;
                    // try unknown services
                    core.debug('Attempting to call unknown service type versions...');
                    services = serviceResponse.unknown;
                    if (services === undefined || services.length === 0) {
                        throw firstError;
                    }
                    i = 0;
                } else {
                    // rethrow the first error we saw
                    // if known services were attempted, it will throw the error from the known service
                    throw firstError;
                }
            }
        }
    } while (true)

    return response;
}

/**
 * Resolves https request options.
 * 
 * @param accessToken - (Optional) The access token to use when calling the NuGet server
 * @returns Https request options.
 */
function resolveRequestOptions(accessToken: string): Object {
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

/**
 * Calls an https endpoint and returns the response as a JSON object.
 * 
 * @param url - The url to call
 * @param options - The request options to use when calling the NuGet server, including authentication
 * @returns The response as a JSON object.
 */
async function requestJson(url: string, options: Object): Promise<Object> {
    return new Promise((resolve, reject) => {
        core.debug(`${options['method'].toUpperCase()} ${url}`);
        const req = https.request(url, options, async (res) => {
            // decompress the response if it's gzipped
            const decompressResponse = await import('decompress-response');
            res = decompressResponse.default(res);

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
                } catch (error) {
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
}

/**
 * Downloads a file from a url.
 * Will follow 303 redirects.
 * 
 * @param url - The url to download the file from
 * @param options - The request options to use when calling the NuGet server, including authentication
 * @param destinationPath - The path to download the file to
 */
async function downloadFile(
    url: string,
    options: Object,
    destinationPath: string,
    retries: number = _defaultFileDownloadRetries,
    retryDelay: number = _defaultFileDownloadRetryDelayMs): Promise<void> {
    return new Promise(async (resolve, reject) => {
        let errors: Error[] = [];
        do {
            try {
                await _downloadFile(url, options, destinationPath);
                resolve();
                return;
            } catch (error) {
                errors.push(error);
                if (retries > 0) {
                    core.debug(`Error downloading url: ${error.message}`);
                    core.debug(`Retrying download of url: ${url}`);
                    await common.sleep(retryDelay);
                }
            }
        } while (retries-- > 0);

        reject(new Error(`Error downloading url: ${errors[0] || url}`));
    });
}

/**
 * Downloads a file from a url.
 * Will follow 303 redirects.
 * 
 * @param url - The url to download the file from
 * @param options - The request options to use when calling the NuGet server, including authentication
 * @param destinationPath - The path to download the file to
 */
async function _downloadFile(
    url: string,
    options: Object,
    destinationPath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const req = https.request(url, options, async (res) => {
            if (res.statusCode === 303) {
                let redirectUrl = res.headers['location'];
                options['auth'] = null;
                await downloadFile(redirectUrl, options, destinationPath);
                resolve();
                return;
            }
            
            if (res.statusCode !== 200) {
                reject(`Failed to download file: ${url}. Status code: ${res.statusCode}`);
                return;
            }

            const file = fs.createWriteStream(destinationPath);
            res.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        });

        req.on('error', (error) => {
            reject(error);
        });
        
        req.end();
    });
}

/**
 * Runs chmod 0o755 on all files within the folder if the platform is "linux"
 * 
 * @param folderPath - The path to the folder to enable executables on
 */
async function enableOnLinux(folderPath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
        if (process.platform != 'linux') {
            resolve();
            return;
        }

        const entries = fs.readdirSync(folderPath);

        const tasks = entries.map(async (entry) => {
            try {
                const entryPath = path.join(folderPath, entry);
                const stats = fs.statSync(entryPath);

                if (stats.isFile()) {
                    try {
                        fs.chmodSync(entryPath, 0o755);
                        core.debug(`0o755 permission set for: ${entryPath}`);
                    } catch (error) {
                        core.debug(`Error setting executable permission: ${error.message}`);
                    }
                } else if (stats.isDirectory()) {
                    await enableOnLinux(entryPath);
                }
            } catch (error) {
                reject(new Error(`Error getting file stats: ${error.message}`));
            }
        });

        await Promise.all(tasks);
        resolve();
    });
}